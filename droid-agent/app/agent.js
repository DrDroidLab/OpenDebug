import { loadSkills, loadSkill } from './skills.js';
import { readAllMemory, readMemory, writeMemory } from './memory.js';
import { loadTools, loadMcpTools, executeTool } from './tools.js';
import { getConversation, saveConversation } from './redis.js';
import { logToolExecution, logIncident, upsertConversation, saveMessage, getRecentFeedback } from './db.js';
import { createCompletion, buildImageContent, getProviderName, getModelId } from './provider.js';

const MAX_TOOL_ITERATIONS = 10;
const MAX_SYNC_ITERATIONS = 40;
const MAX_TOKENS = 4096;
const MEMORY_CHAR_LIMIT = 80000;

// ── Logging helper: emits to EventEmitter + always console.log ──
function log(emitter, type, data) {
  const ts = new Date().toISOString().substring(11, 23);
  const line = typeof data === 'string' ? data : (data.message || data.text || JSON.stringify(data));

  // Always write to stdout (pod logs)
  console.log(`[${ts}][${type}] ${line}`);

  // Emit to SSE/frontend if emitter is provided
  if (emitter) {
    emitter.emit('agent', { type, ts, ...( typeof data === 'string' ? { message: data } : data ) });
  }
}

async function buildSystemPrompt(emitter) {
  log(emitter, 'thinking', 'Loading skills...');
  const skills = await loadSkills();
  log(emitter, 'thinking', `Loaded ${skills.length} skills: ${skills.map(s => s.name).join(', ')}`);

  log(emitter, 'thinking', 'Loading memory files...');
  const memoryFiles = await readAllMemory();
  log(emitter, 'thinking', `Loaded ${memoryFiles.length} memory files (${memoryFiles.reduce((s,f) => s + f.size, 0)} bytes)`);

  log(emitter, 'thinking', 'Loading tool definitions...');
  const tools = await loadTools();
  log(emitter, 'thinking', `Loaded ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`);

  let prompt = `You are ${process.env.AGENT_NAME || 'Droid Agent'}, an always-on AI assistant for production incident management running locally on a developer's machine. You are direct, fast, and highly technical. When given a log, error, alert, metric graph, or screenshot, you immediately triage it: identify what's wrong, what likely caused it, what to check next, and what the fix is. You think in terms of blast radius, root cause, and time to resolution.

CRITICAL RULES:
- You MUST execute commands yourself using <tool_call> blocks. NEVER tell the user to run commands. NEVER output commands as suggestions or code blocks for the user to copy. You have full access to the host machine — just run them.
- When the user asks you to check, find, list, or debug anything — immediately run the relevant commands via tool_call.
- You have access to the host machine's kubectl, aws, az, gcloud, gh, docker, helm, terraform, and all other CLIs with full credentials.
- Always act, never just advise.

`;

  if (skills.length > 0) {
    prompt += '<skills>\n';
    for (const skill of skills) {
      prompt += `<skill name="${skill.name}">\n${skill.content}\n</skill>\n`;
    }
    prompt += '</skills>\n\n';
  }

  if (memoryFiles.length > 0) {
    let totalChars = memoryFiles.reduce((sum, f) => sum + f.content.length, 0);
    let filesToInclude = memoryFiles;

    if (totalChars > MEMORY_CHAR_LIMIT) {
      const contextFile = memoryFiles.find(f => f.path === 'context.md');
      const otherFiles = memoryFiles.filter(f => f.path !== 'context.md').slice(0, 9);
      filesToInclude = contextFile ? [contextFile, ...otherFiles] : otherFiles.slice(0, 10);
      log(emitter, 'thinking', `Memory trimmed: ${filesToInclude.length}/${memoryFiles.length} files (${totalChars} chars > ${MEMORY_CHAR_LIMIT} limit)`);
    }

    prompt += '<memory>\n';
    if (totalChars > MEMORY_CHAR_LIMIT) {
      prompt += `<!-- Memory trimmed: showing ${filesToInclude.length} of ${memoryFiles.length} files (most recent + context.md) -->\n`;
    }
    for (const file of filesToInclude) {
      prompt += `<file path="${file.path}" modified="${file.modified}">\n${file.content}\n</file>\n`;
    }
    prompt += '</memory>\n\n';
  }

  // Tools block (shared with sync agent)
  prompt += getToolInstructions();

  if (tools.length > 0) {
    prompt += 'Additional custom tools from mcp.json:\n';
    for (const tool of tools) {
      prompt += `- ${tool.name}: ${tool.description}\n`;
    }
    prompt += '\n';
  }

  // Include tools from running MCP servers
  const mcpTools = loadMcpTools();
  if (mcpTools.length > 0) {
    prompt += 'MCP Server tools (call via tool_call with matching args):\n';
    for (const t of mcpTools) {
      const schema = t.inputSchema ? ` Args: ${JSON.stringify(t.inputSchema.properties || {})}` : '';
      prompt += `- ${t.name}: ${t.description}${schema}\n`;
    }
    prompt += '\n';
  }

  prompt += `DISPLAY & MEMORY rules:
- ALWAYS show command outputs, results, findings, and analysis directly in your response to the user FIRST.
- NEVER silently write to memory without telling the user what you saved.

PROACTIVE MEMORY UPDATES — you should automatically save to memory when you discover reusable knowledge:
- A new fact about the user's infrastructure (service name, port, dependency, config detail) → update memory/context.md or memory/infra/
- A debugging pattern that worked (root cause + fix for a specific issue) → save to memory/incidents/
- A recurring issue or known workaround → save to memory/learned/
- A correction to something already in memory (outdated info, wrong port, renamed service) → update the existing file

TOOL OUTPUT MEMORY — after running a tool, evaluate if the output contains information worth saving for future reference:
- Service/pod listings, deployment configs, resource inventories → save to memory/infra/
- Error patterns, stack traces with identified root causes → save to memory/incidents/
- Network topology, port mappings, DNS entries → save to memory/infra/network.md
- Configuration details (env vars, secrets names, config maps) → save to memory/infra/
- Do NOT save transient data (current CPU %, live log tails) unless they reveal a pattern
- When saving tool output, summarize it — don't dump raw output verbatim

When you save something proactively, tell the user at the end of your response what you saved and where, e.g.:
"I also updated memory/context.md with the fact that your payments service runs on port 3001."

For explicit user requests to save (e.g. "save this as a runbook"), use the user's preferred path.

Use this format for incident summaries:

<memory_write path='incidents/YYYY-MM-DD-short-title.md'>
## Incident: [title]
**Date**: YYYY-MM-DD
**Service**: [service name]
**Symptom**: [what was observed]
**Root cause**: [what caused it]
**Resolution**: [how it was fixed]
**Commands run**: [list]
</memory_write>

For infrastructure facts, update the relevant file in memory/infra/ or memory/context.md.
For learned patterns, write to memory/learned/.
For skills/runbooks, write to skills/ directory.`;

  // Add feedback context
  const recentFeedback = await getRecentFeedback(15);
  if (recentFeedback.length > 0) {
    prompt += '\n\n<feedback_context>\nRecent user feedback on your past responses — use this to calibrate your approach:\n';
    for (const fb of recentFeedback) {
      const tag = fb.feedback === 'up' ? 'USER AGREED' : 'USER DISAGREED';
      const snippet = (fb.content || '').substring(0, 150).replace(/\n/g, ' ');
      prompt += `- [${tag}] "${snippet}..."\n`;
    }
    prompt += '</feedback_context>\n';
  }

  log(emitter, 'thinking', `System prompt built: ${prompt.length} chars`);
  return prompt;
}

