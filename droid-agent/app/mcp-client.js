import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { EventEmitter } from 'events';

// Minimal MCP client — speaks JSON-RPC 2.0 over stdio to MCP servers

class McpServer extends EventEmitter {
  constructor(name, config) {
    super();
    this.name = name;
    this.config = config;
    this.process = null;
    this.tools = [];
    this.ready = false;
    this.requestId = 0;
    this.pending = new Map();
    this.buffer = '';
  }

  async start() {
    const { command, args = [], env = {} } = this.config;

    console.log(`[mcp:${this.name}] Starting: ${command} ${args.join(' ')}`);

    this.process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env }
    });

    this.process.stdout.on('data', (data) => this._onData(data));
    this.process.stderr.on('data', (data) => {
      console.log(`[mcp:${this.name}:stderr] ${data.toString().trim()}`);
    });

    this.process.on('error', (err) => {
      console.error(`[mcp:${this.name}] Process error: ${err.message}`);
      this.ready = false;
    });

    this.process.on('exit', (code) => {
      console.log(`[mcp:${this.name}] Process exited with code ${code}`);
      this.ready = false;
    });

    // Initialize MCP handshake
    try {
      await this._initialize();
      await this._listTools();
      this.ready = true;
      console.log(`[mcp:${this.name}] Ready — ${this.tools.length} tools: ${this.tools.map(t => t.name).join(', ')}`);
    } catch (err) {
      console.error(`[mcp:${this.name}] Init failed: ${err.message}`);
      this.stop();
    }
  }

  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.ready = false;
    this.tools = [];
  }

  async _initialize() {
    const result = await this._request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'droid-agent', version: '1.0.0' }
    });

    // Send initialized notification
    this._notify('notifications/initialized', {});
    return result;
  }

  async _listTools() {
    const result = await this._request('tools/list', {});
    this.tools = result.tools || [];
  }

  async callTool(toolName, args) {
    if (!this.ready) return `MCP server ${this.name} is not ready`;
    try {
      const result = await this._request('tools/call', {
        name: toolName,
        arguments: args || {}
      });

      // MCP tool results are content arrays
      if (result.content && Array.isArray(result.content)) {
        return result.content
          .map(c => c.type === 'text' ? c.text : JSON.stringify(c))
          .join('\n');
      }
      return JSON.stringify(result, null, 2);
    } catch (err) {
      return `MCP tool error: ${err.message}`;
    }
  }

  _request(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout waiting for ${method}`));
      }, 30000);

      this.pending.set(id, { resolve, reject, timeout });
      this._send({ jsonrpc: '2.0', id, method, params });
    });
  }

  _notify(method, params) {
    this._send({ jsonrpc: '2.0', method, params });
  }

  _send(msg) {
    if (!this.process?.stdin?.writable) return;
    const json = JSON.stringify(msg);
    this.process.stdin.write(json + '\n');
  }

  _onData(data) {
    this.buffer += data.toString();

    while (true) {
      // Try LSP-style framing first: Content-Length: N\r\n\r\n{...}
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd !== -1) {
        const header = this.buffer.substring(0, headerEnd);
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (match) {
          const contentLength = parseInt(match[1]);
          const bodyStart = headerEnd + 4;
          if (this.buffer.length < bodyStart + contentLength) break;
          const body = this.buffer.substring(bodyStart, bodyStart + contentLength);
          this.buffer = this.buffer.substring(bodyStart + contentLength);
          this._handleMessage(body);
          continue;
        }
      }

      // Raw JSON lines (newline-delimited)
      const lineEnd = this.buffer.indexOf('\n');
      if (lineEnd === -1) break;
      const line = this.buffer.substring(0, lineEnd).trim();
      this.buffer = this.buffer.substring(lineEnd + 1);
      if (line) this._handleMessage(line);
    }
  }

  _handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject, timeout } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      clearTimeout(timeout);

      if (msg.error) {
        reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      } else {
        resolve(msg.result);
      }
    }
  }
}

// ── HTTP MCP Server (Streamable HTTP transport) ──

class McpHttpServer {
  constructor(name, config) {
    this.name = name;
    this.url = config.url;
    this.headers = config.headers || {};
    this.tools = [];
    this.ready = false;
  }

  async start() {
    console.log(`[mcp:${this.name}] Connecting to HTTP server: ${this.url}`);
    try {
      // Initialize
      await this._request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'droid-agent', version: '1.0.0' }
      });

      // Send initialized notification
      await this._notify('notifications/initialized', {});

      // List tools
      const result = await this._request('tools/list', {});
      this.tools = result.tools || [];
      this.ready = true;
      console.log(`[mcp:${this.name}] Ready — ${this.tools.length} tools: ${this.tools.map(t => t.name).join(', ')}`);
    } catch (err) {
      console.error(`[mcp:${this.name}] HTTP init failed: ${err.message}`);
    }
  }

  stop() {
    this.ready = false;
    this.tools = [];
  }

  async callTool(toolName, args) {
    if (!this.ready) return `MCP server ${this.name} is not ready`;
    try {
      const result = await this._request('tools/call', {
        name: toolName,
        arguments: args || {}
      });

      if (result.content && Array.isArray(result.content)) {
        return result.content
          .map(c => c.type === 'text' ? c.text : JSON.stringify(c))
          .join('\n');
      }
      return JSON.stringify(result, null, 2);
    } catch (err) {
      return `MCP tool error: ${err.message}`;
    }
  }

  async _request(method, params) {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    });

    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers
      },
      body
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    }

    const contentType = res.headers.get('content-type') || '';

    // Handle JSON response
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return data.result;
    }

    // Handle SSE response (some servers stream results)
    if (contentType.includes('text/event-stream')) {
      const text = await res.text();
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.result) return data.result;
          if (data.error) throw new Error(data.error.message);
        } catch { /* continue */ }
      }
      throw new Error('No result in SSE stream');
    }

    // Fallback: try parsing as JSON
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.result;
  }

  async _notify(method, params) {
    try {
      await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers
        },
        body: JSON.stringify({ jsonrpc: '2.0', method, params })
      });
    } catch { /* notifications are fire-and-forget */ }
  }
}

// ── Manager: spawns and manages all enabled MCP servers ──

const servers = new Map();
const allConfiguredServers = [];

export async function initMcpServers() {
  let config;
  try {
    const content = await readFile('/app/config/mcp.json', 'utf-8');
    config = JSON.parse(content);
  } catch {
    console.log('[mcp] No mcp.json found or invalid JSON');
    return;
  }

  const mcpServers = config.mcpServers || {};

  for (const [name, serverConfig] of Object.entries(mcpServers)) {
    if (name === '_readme') continue;
    if (!serverConfig.enabled) continue;

    const entry = {
      name,
      type: (serverConfig.type === 'http' && serverConfig.url) ? 'http' : 'stdio',
      command: serverConfig.command || null,
      url: serverConfig.url || null,
      status: 'connecting',
      error: null
    };
    allConfiguredServers.push(entry);

    if (serverConfig.type === 'http' && serverConfig.url) {
      const httpServer = new McpHttpServer(name, serverConfig);
      servers.set(name, httpServer);
      try {
        await httpServer.start();
        entry.status = httpServer.ready ? 'connected' : 'failed';
        if (!httpServer.ready) entry.error = 'Init failed';
      } catch (err) {
        console.error(`[mcp:${name}] HTTP init failed: ${err.message}`);
        entry.status = 'failed';
        entry.error = err.message;
      }
    } else if (serverConfig.command) {
      const server = new McpServer(name, serverConfig);
      servers.set(name, server);
      try {
        await server.start();
        entry.status = server.ready ? 'connected' : 'failed';
        if (!server.ready) entry.error = 'Init failed';
      } catch (err) {
        console.error(`[mcp:${name}] Failed to start: ${err.message}`);
        entry.status = 'failed';
        entry.error = err.message;
      }
    }
  }

  const active = [...servers.values()].filter(s => s.ready);
  console.log(`[mcp] ${active.length} MCP server(s) active`);
}

export function getAllConfiguredServers() {
  return allConfiguredServers;
}

export function getMcpTools() {
  const tools = [];
  for (const [serverName, server] of servers) {
    if (!server.ready) continue;
    for (const tool of server.tools) {
      tools.push({
        name: tool.name,
        description: `[${serverName}] ${tool.description || ''}`,
        server: serverName,
        inputSchema: tool.inputSchema
      });
    }
  }
  return tools;
}

export async function callMcpTool(toolName, args) {
  for (const [, server] of servers) {
    if (!server.ready) continue;
    const tool = server.tools.find(t => t.name === toolName);
    if (tool) {
      return await server.callTool(toolName, args);
    }
  }
  return `Unknown MCP tool: ${toolName}`;
}

export function getMcpServerCount() {
  return [...servers.values()].filter(s => s.ready).length;
}

export function getMcpServerDetails() {
  const details = [];
  for (const [name, server] of servers) {
    details.push({
      name,
      ready: server.ready,
      type: server.url ? 'http' : 'stdio',
      toolCount: server.tools.length,
      tools: server.tools.map(t => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || null
      }))
    });
  }
  return details;
}

export function stopAllMcpServers() {
  for (const [, server] of servers) {
    server.stop();
  }
  servers.clear();
}
