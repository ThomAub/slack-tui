/**
 * Typed query functions for UI
 */
import { getDb } from './db';
import type {
  Channel,
  Message,
  User,
  Reaction,
  Workspace,
  OutboxItem,
} from '../types';

// ============ Workspaces ============

export function getWorkspace(id: string): Workspace | null {
  const db = getDb();
  const row = db
    .query<
      { id: string; name: string; team_id: string; created_at: number },
      [string]
    >('SELECT id, name, team_id, created_at FROM workspaces WHERE id = ?')
    .get(id);

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    teamId: row.team_id,
    createdAt: row.created_at,
  };
}

export function upsertWorkspace(workspace: Workspace): void {
  const db = getDb();
  db.run(
    `INSERT INTO workspaces (id, name, team_id, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
    [workspace.id, workspace.name, workspace.teamId, workspace.createdAt]
  );
}

// ============ Channels ============

export function getChannels(workspaceId: string): Channel[] {
  const db = getDb();
  const rows = db
    .query<
      {
        id: string;
        workspace_id: string;
        name: string | null;
        type: string;
        is_member: number;
        is_archived: number;
        last_read_ts: string | null;
        updated_at: number;
      },
      [string]
    >(
      `SELECT id, workspace_id, name, type, is_member, is_archived, last_read_ts, updated_at
       FROM channels
       WHERE workspace_id = ? AND is_archived = 0
       ORDER BY name`
    )
    .all(workspaceId);

  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    type: row.type as Channel['type'],
    isMember: row.is_member === 1,
    isArchived: row.is_archived === 1,
    lastReadTs: row.last_read_ts,
    updatedAt: row.updated_at,
  }));
}

export function getChannel(id: string): Channel | null {
  const db = getDb();
  const row = db
    .query<
      {
        id: string;
        workspace_id: string;
        name: string | null;
        type: string;
        is_member: number;
        is_archived: number;
        last_read_ts: string | null;
        updated_at: number;
      },
      [string]
    >(
      'SELECT id, workspace_id, name, type, is_member, is_archived, last_read_ts, updated_at FROM channels WHERE id = ?'
    )
    .get(id);

  if (!row) return null;

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    type: row.type as Channel['type'],
    isMember: row.is_member === 1,
    isArchived: row.is_archived === 1,
    lastReadTs: row.last_read_ts,
    updatedAt: row.updated_at,
  };
}

export function upsertChannel(channel: Channel): void {
  const db = getDb();
  db.run(
    `INSERT INTO channels (id, workspace_id, name, type, is_member, is_archived, last_read_ts, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       type = excluded.type,
       is_member = excluded.is_member,
       is_archived = excluded.is_archived,
       last_read_ts = excluded.last_read_ts,
       updated_at = excluded.updated_at`,
    [
      channel.id,
      channel.workspaceId,
      channel.name,
      channel.type,
      channel.isMember ? 1 : 0,
      channel.isArchived ? 1 : 0,
      channel.lastReadTs,
      channel.updatedAt,
    ]
  );
}

export function deleteChannel(id: string): void {
  const db = getDb();
  db.run('DELETE FROM channels WHERE id = ?', [id]);
}

// ============ Users ============

export function getUser(id: string): User | null {
  const db = getDb();
  const row = db
    .query<
      {
        id: string;
        workspace_id: string;
        username: string | null;
        display_name: string | null;
        real_name: string | null;
        avatar_hash: string | null;
        updated_at: number;
      },
      [string]
    >(
      'SELECT id, workspace_id, username, display_name, real_name, avatar_hash, updated_at FROM users WHERE id = ?'
    )
    .get(id);

  if (!row) return null;

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    username: row.username,
    displayName: row.display_name,
    realName: row.real_name,
    avatarHash: row.avatar_hash,
    updatedAt: row.updated_at,
  };
}

export function getUsers(workspaceId: string): User[] {
  const db = getDb();
  const rows = db
    .query<
      {
        id: string;
        workspace_id: string;
        username: string | null;
        display_name: string | null;
        real_name: string | null;
        avatar_hash: string | null;
        updated_at: number;
      },
      [string]
    >(
      'SELECT id, workspace_id, username, display_name, real_name, avatar_hash, updated_at FROM users WHERE workspace_id = ?'
    )
    .all(workspaceId);

  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    username: row.username,
    displayName: row.display_name,
    realName: row.real_name,
    avatarHash: row.avatar_hash,
    updatedAt: row.updated_at,
  }));
}

export function upsertUser(user: User): void {
  const db = getDb();
  db.run(
    `INSERT INTO users (id, workspace_id, username, display_name, real_name, avatar_hash, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       username = excluded.username,
       display_name = excluded.display_name,
       real_name = excluded.real_name,
       avatar_hash = excluded.avatar_hash,
       updated_at = excluded.updated_at`,
    [
      user.id,
      user.workspaceId,
      user.username,
      user.displayName,
      user.realName,
      user.avatarHash,
      user.updatedAt,
    ]
  );
}

// ============ Messages ============

export function getMessages(
  channelId: string,
  limit = 100,
  beforeTs?: string
): Message[] {
  const db = getDb();

  let query: string;
  let params: (string | number)[];

  if (beforeTs) {
    query = `SELECT channel_id, ts, user_id, text, thread_ts, reply_count, is_edited, is_deleted, raw_json, cached_at
             FROM messages
             WHERE channel_id = ? AND ts < ? AND is_deleted = 0
             ORDER BY ts DESC
             LIMIT ?`;
    params = [channelId, beforeTs, limit];
  } else {
    query = `SELECT channel_id, ts, user_id, text, thread_ts, reply_count, is_edited, is_deleted, raw_json, cached_at
             FROM messages
             WHERE channel_id = ? AND is_deleted = 0
             ORDER BY ts DESC
             LIMIT ?`;
    params = [channelId, limit];
  }

  const rows = db
    .query<
      {
        channel_id: string;
        ts: string;
        user_id: string | null;
        text: string | null;
        thread_ts: string | null;
        reply_count: number;
        is_edited: number;
        is_deleted: number;
        raw_json: string | null;
        cached_at: number;
      },
      (string | number)[]
    >(query)
    .all(...params);

  return rows.map((row) => ({
    channelId: row.channel_id,
    ts: row.ts,
    userId: row.user_id,
    text: row.text,
    threadTs: row.thread_ts,
    replyCount: row.reply_count,
    isEdited: row.is_edited === 1,
    isDeleted: row.is_deleted === 1,
    rawJson: row.raw_json,
    cachedAt: row.cached_at,
  }));
}

export function getThreadMessages(
  channelId: string,
  threadTs: string
): Message[] {
  const db = getDb();
  const rows = db
    .query<
      {
        channel_id: string;
        ts: string;
        user_id: string | null;
        text: string | null;
        thread_ts: string | null;
        reply_count: number;
        is_edited: number;
        is_deleted: number;
        raw_json: string | null;
        cached_at: number;
      },
      [string, string, string]
    >(
      `SELECT channel_id, ts, user_id, text, thread_ts, reply_count, is_edited, is_deleted, raw_json, cached_at
       FROM messages
       WHERE channel_id = ? AND (ts = ? OR thread_ts = ?) AND is_deleted = 0
       ORDER BY ts ASC`
    )
    .all(channelId, threadTs, threadTs);

  return rows.map((row) => ({
    channelId: row.channel_id,
    ts: row.ts,
    userId: row.user_id,
    text: row.text,
    threadTs: row.thread_ts,
    replyCount: row.reply_count,
    isEdited: row.is_edited === 1,
    isDeleted: row.is_deleted === 1,
    rawJson: row.raw_json,
    cachedAt: row.cached_at,
  }));
}

export function getMessage(channelId: string, ts: string): Message | null {
  const db = getDb();
  const row = db
    .query<
      {
        channel_id: string;
        ts: string;
        user_id: string | null;
        text: string | null;
        thread_ts: string | null;
        reply_count: number;
        is_edited: number;
        is_deleted: number;
        raw_json: string | null;
        cached_at: number;
      },
      [string, string]
    >(
      'SELECT channel_id, ts, user_id, text, thread_ts, reply_count, is_edited, is_deleted, raw_json, cached_at FROM messages WHERE channel_id = ? AND ts = ?'
    )
    .get(channelId, ts);

  if (!row) return null;

  return {
    channelId: row.channel_id,
    ts: row.ts,
    userId: row.user_id,
    text: row.text,
    threadTs: row.thread_ts,
    replyCount: row.reply_count,
    isEdited: row.is_edited === 1,
    isDeleted: row.is_deleted === 1,
    rawJson: row.raw_json,
    cachedAt: row.cached_at,
  };
}

export function upsertMessage(message: Message): void {
  const db = getDb();
  db.run(
    `INSERT INTO messages (channel_id, ts, user_id, text, thread_ts, reply_count, is_edited, is_deleted, raw_json, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(channel_id, ts) DO UPDATE SET
       user_id = excluded.user_id,
       text = excluded.text,
       thread_ts = excluded.thread_ts,
       reply_count = excluded.reply_count,
       is_edited = excluded.is_edited,
       is_deleted = excluded.is_deleted,
       raw_json = excluded.raw_json,
       cached_at = excluded.cached_at`,
    [
      message.channelId,
      message.ts,
      message.userId,
      message.text,
      message.threadTs,
      message.replyCount,
      message.isEdited ? 1 : 0,
      message.isDeleted ? 1 : 0,
      message.rawJson,
      message.cachedAt,
    ]
  );
}

export function markMessageDeleted(channelId: string, ts: string): void {
  const db = getDb();
  db.run(
    'UPDATE messages SET is_deleted = 1 WHERE channel_id = ? AND ts = ?',
    [channelId, ts]
  );
}

// ============ Reactions ============

export function getReactions(channelId: string, messageTs: string): Reaction[] {
  const db = getDb();
  const rows = db
    .query<
      {
        channel_id: string;
        message_ts: string;
        emoji: string;
        user_id: string;
      },
      [string, string]
    >(
      'SELECT channel_id, message_ts, emoji, user_id FROM reactions WHERE channel_id = ? AND message_ts = ?'
    )
    .all(channelId, messageTs);

  return rows.map((row) => ({
    channelId: row.channel_id,
    messageTs: row.message_ts,
    emoji: row.emoji,
    userId: row.user_id,
  }));
}

export function addReaction(reaction: Reaction): void {
  const db = getDb();
  db.run(
    `INSERT OR IGNORE INTO reactions (channel_id, message_ts, emoji, user_id)
     VALUES (?, ?, ?, ?)`,
    [reaction.channelId, reaction.messageTs, reaction.emoji, reaction.userId]
  );
}

export function removeReaction(reaction: Reaction): void {
  const db = getDb();
  db.run(
    'DELETE FROM reactions WHERE channel_id = ? AND message_ts = ? AND emoji = ? AND user_id = ?',
    [reaction.channelId, reaction.messageTs, reaction.emoji, reaction.userId]
  );
}

// ============ Outbox ============

export function getPendingOutboxItems(): OutboxItem[] {
  const db = getDb();
  const rows = db
    .query<
      {
        id: number;
        command_type: string;
        payload: string;
        status: string;
        attempts: number;
        created_at: number;
        last_attempt_at: number | null;
      },
      []
    >(
      `SELECT id, command_type, payload, status, attempts, created_at, last_attempt_at
       FROM outbox
       WHERE status = 'pending'
       ORDER BY created_at ASC`
    )
    .all();

  return rows.map((row) => ({
    id: row.id,
    commandType: row.command_type,
    payload: row.payload,
    status: row.status as OutboxItem['status'],
    attempts: row.attempts,
    createdAt: row.created_at,
    lastAttemptAt: row.last_attempt_at,
  }));
}

export function addToOutbox(commandType: string, payload: unknown): number {
  const db = getDb();
  const result = db.run(
    `INSERT INTO outbox (command_type, payload, status, attempts, created_at)
     VALUES (?, ?, 'pending', 0, ?)`,
    [commandType, JSON.stringify(payload), Math.floor(Date.now() / 1000)]
  );
  return Number(result.lastInsertRowid);
}

export function updateOutboxStatus(
  id: number,
  status: OutboxItem['status']
): void {
  const db = getDb();
  db.run(
    'UPDATE outbox SET status = ?, attempts = attempts + 1, last_attempt_at = ? WHERE id = ?',
    [status, Math.floor(Date.now() / 1000), id]
  );
}

export function removeFromOutbox(id: number): void {
  const db = getDb();
  db.run('DELETE FROM outbox WHERE id = ?', [id]);
}

// ============ Cleanup ============

export function cleanupOldMessages(retentionDays: number): number {
  const db = getDb();
  const cutoff = Math.floor(Date.now() / 1000) - retentionDays * 24 * 60 * 60;
  const result = db.run('DELETE FROM messages WHERE cached_at < ?', [cutoff]);
  return result.changes;
}

export function cleanupOldReactions(retentionDays: number): number {
  const db = getDb();
  // Delete reactions for messages that no longer exist
  const result = db.run(
    `DELETE FROM reactions
     WHERE NOT EXISTS (
       SELECT 1 FROM messages
       WHERE messages.channel_id = reactions.channel_id
         AND messages.ts = reactions.message_ts
     )`
  );
  return result.changes;
}