function parseToolCalls(text) {
  const toolCalls = [];
  const regex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    let raw = match[1].trim();
    // Try parsing as-is first
    let parsed = tryParseJson(raw);
    if (!parsed) {
      // Fix common model mistakes: extra trailing braces, missing braces
      // Remove trailing extra }
      while (raw.endsWith('}}') && !isValidJson(raw)) {
        raw = raw.slice(0, -1);
      }
      parsed = tryParseJson(raw);
    }
    if (!parsed) {
      // Try extracting JSON object from surrounding text
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let candidate = jsonMatch[0];
        parsed = tryParseJson(candidate);
        if (!parsed) {
          while (candidate.endsWith('}}') && !isValidJson(candidate)) {
            candidate = candidate.slice(0, -1);
          }
          parsed = tryParseJson(candidate);
        }
      }
    }
    if (parsed && parsed.tool) {
      toolCalls.push({ tool: parsed.tool, args: parsed.args || {} });
    } else {
      console.log(`[parser] Failed to parse tool_call: ${match[1].substring(0, 100)}`);
    }
  }
  return toolCalls;
}

function tryParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function isValidJson(str) {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

function parseMemoryWrites(text) {
  const writes = [];
  const regex = /<memory_write\s+path=['"](.*?)['"]>([\s\S]*?)<\/memory_write>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    writes.push({ path: match[1], content: match[2].trim() });
  }
  return writes;
}

function stripToolCalls(text) {
  return text.replace(/<tool_call>\s*\{[\s\S]*?\}\s*<\/tool_call>/g, '').trim();
}

function stripMemoryWrites(text) {
  return text.replace(/<memory_write\s+path=['"].*?['"]>[\s\S]*?<\/memory_write>/g, '').trim();
}

// ── Chat agent ──

export async function runAgent({ message, images, conversationId, emitter }) {
  log(emitter, 'thinking', `New request: conv=${conversationId} msgLen=${message.length} images=${images?.length || 0}`);
  log(emitter, 'thinking', `Provider: ${getProviderName()} | Model: ${getModelId()}`);

  const systemPrompt = await buildSystemPrompt(emitter);

  log(emitter, 'thinking', 'Loading conversation history from Redis...');
  let history = await getConversation(conversationId);
  log(emitter, 'thinking', `Conversation history: ${history.length} previous messages`);

  const userContent = buildImageContent(message, images);
  history.push({ role: 'user', content: userContent });

  // Persist user message to PostgreSQL
  await upsertConversation(conversationId, 0, 0, message);
  await saveMessage({ conversationId, role: 'user', content: message });

  const toolsUsed = [];
  const toolDetails = []; // {tool, args, result, duration}
  const memoryWrites = [];
  let iterations = 0;

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;
    log(emitter, 'thinking', `Calling model — iteration ${iterations}/${MAX_TOOL_ITERATIONS}`);

    const assistantText = await createCompletion({
      system: systemPrompt,
      messages: history,
      maxTokens: MAX_TOKENS
    });

    // Log a preview of what the model said
    const preview = assistantText.substring(0, 200).replace(/\n/g, ' ');
    log(emitter, 'model_output', { message: `Response preview: ${preview}${assistantText.length > 200 ? '...' : ''}`, length: assistantText.length });

    history.push({ role: 'assistant', content: assistantText });

    const toolCalls = parseToolCalls(assistantText);
    log(emitter, 'thinking', `Parsed ${toolCalls.length} tool call(s)${toolCalls.length > 0 ? ': ' + toolCalls.map(t => t.tool).join(', ') : ''}`);

    if (toolCalls.length === 0) {
      // Check for memory writes
      const memWrites = parseMemoryWrites(assistantText);
      for (const mw of memWrites) {
        try {
          log(emitter, 'memory_write', { message: `Writing memory: ${mw.path} (${mw.content.length} chars)`, path: mw.path });
          await writeMemory(mw.path, mw.content);
          memoryWrites.push(mw.path);

          if (mw.path.startsWith('incidents/')) {
            await logIncident({
              conversationId,
              title: mw.path.replace('incidents/', '').replace('.md', ''),
              service: extractField(mw.content, 'Service'),
              symptom: extractField(mw.content, 'Symptom'),
              rootCause: extractField(mw.content, 'Root cause'),
              resolution: extractField(mw.content, 'Resolution'),
              commandsRun: toolsUsed,
              memoryPath: mw.path
            });
            log(emitter, 'thinking', `Incident logged to PostgreSQL: ${mw.path}`);
          }
        } catch (err) {
          log(emitter, 'error', `Memory write failed: ${err.message}`);
        }
      }

      let finalResponse = stripToolCalls(assistantText);
      finalResponse = stripMemoryWrites(finalResponse);

      log(emitter, 'thinking', 'Saving conversation...');
      await saveConversation(conversationId, history);
      await upsertConversation(conversationId, 1, toolsUsed.length);
      const savedMsg = await saveMessage({ conversationId, role: 'assistant', content: finalResponse, toolsUsed, memoryWrites, toolDetails });
      const messageId = savedMsg?.id || null;

      log(emitter, 'done', { message: `Complete: ${iterations} iteration(s), ${toolsUsed.length} tool(s), ${memoryWrites.length} memory write(s)`, toolsUsed, memoryWrites });
      log(emitter, 'response', { text: finalResponse });

      return { response: finalResponse, toolsUsed, memoryWrites, conversationId, messageId };
    }

    // Execute tool calls
    const results = [];
    for (const tc of toolCalls) {
      const argSummary = tc.args.command || tc.args.url || tc.args.path || JSON.stringify(tc.args).substring(0, 100);
      log(emitter, 'tool_call', { message: `Executing: ${tc.tool}(${argSummary})`, tool: tc.tool, args: argSummary });

      toolsUsed.push(tc.tool);
      const start = Date.now();
      const result = await executeTool(tc.tool, tc.args);
      const durationMs = Date.now() - start;

      const resultPreview = result.length > 300 ? result.substring(0, 300) + '...' : result;
      log(emitter, 'tool_result', { message: `${tc.tool} completed in ${durationMs}ms (${result.length} chars)`, tool: tc.tool, duration: durationMs, preview: resultPreview });

      toolDetails.push({ tool: tc.tool, args: argSummary, result: result.length > 2000 ? result.substring(0, 2000) : result, duration: durationMs });
      results.push(`Tool result for ${tc.tool}:\n${result}`);

      await logToolExecution({
        conversationId,
        toolName: tc.tool,
        args: tc.args,
        result: result.length > 2000 ? result.substring(0, 2000) : result,
        durationMs
      });
    }

    history.push({ role: 'user', content: results.join('\n\n') });
    log(emitter, 'thinking', `Fed ${results.length} tool result(s) back to model, looping...`);
  }

  // Max iterations
  log(emitter, 'error', `Max iterations (${MAX_TOOL_ITERATIONS}) reached`);

  const lastAssistant = history.filter(m => m.role === 'assistant').pop();
  let finalText = typeof lastAssistant?.content === 'string' ? lastAssistant.content : '';
  finalText = stripToolCalls(finalText);
  finalText = stripMemoryWrites(finalText);

  await saveConversation(conversationId, history);
  await upsertConversation(conversationId, 1, toolsUsed.length);

  const resp = finalText + '\n\n*[Max tool iterations reached]*';
  const savedMsgFallback = await saveMessage({ conversationId, role: 'assistant', content: resp, toolsUsed, memoryWrites, toolDetails });
  const messageId = savedMsgFallback?.id || null;
  log(emitter, 'response', { text: resp });
  log(emitter, 'done', { message: `Complete (max iterations): ${toolsUsed.length} tool(s)`, toolsUsed, memoryWrites });

  return { response: resp, toolsUsed, memoryWrites, conversationId, messageId };
}

// ── Tool instructions shared by both chat and sync ──

function getToolInstructions() {
  return `
<available_tools>
To execute a tool, output EXACTLY this format (valid JSON, no extra braces):

<tool_call>
{"tool": "run_shell", "args": {"command": "kubectl get pods -n production"}}
</tool_call>

IMPORTANT: The JSON inside <tool_call> must be valid. Exactly two closing braces }} — one for args, one for the outer object. Do NOT add extra braces.

Available tools:
- run_shell(command): Run any shell command on the host machine. kubectl, aws, az, gcloud, gh, docker, helm, terraform, curl, jq, git, ssh are all available with the user's credentials.
- fetch_url(url, headers?): HTTP GET a URL, return response body.
- read_file(path): Read a file from the filesystem.
- write_memory(path, content): Save markdown to memory/{path} for future reference.

You MUST use tool_call blocks to execute commands. Do NOT suggest commands for the user to run. Do NOT put commands in code blocks as suggestions. Execute them yourself.

After outputting a tool_call block, STOP and wait. The result will appear in the next message. Then you can make more tool calls or respond.
</available_tools>

To save files to agent memory, output:

<memory_write path='infra/example.md'>
markdown content here
</memory_write>
`;
}

// ── Sync agent — agentic loop driven by the infra-sync skill ──

export async function runSyncAgent(emitter) {
  const skillContent = await loadSkill('infra-sync');

  const systemPrompt = `You are performing an infrastructure discovery sync for ${process.env.AGENT_NAME || 'Droid Agent'}.

Your job: explore what's running on this machine, discover the developer's full stack, and write structured markdown summaries to memory. You have full access to the host — kubectl, aws, az, gcloud, gh, docker, and all other CLIs with credentials.

RULES:
- You MUST use <tool_call> blocks to run commands. Do NOT just list commands — execute them.
- Be EXHAUSTIVE. For Kubernetes, iterate over ALL contexts. For AWS, check ALL profiles. For Azure, check ALL subscriptions.
- Write results to memory using <memory_write> blocks as you go — do not wait until the end.
- If a command fails or a tool is not available, note it and move on to the next step.
- Redact secret values — show key names only.
- Each memory file should be clean markdown with headers and code blocks.

${getToolInstructions()}`;

  const userMessage = skillContent
    ? `Follow this infrastructure sync skill. Execute all the discovery steps described. Use tool calls to run commands and memory_write blocks to save results.\n\n${skillContent}`
    : `Discover my local development infrastructure. Check Docker, Kubernetes (all contexts), AWS (all profiles), Azure (all subscriptions), GCP, GitHub, network ports, and local projects. Write results to memory/infra/ as you go.`;

  log(emitter, 'thinking', 'Starting infrastructure discovery (agentic)...');
  log(emitter, 'thinking', `Provider: ${getProviderName()} | Model: ${getModelId()}`);
  if (skillContent) {
    log(emitter, 'thinking', `Loaded infra-sync skill (${skillContent.length} chars)`);
  } else {
    log(emitter, 'thinking', 'No infra-sync skill found, using default prompt');
  }

  const history = [{ role: 'user', content: userMessage }];
  const filesWritten = [];
  let iterations = 0;

  while (iterations < MAX_SYNC_ITERATIONS) {
    iterations++;
    log(emitter, 'thinking', `Calling model — sync iteration ${iterations}/${MAX_SYNC_ITERATIONS}`);

    let assistantText;
    try {
      assistantText = await createCompletion({
        system: systemPrompt,
        messages: history,
        maxTokens: MAX_TOKENS
      });
    } catch (err) {
      log(emitter, 'error', `API error: ${err.message}`);
      break;
    }

    const preview = assistantText.substring(0, 200).replace(/\n/g, ' ');
    log(emitter, 'model_output', { message: `Response preview: ${preview}${assistantText.length > 200 ? '...' : ''}`, length: assistantText.length });

    history.push({ role: 'assistant', content: assistantText });

    // Parse tool calls and memory writes
    const toolCalls = parseToolCalls(assistantText);
    const memWrites = parseMemoryWrites(assistantText);

    log(emitter, 'thinking', `Parsed ${toolCalls.length} tool call(s), ${memWrites.length} memory write(s)`);

    // Execute memory writes
    for (const mw of memWrites) {
      try {
        log(emitter, 'memory_write', { message: `Writing: memory/${mw.path} (${mw.content.length} chars)`, path: mw.path });
        await writeMemory(mw.path, mw.content);
        filesWritten.push(mw.path);
      } catch (err) {
        log(emitter, 'error', `Memory write error: ${err.message}`);
      }
    }

    // If no tool calls, agent is done
    if (toolCalls.length === 0) {
      log(emitter, 'thinking', 'No more tool calls — sync agent finished');
      break;
    }

    // Execute tool calls
    const results = [];
    for (const tc of toolCalls) {
      const argSummary = tc.args.command || tc.args.url || tc.args.path || '';
      log(emitter, 'tool_call', { message: `Executing: ${tc.tool}(${argSummary})`, tool: tc.tool, args: argSummary });

      const start = Date.now();
      const result = await executeTool(tc.tool, tc.args);
      const durationMs = Date.now() - start;

      const resultPreview = result.length > 300 ? result.substring(0, 300) + '...' : result;
      log(emitter, 'tool_result', { message: `${tc.tool} completed in ${durationMs}ms (${result.length} chars)`, tool: tc.tool, duration: durationMs, preview: resultPreview });

      results.push(`Tool result for ${tc.tool}:\n${result}`);
    }

    history.push({ role: 'user', content: results.join('\n\n') });
    log(emitter, 'thinking', `Fed ${results.length} tool result(s) back to model, looping...`);
  }

  log(emitter, 'done', { message: `Sync complete: ${iterations} iterations, ${filesWritten.length} files written`, filesWritten });
  return { filesWritten };
}

function extractField(content, fieldName) {
  const regex = new RegExp(`\\*\\*${fieldName}\\*\\*:\\s*(.+?)(?:\\n|$)`, 'i');
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}
