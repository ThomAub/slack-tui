/**
 * Command handlers
 */
import type { CommandResult, CommandOfType } from '../types';
import { getRuntime } from '../../runtime';
import * as queries from '../../store/queries';
import { applyEvent } from '../../store/writeModel';
import { log } from '../../../utils/logger';

/**
 * Switch to a different channel
 */
export async function switchChannel(
  command: CommandOfType<'SwitchChannel'>
): Promise<CommandResult> {
  const channel = queries.getChannel(command.channelId);
  if (!channel) {
    return { success: false, error: 'Channel not found' };
  }

  // Fetch messages if cache is stale
  const messages = queries.getMessages(command.channelId, 1);
  const now = Math.floor(Date.now() / 1000);
  const staleThreshold = 300; // 5 minutes

  if (messages.length === 0 || now - messages[0].cachedAt > staleThreshold) {
    await fetchMessages({ type: 'FetchMessages', channelId: command.channelId });
  }

  return { success: true, data: { channel } };
}

/**
 * Open a thread
 */
export async function openThread(
  command: CommandOfType<'OpenThread'>
): Promise<CommandResult> {
  const runtime = getRuntime();
  if (!runtime) {
    return { success: false, error: 'Runtime not initialized' };
  }

  // Fetch thread replies
  const result = await runtime.webClient.getThreadReplies(
    command.channelId,
    command.parentTs
  );

  // Store messages in cache
  for (const message of result.messages) {
    applyEvent({ type: 'MessageReceived', message });
  }

  return { success: true, data: { messages: result.messages } };
}

/**
 * Close the current thread
 */
export async function closeThread(): Promise<CommandResult> {
  return { success: true };
}

/**
 * Send a message
 */
export async function sendMessage(
  command: CommandOfType<'SendMessage'>
): Promise<CommandResult> {
  const runtime = getRuntime();
  if (!runtime) {
    return { success: false, error: 'Runtime not initialized' };
  }

  const result = await runtime.webClient.sendMessage(
    command.channelId,
    command.text,
    command.threadTs
  );

  if (!result.ok) {
    return { success: false, error: result.error ?? 'Failed to send message' };
  }

  return { success: true, data: { ts: result.ts } };
}

/**
 * Add a reaction
 */
export async function addReaction(
  command: CommandOfType<'AddReaction'>
): Promise<CommandResult> {
  const runtime = getRuntime();
  if (!runtime) {
    return { success: false, error: 'Runtime not initialized' };
  }

  const result = await runtime.webClient.addReaction(
    command.channelId,
    command.ts,
    command.emoji
  );

  if (!result.ok) {
    return { success: false, error: result.error ?? 'Failed to add reaction' };
  }

  return { success: true };
}

/**
 * Remove a reaction
 */
export async function removeReaction(
  command: CommandOfType<'RemoveReaction'>
): Promise<CommandResult> {
  const runtime = getRuntime();
  if (!runtime) {
    return { success: false, error: 'Runtime not initialized' };
  }

  const result = await runtime.webClient.removeReaction(
    command.channelId,
    command.ts,
    command.emoji
  );

  if (!result.ok) {
    return { success: false, error: result.error ?? 'Failed to remove reaction' };
  }

  return { success: true };
}

/**
 * Edit a message
 */
export async function editMessage(
  command: CommandOfType<'EditMessage'>
): Promise<CommandResult> {
  const runtime = getRuntime();
  if (!runtime) {
    return { success: false, error: 'Runtime not initialized' };
  }

  const result = await runtime.webClient.updateMessage(
    command.channelId,
    command.ts,
    command.text
  );

  if (!result.ok) {
    return { success: false, error: result.error ?? 'Failed to edit message' };
  }

  return { success: true };
}

/**
 * Delete a message
 */
export async function deleteMessage(
  command: CommandOfType<'DeleteMessage'>
): Promise<CommandResult> {
  const runtime = getRuntime();
  if (!runtime) {
    return { success: false, error: 'Runtime not initialized' };
  }

  const result = await runtime.webClient.deleteMessage(
    command.channelId,
    command.ts
  );

  if (!result.ok) {
    return { success: false, error: result.error ?? 'Failed to delete message' };
  }

  // Update local cache
  applyEvent({ type: 'MessageDeleted', channelId: command.channelId, ts: command.ts });

  return { success: true };
}

/**
 * Mark channel as read
 */
export async function markRead(
  command: CommandOfType<'MarkRead'>
): Promise<CommandResult> {
  const runtime = getRuntime();
  if (!runtime) {
    return { success: false, error: 'Runtime not initialized' };
  }

  const result = await runtime.webClient.markRead(command.channelId, command.ts);

  if (!result.ok) {
    log.warn('Failed to mark channel as read', { error: result.error });
    // Don't fail the command, just log the warning
  }

  return { success: true };
}

/**
 * Fetch messages for a channel
 */
export async function fetchMessages(
  command: CommandOfType<'FetchMessages'>
): Promise<CommandResult> {
  const runtime = getRuntime();
  if (!runtime) {
    return { success: false, error: 'Runtime not initialized' };
  }

  const result = await runtime.webClient.getMessages(command.channelId, {
    cursor: command.cursor,
  });

  // Store messages in cache
  for (const message of result.messages) {
    applyEvent({ type: 'MessageReceived', message });
  }

  return {
    success: true,
    data: {
      messages: result.messages,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
    },
  };
}

/**
 * Fetch all channels
 */
export async function fetchChannels(): Promise<CommandResult> {
  const runtime = getRuntime();
  if (!runtime) {
    return { success: false, error: 'Runtime not initialized' };
  }

  const allChannels = [];
  let cursor: string | undefined;

  do {
    const result = await runtime.webClient.listChannels(cursor);
    allChannels.push(...result.channels);
    cursor = result.nextCursor;
  } while (cursor);

  // Store channels in cache
  for (const channel of allChannels) {
    applyEvent({ type: 'ChannelUpdated', channel });
  }

  return { success: true, data: { channels: allChannels } };
}

/**
 * Fetch all users
 */
export async function fetchUsers(): Promise<CommandResult> {
  const runtime = getRuntime();
  if (!runtime) {
    return { success: false, error: 'Runtime not initialized' };
  }

  const allUsers = [];
  let cursor: string | undefined;

  do {
    const result = await runtime.webClient.listUsers(cursor);
    allUsers.push(...result.users);
    cursor = result.nextCursor;
  } while (cursor);

  // Store users in cache
  for (const user of allUsers) {
    applyEvent({ type: 'UserUpdated', user });
  }

  return { success: true, data: { users: allUsers } };
}

/**
 * Refresh all data
 */
export async function refresh(): Promise<CommandResult> {
  await fetchChannels();
  await fetchUsers();
  return { success: true };
}

/**
 * Reconnect Socket Mode
 */
export async function reconnect(): Promise<CommandResult> {
  const runtime = getRuntime();
  if (!runtime) {
    return { success: false, error: 'Runtime not initialized' };
  }

  await runtime.reconnect();
  return { success: true };
}
