import express from 'express';
import cors from 'cors';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runAgent } from './agent.js';
import { getProviderName, getModelId } from './provider.js';
import { readAllMemory, writeMemory, getTotalMemoryBytes } from './memory.js';
import { loadSkills } from './skills.js';
import { loadTools, loadMcpTools } from './tools.js';
import { runSync } from './sync.js';
import { initRedis, redisHealthy } from './redis.js';
import { initMcpServers, getMcpServerCount } from './mcp-client.js';
import { startLearner } from './learner.js';
import { initDb, dbHealthy, getIncidents, getToolExecutions, getRecentConversations, getConversationMessages, saveFeedback, getLastLearnerRun } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 7433;

const VALID_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

// Initialize Redis, PostgreSQL, and MCP servers
initRedis();
initDb();
initMcpServers().catch(err => console.error('MCP init error:', err.message));
startLearner();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(join(__dirname, 'public')));

// POST /api/chat — SSE streaming with agent events
app.post('/api/chat', (req, res) => {
  const { message, images, conversationId } = req.body;

  if (!message && (!images || images.length === 0)) {
    return res.status(400).json({ error: 'Message or images required' });
  }

  const validImages = (images || []).filter(img =>
    img.base64 && VALID_IMAGE_TYPES.includes(img.mediaType)
  );

  // Set up SSE — disable buffering
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.socket?.setNoDelay(true);
  res.flushHeaders();

  const emitter = new EventEmitter();

  const writeSse = (data) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  emitter.on('agent', writeSse);

  runAgent({
    message: message || '',
    images: validImages,
    conversationId: conversationId || 'default',
    emitter
  }).then((result) => {
    writeSse({ type: 'final', response: result.response, toolsUsed: result.toolsUsed, memoryWrites: result.memoryWrites, conversationId: result.conversationId, messageId: result.messageId });
    res.end();
  }).catch((err) => {
    console.error('Chat error:', err);
    writeSse({ type: 'error', message: err.message });
    res.end();
  });

  req.on('close', () => {
    // Only remove listeners if the response is already done
    // (prevents premature cleanup while agent is still running)
    if (res.writableEnded) {
      emitter.removeAllListeners();
    }
  });
});

// POST /api/memory/write
app.post('/api/memory/write', async (req, res) => {
  try {
    const { path, content } = req.body;
    if (!path || content === undefined) {
      return res.status(400).json({ error: 'Path and content required' });
    }
    await writeMemory(path, content);
    res.json({ success: true, path });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/memory
app.get('/api/memory', async (req, res) => {
  try {
    const files = await readAllMemory();
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/skills
app.get('/api/skills', async (req, res) => {
  try {
    const skills = await loadSkills();
    res.json({ skills });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tools
app.get('/api/tools', async (req, res) => {
  try {
    const tools = await loadTools();
    res.json({ tools });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync — SSE streaming
app.post('/api/sync', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.socket?.setNoDelay(true);
  res.flushHeaders();

  const emitter = new EventEmitter();

  const writeSse = (data) => {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  emitter.on('agent', writeSse);

  runSync(emitter).then(() => {
    res.end();
  }).catch((err) => {
    writeSse({ type: 'error', message: err.message });
    writeSse({ type: 'done', filesWritten: [] });
    res.end();
  });

  req.on('close', () => {
    if (res.writableEnded) {
      emitter.removeAllListeners();
    }
  });
});

// GET /api/incidents
app.get('/api/incidents', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const incidents = await getIncidents(limit);
    res.json({ incidents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tool-executions
app.get('/api/tool-executions', async (req, res) => {
  try {
    const { conversationId } = req.query;
    const limit = parseInt(req.query.limit) || 100;
    const executions = conversationId
      ? await getToolExecutions(conversationId, limit)
      : [];
    res.json({ executions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/conversations/:id/messages
app.get('/api/conversations/:id/messages', async (req, res) => {
  try {
    const messages = await getConversationMessages(req.params.id);
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/conversations
app.get('/api/conversations', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const conversations = await getRecentConversations(limit);
    res.json({ conversations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/feedback
app.post('/api/feedback', async (req, res) => {
  try {
    const { messageId, conversationId, feedback } = req.body;
    if (!messageId || !feedback) {
      return res.status(400).json({ error: 'messageId and feedback required' });
    }
    await saveFeedback({ messageId, conversationId, feedback });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/learner/trigger
app.post('/api/learner/trigger', async (req, res) => {
  try {
    const { runLearnerCycle } = await import('./learner.js');
    const result = await runLearnerCycle();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/learner/status
app.get('/api/learner/status', async (req, res) => {
  try {
    const lastRun = await getLastLearnerRun();
    res.json({ lastRun });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/health
app.get('/api/health', async (req, res) => {
  try {
    const skills = await loadSkills();
    const memoryFiles = await readAllMemory();
    const tools = await loadTools();
    const mcpTools = await loadMcpTools();
    const memoryTotalBytes = await getTotalMemoryBytes();
    const redisOk = await redisHealthy();
    const dbOk = await dbHealthy();

    res.json({
      status: 'ok',
      model: getModelId(),
      provider: getProviderName(),
      skillsLoaded: skills.length,
      memoryFiles: memoryFiles.length,
      toolsAvailable: tools.length,
      mcpServersEnabled: getMcpServerCount(),
      mcpToolsAvailable: mcpTools.length,
      memoryTotalBytes,
      redis: redisOk ? 'connected' : 'disconnected',
      postgres: dbOk ? 'connected' : 'disconnected'
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Droid Agent server running on http://localhost:${PORT}`);
  console.log(`Provider: ${getProviderName()} | Model: ${getModelId()}`);
});
