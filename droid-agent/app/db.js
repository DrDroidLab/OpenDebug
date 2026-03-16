import pg from 'pg';

const { Pool } = pg;

let pool = null;

export function initDb() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://droidagent:droidagent@localhost:5432/droidagent',
    max: 5,
    idleTimeoutMillis: 30000
  });

  pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err.message);
  });

  pool.on('connect', () => {
    console.log('Connected to PostgreSQL');
  });

  return pool;
}

export function getPool() {
  return pool;
}

// Incidents

export async function logIncident({ conversationId, title, service, symptom, rootCause, resolution, commandsRun, memoryPath }) {
  if (!pool) return null;
  try {
    const result = await pool.query(
      `INSERT INTO incidents (conversation_id, title, service, symptom, root_cause, resolution, commands_run, memory_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [conversationId, title, service, symptom, rootCause, resolution, commandsRun || [], memoryPath]
    );
    return result.rows[0];
  } catch (err) {
    console.error('Failed to log incident:', err.message);
    return null;
  }
}

export async function getIncidents(limit = 50) {
  if (!pool) return [];
  try {
    const result = await pool.query(
      'SELECT * FROM incidents ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  } catch (err) {
    console.error('Failed to get incidents:', err.message);
    return [];
  }
}

// Tool executions

export async function logToolExecution({ conversationId, toolName, args, result, durationMs }) {
  if (!pool) return null;
  try {
    const res = await pool.query(
      `INSERT INTO tool_executions (conversation_id, tool_name, args, result, duration_ms)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [conversationId, toolName, JSON.stringify(args), result, durationMs]
    );
    return res.rows[0];
  } catch (err) {
    console.error('Failed to log tool execution:', err.message);
    return null;
  }
}

export async function getToolExecutions(conversationId, limit = 100) {
  if (!pool) return [];
  try {
    const result = await pool.query(
      'SELECT * FROM tool_executions WHERE conversation_id = $1 ORDER BY executed_at DESC LIMIT $2',
      [conversationId, limit]
    );
    return result.rows;
  } catch (err) {
    console.error('Failed to get tool executions:', err.message);
    return [];
  }
}

// Conversations

export async function upsertConversation(conversationId, messageCount, toolsUsed, firstMessage) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO conversations (id, message_count, tools_used, first_message, last_active_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (id) DO UPDATE SET
         message_count = conversations.message_count + $2,
         tools_used = conversations.tools_used + $3,
         first_message = COALESCE(conversations.first_message, $4),
         last_active_at = NOW()`,
      [conversationId, messageCount, toolsUsed, firstMessage ? firstMessage.substring(0, 200) : null]
    );
  } catch (err) {
    console.error('Failed to upsert conversation:', err.message);
  }
}

export async function getRecentConversations(limit = 20) {
  if (!pool) return [];
  try {
    const result = await pool.query(
      'SELECT * FROM conversations ORDER BY last_active_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  } catch (err) {
    console.error('Failed to get conversations:', err.message);
    return [];
  }
}

// Conversation messages

export async function saveMessage({ conversationId, role, content, toolsUsed, memoryWrites, toolDetails }) {
  if (!pool) return null;
  try {
    const result = await pool.query(
      `INSERT INTO conversation_messages (conversation_id, role, content, tools_used, memory_writes, tool_details)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [conversationId, role, content, toolsUsed || [], memoryWrites || [], toolDetails ? JSON.stringify(toolDetails) : null]
    );
    return result.rows[0];
  } catch (err) {
    console.error('Failed to save message:', err.message);
    return null;
  }
}

export async function getConversationMessages(conversationId) {
  if (!pool) return [];
  try {
    const result = await pool.query(
      `SELECT cm.*, mf.feedback
       FROM conversation_messages cm
       LEFT JOIN message_feedback mf ON mf.message_id = cm.id
       WHERE cm.conversation_id = $1
       ORDER BY cm.created_at ASC`,
      [conversationId]
    );
    return result.rows;
  } catch (err) {
    console.error('Failed to get conversation messages:', err.message);
    return [];
  }
}

export async function updateConversationFirstMessage(conversationId, firstMessage) {
  if (!pool) return;
  try {
    await pool.query(
      `UPDATE conversations SET first_message = $2 WHERE id = $1 AND first_message IS NULL`,
      [conversationId, firstMessage.substring(0, 200)]
    );
  } catch (err) {
    console.error('Failed to update first message:', err.message);
  }
}

// Feedback

export async function saveFeedback({ messageId, conversationId, feedback }) {
  if (!pool) return null;
  try {
    const result = await pool.query(
      `INSERT INTO message_feedback (message_id, conversation_id, feedback)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id) DO UPDATE SET feedback = $3, created_at = NOW()
       RETURNING id`,
      [messageId, conversationId, feedback]
    );
    return result.rows[0];
  } catch (err) {
    console.error('Failed to save feedback:', err.message);
    return null;
  }
}

export async function getRecentFeedback(limit = 20) {
  if (!pool) return [];
  try {
    const result = await pool.query(
      `SELECT mf.feedback, cm.content, cm.conversation_id
       FROM message_feedback mf
       JOIN conversation_messages cm ON cm.id = mf.message_id
       ORDER BY mf.created_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows;
  } catch (err) {
    console.error('Failed to get feedback:', err.message);
    return [];
  }
}

// Learner

export async function getUnanalyzedConversations(minMessages = 4, limit = 20) {
  if (!pool) return [];
  try {
    const lastRun = await pool.query('SELECT last_message_id FROM learner_runs ORDER BY id DESC LIMIT 1');
    const watermark = lastRun.rows[0]?.last_message_id || 0;

    const result = await pool.query(
      `SELECT cm.conversation_id,
              array_agg(cm.id ORDER BY cm.created_at) as message_ids,
              json_agg(json_build_object('role', cm.role, 'content', cm.content, 'tools_used', cm.tools_used) ORDER BY cm.created_at) as messages
       FROM conversation_messages cm
       WHERE cm.id > $1
       GROUP BY cm.conversation_id
       HAVING count(*) >= $2
       ORDER BY max(cm.created_at) DESC
       LIMIT $3`,
      [watermark, minMessages, limit]
    );
    return result.rows;
  } catch (err) {
    console.error('Failed to get unanalyzed conversations:', err.message);
    return [];
  }
}

export async function saveLearnerRun({ lastMessageId, conversationsAnalyzed, filesWritten }) {
  if (!pool) return null;
  try {
    const result = await pool.query(
      `INSERT INTO learner_runs (last_message_id, conversations_analyzed, files_written, completed_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id`,
      [lastMessageId, conversationsAnalyzed, filesWritten || []]
    );
    return result.rows[0];
  } catch (err) {
    console.error('Failed to save learner run:', err.message);
    return null;
  }
}

export async function getLastLearnerRun() {
  if (!pool) return null;
  try {
    const result = await pool.query('SELECT * FROM learner_runs ORDER BY id DESC LIMIT 1');
    return result.rows[0] || null;
  } catch (err) {
    console.error('Failed to get last learner run:', err.message);
    return null;
  }
}

// Health

export async function dbHealthy() {
  if (!pool) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
