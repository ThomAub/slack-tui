/**
 * Slack API types
 * These represent the raw data structures from Slack's API
 */

// Slack channel from conversations.list
export interface SlackChannel {
  id: string;
  name?: string;
  is_channel?: boolean;
  is_group?: boolean;
  is_im?: boolean;
  is_mpim?: boolean;
  is_private?: boolean;
  is_archived?: boolean;
  is_member?: boolean;
  created?: number;
  creator?: string;
  topic?: { value: string };
  purpose?: { value: string };
  num_members?: number;
  last_read?: string;
}

// Slack user from users.info
export interface SlackUser {
  id: string;
  name?: string;
  real_name?: string;
  profile?: {
    display_name?: string;
    real_name?: string;
    image_32?: string;
    image_48?: string;
    image_72?: string;
    avatar_hash?: string;
  };
  deleted?: boolean;
  is_bot?: boolean;
}

// Slack message from conversations.history
export interface SlackMessage {
  type: string;
  subtype?: string;
  ts: string;
  user?: string;
  text?: string;
  thread_ts?: string;
  reply_count?: number;
  reactions?: SlackReaction[];
  edited?: { user: string; ts: string };
  deleted_ts?: string;
  files?: SlackFile[];
  attachments?: SlackAttachment[];
  blocks?: unknown[];
}

// Slack reaction
export interface SlackReaction {
  name: string;
  count: number;
  users: string[];
}

// Slack file (not fully implemented for MVP)
export interface SlackFile {
  id: string;
  name?: string;
  title?: string;
  mimetype?: string;
  size?: number;
  url_private?: string;
}

// Slack attachment (legacy)
export interface SlackAttachment {
  fallback?: string;
  color?: string;
  pretext?: string;
  author_name?: string;
  title?: string;
  text?: string;
  fields?: { title: string; value: string; short: boolean }[];
}

// Socket Mode event envelope
export interface SocketModeEvent {
  envelope_id: string;
  type: string;
  payload: SocketModePayload;
  accepts_response_payload?: boolean;
  retry_attempt?: number;
  retry_reason?: string;
}

// Socket Mode payload types
export type SocketModePayload =
  | EventsApiPayload
  | SlashCommandPayload
  | InteractivePayload;

export interface EventsApiPayload {
  type: 'events_api';
  event_id: string;
  event_time: number;
  event: SlackEvent;
  team_id: string;
  api_app_id: string;
}

export interface SlashCommandPayload {
  type: 'slash_commands';
  command: string;
  text: string;
  user_id: string;
  channel_id: string;
}

export interface InteractivePayload {
  type: 'interactive';
  action_id?: string;
  block_id?: string;
  user: { id: string };
  channel?: { id: string };
}

// Slack real-time events
export type SlackEvent =
  | MessageEvent
  | ReactionAddedEvent
  | ReactionRemovedEvent
  | ChannelEvent
  | MemberJoinedEvent
  | MemberLeftEvent;

export interface MessageEvent {
  type: 'message';
  subtype?: string;
  channel: string;
  user?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  edited?: { user: string; ts: string };
  deleted_ts?: string;
  hidden?: boolean;
  message?: SlackMessage; // For message_changed subtype
  previous_message?: SlackMessage;
}

export interface ReactionAddedEvent {
  type: 'reaction_added';
  user: string;
  reaction: string;
  item: { type: string; channel: string; ts: string };
  event_ts: string;
}

export interface ReactionRemovedEvent {
  type: 'reaction_removed';
  user: string;
  reaction: string;
  item: { type: string; channel: string; ts: string };
  event_ts: string;
}

export interface ChannelEvent {
  type: 'channel_created' | 'channel_deleted' | 'channel_rename' | 'channel_archive' | 'channel_unarchive';
  channel: SlackChannel | { id: string; name?: string };
}

export interface MemberJoinedEvent {
  type: 'member_joined_channel';
  user: string;
  channel: string;
  inviter?: string;
}

export interface MemberLeftEvent {
  type: 'member_left_channel';
  user: string;
  channel: string;
}

// API response wrapper
export interface SlackApiResponse<T> {
  ok: boolean;
  error?: string;
  response_metadata?: {
    next_cursor?: string;
    scopes?: string[];
  };
  // The actual data varies by endpoint
  [key: string]: unknown;
}
