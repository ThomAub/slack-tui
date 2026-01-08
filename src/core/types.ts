/**
 * Domain types for slacktui
 * These represent the core data model used throughout the application
 */

// Channel types matching Slack's channel types
export type ChannelType = 'public_channel' | 'private_channel' | 'im' | 'mpim';

// Connection states for network status
export type ConnectionState = 'ONLINE' | 'DEGRADED' | 'OFFLINE';

// Workspace (future-proofing for multi-workspace)
export interface Workspace {
  id: string;
  name: string;
  teamId: string;
  createdAt: number;
}

// Channel (public, private, DM, group DM)
export interface Channel {
  id: string; // C0123456789
  workspaceId: string;
  name: string | null; // null for DMs
  type: ChannelType;
  isMember: boolean;
  isArchived: boolean;
  lastReadTs: string | null; // Timestamp of last read
  updatedAt: number;
}

// User
export interface User {
  id: string; // U0123456789
  workspaceId: string;
  username: string | null;
  displayName: string | null;
  realName: string | null;
  avatarHash: string | null;
  updatedAt: number;
}

// Message
export interface Message {
  channelId: string;
  ts: string; // Slack timestamp (unique per channel)
  userId: string | null;
  text: string | null;
  threadTs: string | null; // Parent message ts (if reply)
  replyCount: number;
  isEdited: boolean;
  isDeleted: boolean;
  rawJson: string | null; // Full payload for edge cases
  cachedAt: number;
}

// Reaction
export interface Reaction {
  channelId: string;
  messageTs: string;
  emoji: string;
  userId: string;
}

// Outbox item for offline actions
export type OutboxStatus = 'pending' | 'in_flight' | 'failed';

export interface OutboxItem {
  id: number;
  commandType: string;
  payload: string; // JSON
  status: OutboxStatus;
  attempts: number;
  createdAt: number;
  lastAttemptAt: number | null;
}

// Domain events emitted by the core runtime
export type DomainEvent =
  | { type: 'ChannelCreated'; channel: Channel }
  | { type: 'ChannelUpdated'; channel: Channel }
  | { type: 'ChannelDeleted'; channelId: string }
  | { type: 'MessageReceived'; message: Message }
  | { type: 'MessageUpdated'; message: Message }
  | { type: 'MessageDeleted'; channelId: string; ts: string }
  | { type: 'ReactionAdded'; reaction: Reaction }
  | { type: 'ReactionRemoved'; reaction: Reaction }
  | { type: 'UserUpdated'; user: User }
  | { type: 'ConnectionStateChanged'; state: ConnectionState }
  | { type: 'Error'; error: Error; context?: string };

// Event listener type
export type DomainEventListener = (event: DomainEvent) => void;
