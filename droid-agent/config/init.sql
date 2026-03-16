CREATE TABLE IF NOT EXISTS incidents (
    id SERIAL PRIMARY KEY,
    conversation_id TEXT,
    title TEXT NOT NULL,
    service TEXT,
    symptom TEXT,
    root_cause TEXT,
    resolution TEXT,
    commands_run TEXT[],
    memory_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tool_executions (
    id SERIAL PRIMARY KEY,
    conversation_id TEXT,
    tool_name TEXT NOT NULL,
    args JSONB,
    result TEXT,
    duration_ms INTEGER,
    executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    message_count INTEGER DEFAULT 0,
    tools_used INTEGER DEFAULT 0,
    summary TEXT
);

CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_executions_conv ON tool_executions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tool_executions_time ON tool_executions(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_active ON conversations(last_active_at DESC);

CREATE TABLE IF NOT EXISTS conversation_messages (
    id SERIAL PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tools_used TEXT[],
    memory_writes TEXT[],
    tool_details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_messages_conv ON conversation_messages(conversation_id, created_at);

-- Add first_message column to conversations for preview
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS first_message TEXT;

CREATE TABLE IF NOT EXISTS message_feedback (
    id SERIAL PRIMARY KEY,
    message_id INTEGER NOT NULL,
    conversation_id TEXT NOT NULL,
    feedback TEXT NOT NULL CHECK (feedback IN ('up', 'down')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_message ON message_feedback(message_id);
CREATE INDEX IF NOT EXISTS idx_feedback_conv ON message_feedback(conversation_id);

CREATE TABLE IF NOT EXISTS learner_runs (
    id SERIAL PRIMARY KEY,
    last_message_id INTEGER,
    conversations_analyzed INTEGER,
    files_written TEXT[],
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
