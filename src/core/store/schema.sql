-- slacktui SQLite schema
-- Version: 1

-- Future-proofing for multi-workspace
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    team_id TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Channels (public, private, DMs, group DMs)
CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,              -- C0123456789
    workspace_id TEXT NOT NULL,
    name TEXT,                        -- null for DMs
    type TEXT NOT NULL,               -- public_channel | private_channel | im | mpim
    is_member INTEGER DEFAULT 1,
    is_archived INTEGER DEFAULT 0,
    last_read_ts TEXT,                -- Timestamp of last read
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,              -- U0123456789
    workspace_id TEXT NOT NULL,
    username TEXT,
    display_name TEXT,
    real_name TEXT,
    avatar_hash TEXT,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
    channel_id TEXT NOT NULL,
    ts TEXT NOT NULL,                 -- Slack timestamp (unique per channel)
    user_id TEXT,
    text TEXT,
    thread_ts TEXT,                   -- Parent message ts (if reply)
    reply_count INTEGER DEFAULT 0,
    is_edited INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    raw_json TEXT,                    -- Full payload for edge cases
    cached_at INTEGER NOT NULL,
    PRIMARY KEY (channel_id, ts),
    FOREIGN KEY (channel_id) REFERENCES channels(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Reactions (normalized for querying)
CREATE TABLE IF NOT EXISTS reactions (
    channel_id TEXT NOT NULL,
    message_ts TEXT NOT NULL,
    emoji TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (channel_id, message_ts, emoji, user_id),
    FOREIGN KEY (channel_id, message_ts) REFERENCES messages(channel_id, ts),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Offline action queue
CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command_type TEXT NOT NULL,       -- SendMessage | AddReaction | ...
    payload TEXT NOT NULL,            -- JSON
    status TEXT DEFAULT 'pending',    -- pending | in_flight | failed
    attempts INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_attempt_at INTEGER
);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_channel_ts ON messages(channel_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(channel_id, thread_ts) WHERE thread_ts IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(channel_id, message_ts);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_channels_workspace ON channels(workspace_id);
CREATE INDEX IF NOT EXISTS idx_users_workspace ON users(workspace_id);
