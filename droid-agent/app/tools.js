import { readFile } from 'fs/promises';
import { exec } from 'child_process';
import { writeMemory } from './memory.js';
import { getMcpTools, callMcpTool } from './mcp-client.js';

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+\//,
  /DROP\s+TABLE/i,
  /DELETE\s+FROM\s+\w+\s*;/i,
  /mkfs/,
  /dd\s+if=/,
  /shutdown/,
  /reboot/,
  /:\s*\(\s*\)\s*\{/
];

let toolsCache = null;

export async function loadTools() {
  try {
    const content = await readFile('/app/config/mcp.json', 'utf-8');
    const config = JSON.parse(content);
    toolsCache = config;
    return config.tools || [];
  } catch {
    return [];
  }
}

// Get MCP tools from running MCP servers
export function loadMcpTools() {
  return getMcpTools();
}

// Get all tools (built-in + MCP) for the system prompt
export async function loadAllTools() {
  const builtIn = await loadTools();
  const mcp = getMcpTools();
  return { builtIn, mcp };
}

function truncate(text, maxLen = 32000) {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + `\n[output truncated, showing first ${maxLen} of ${text.length} chars]`;
}

async function executeShell(command, timeout = 60000) {
  if (!toolsCache) await loadTools();
  const allowed = toolsCache?.allowed_dangerous || [];

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      const patternStr = pattern.toString();
      if (!allowed.includes(patternStr)) {
        return `BLOCKED: command matched dangerous pattern ${patternStr}. Add to allowed_dangerous in mcp.json to override.`;
      }
    }
  }

  return new Promise((resolve) => {
    exec(command, {
      timeout,
      shell: '/bin/bash',
      maxBuffer: 10 * 1024 * 1024,
      env: {
        ...process.env,
        HOME: '/root',
        KUBECONFIG: process.env.KUBECONFIG || '/root/.kube/config',
        PATH: `/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/google-cloud-sdk/bin:${process.env.PATH || ''}`
      }
    }, (error, stdout, stderr) => {
      const output = (stdout || '') + (stderr ? (stdout ? '\n' : '') + stderr : '');
      if (error && !output) {
        resolve(`Error: ${error.message}`);
      } else {
        resolve(truncate(output));
      }
    });
  });
}

async function executeHttpGet(url, headers = {}, timeout = 10000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) {
      return `HTTP error: ${response.status} ${response.statusText}`;
    }
    const text = await response.text();
    return truncate(text);
  } catch (err) {
    return `HTTP error: ${err.message}`;
  }
}

async function executeReadFile(path) {
  try {
    const content = await readFile(path, 'utf-8');
    return truncate(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return `File not found: ${path}`;
    }
    return `Error reading file: ${err.message}`;
  }
}

async function executeMemoryWrite(path, content) {
  try {
    const result = await writeMemory(path, content);
    return `Written ${result.bytes} bytes to memory/${result.path}`;
  } catch (err) {
    return `Error writing memory: ${err.message}`;
  }
}

// Exported for testing
export { DANGEROUS_PATTERNS, truncate };

export async function executeTool(toolName, args) {
  try {
    // Check built-in tools first
    const tools = await loadTools();
    const tool = tools.find(t => t.name === toolName);

    if (tool) {
      const timeout = (tool.timeout || 60) * 1000;
      switch (tool.executor) {
        case 'shell':
          return await executeShell(args.command, timeout);
        case 'http_get':
          return await executeHttpGet(args.url, args.headers, timeout);
        case 'read_file':
          return await executeReadFile(args.path);
        case 'memory_write':
          return await executeMemoryWrite(args.path, args.content);
        default:
          return `Unknown executor: ${tool.executor}`;
      }
    }

    // Check MCP server tools
    const mcpTools = getMcpTools();
    const mcpTool = mcpTools.find(t => t.name === toolName);
    if (mcpTool) {
      console.log(`[mcp] Calling ${mcpTool.server}/${toolName}`);
      return await callMcpTool(toolName, args);
    }

    // Fallback built-in names
    switch (toolName) {
      case 'run_shell':
        return await executeShell(args.command);
      case 'fetch_url':
        return await executeHttpGet(args.url, args.headers);
      case 'read_file':
        return await executeReadFile(args.path);
      case 'write_memory':
        return await executeMemoryWrite(args.path, args.content);
      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (err) {
    return `Tool execution error: ${err.message}`;
  }
}
