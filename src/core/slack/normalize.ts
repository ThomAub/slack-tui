/**
 * Normalize Slack API payloads to domain events
 */
import type { DomainEvent, Channel, Message, User, Reaction } from '../types';
import type {
  SlackChannel,
  SlackMessage,
  SlackUser,
  SlackEvent,
  MessageEvent,
  ReactionAddedEvent,
  ReactionRemovedEvent,
  ChannelEvent,
} from './types';

/**
 * Normalize a Slack channel to domain Channel
 */
export function normalizeChannel(
  slackChannel: SlackChannel,
  workspaceId: string
): Channel {
  let type: Channel['type'];
  if (slackChannel.is_im) {
    type = 'im';
  } else if (slackChannel.is_mpim) {
    type = 'mpim';
  } else if (slackChannel.is_private) {
    type = 'private_channel';
  } else {
    type = 'public_channel';
  }

  return {
    id: slackChannel.id,
    workspaceId,
    name: slackChannel.name ?? null,
    type,
    isMember: slackChannel.is_member ?? true,
    isArchived: slackChannel.is_archived ?? false,
    lastReadTs: slackChannel.last_read ?? null,
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Normalize a Slack message to domain Message
 */
export function normalizeMessage(
  slackMessage: SlackMessage,
  channelId: string
): Message {
  return {
    channelId,
    ts: slackMessage.ts,
    userId: slackMessage.user ?? null,
    text: slackMessage.text ?? null,
    threadTs: slackMessage.thread_ts ?? null,
    replyCount: slackMessage.reply_count ?? 0,
    isEdited: !!slackMessage.edited,
    isDeleted: !!slackMessage.deleted_ts,
    rawJson: JSON.stringify(slackMessage),
    cachedAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Normalize a Slack user to domain User
 */
export function normalizeUser(
  slackUser: SlackUser,
  workspaceId: string
): User {
  return {
    id: slackUser.id,
    workspaceId,
    username: slackUser.name ?? null,
    displayName: slackUser.profile?.display_name ?? null,
    realName: slackUser.real_name ?? slackUser.profile?.real_name ?? null,
    avatarHash: slackUser.profile?.avatar_hash ?? null,
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Normalize a Slack reaction to domain Reaction
 */
export function normalizeReaction(
  emoji: string,
  userId: string,
  channelId: string,
  messageTs: string
): Reaction {
  return {
    channelId,
    messageTs,
    emoji,
    userId,
  };
}

/**
 * Convert a Slack real-time event to domain events
 */
export function normalizeEvent(
  event: SlackEvent,
  workspaceId: string
): DomainEvent[] {
  const events: DomainEvent[] = [];

  switch (event.type) {
    case 'message':
      events.push(...normalizeMessageEvent(event as MessageEvent, workspaceId));
      break;

    case 'reaction_added':
      events.push(normalizeReactionAddedEvent(event as ReactionAddedEvent));
      break;

    case 'reaction_removed':
      events.push(normalizeReactionRemovedEvent(event as ReactionRemovedEvent));
      break;

    case 'channel_created':
    case 'channel_rename':
    case 'channel_archive':
    case 'channel_unarchive':
      events.push(normalizeChannelEvent(event as ChannelEvent, workspaceId));
      break;

    case 'channel_deleted':
      events.push({
        type: 'ChannelDeleted',
        channelId: (event as ChannelEvent).channel.id,
      });
      break;
  }

  return events;
}

/**
 * Normalize message events
 */
function normalizeMessageEvent(
  event: MessageEvent,
  _workspaceId: string
): DomainEvent[] {
  const events: DomainEvent[] = [];

  // Handle message subtypes
  switch (event.subtype) {
    case 'message_deleted':
      if (event.deleted_ts) {
        events.push({
          type: 'MessageDeleted',
          channelId: event.channel,
          ts: event.deleted_ts,
        });
      }
      break;

    case 'message_changed':
      if (event.message) {
        events.push({
          type: 'MessageUpdated',
          message: normalizeMessage(event.message, event.channel),
        });
      }
      break;

    default:
      // Regular message or thread reply
      if (!event.hidden) {
        events.push({
          type: 'MessageReceived',
          message: normalizeMessage(
            {
              type: 'message',
              ts: event.ts,
              user: event.user,
              text: event.text,
              thread_ts: event.thread_ts,
              edited: event.edited,
            },
            event.channel
          ),
        });
      }
      break;
  }

  return events;
}

/**
 * Normalize reaction added event
 */
function normalizeReactionAddedEvent(
  event: ReactionAddedEvent
): DomainEvent {
  return {
    type: 'ReactionAdded',
    reaction: normalizeReaction(
      event.reaction,
      event.user,
      event.item.channel,
      event.item.ts
    ),
  };
}

/**
 * Normalize reaction removed event
 */
function normalizeReactionRemovedEvent(
  event: ReactionRemovedEvent
): DomainEvent {
  return {
    type: 'ReactionRemoved',
    reaction: normalizeReaction(
      event.reaction,
      event.user,
      event.item.channel,
      event.item.ts
    ),
  };
}

/**
 * Normalize channel events
 */
function normalizeChannelEvent(
  event: ChannelEvent,
  workspaceId: string
): DomainEvent {
  const channel = event.channel as SlackChannel;

  if (event.type === 'channel_created') {
    return {
      type: 'ChannelCreated',
      channel: normalizeChannel(channel, workspaceId),
    };
  }

  return {
    type: 'ChannelUpdated',
    channel: normalizeChannel(channel, workspaceId),
  };
}
