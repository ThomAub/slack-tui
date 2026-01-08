/**
 * Slack Web API client wrapper with rate limiting and retries
 */
import { WebClient, type WebAPICallResult } from '@slack/web-api';
import { getRateLimiter } from './rateLimit';
import {
  normalizeChannel,
  normalizeMessage,
  normalizeUser,
} from './normalize';
import type { Channel, Message, User } from '../types';
import type { SlackChannel, SlackMessage, SlackUser } from './types';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export interface SlackWebClientConfig {
  botToken: string;
  userToken?: string;
}

export class SlackWebClient {
  private client: WebClient;
  private userClient?: WebClient;
  private rateLimiter = getRateLimiter();
  private workspaceId: string | null = null;

  constructor(config: SlackWebClientConfig) {
    this.client = new WebClient(config.botToken);
    if (config.userToken) {
      this.userClient = new WebClient(config.userToken);
    }
  }

  /**
   * Test authentication and get workspace info
   */
  async testAuth(): Promise<{
    ok: boolean;
    userId?: string;
    teamId?: string;
    team?: string;
    error?: string;
  }> {
    try {
      await this.rateLimiter.acquire('auth.test');
      const result = await this.client.auth.test();

      if (result.ok) {
        this.workspaceId = result.team_id as string;
      }

      return {
        ok: result.ok,
        userId: result.user_id as string | undefined,
        teamId: result.team_id as string | undefined,
        team: result.team as string | undefined,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get workspace ID (must call testAuth first)
   */
  getWorkspaceId(): string {
    if (!this.workspaceId) {
      throw new Error('Workspace ID not set. Call testAuth() first.');
    }
    return this.workspaceId;
  }

  /**
   * List channels the bot is a member of
   */
  async listChannels(cursor?: string): Promise<{
    channels: Channel[];
    nextCursor?: string;
  }> {
    const workspaceId = this.getWorkspaceId();
    await this.rateLimiter.acquire('conversations.list');

    const result = await this.retryOnError(() =>
      this.client.conversations.list({
        types: 'public_channel,private_channel,mpim,im',
        exclude_archived: true,
        limit: 200,
        cursor,
      })
    );

    const slackChannels = (result.channels ?? []) as SlackChannel[];
    const channels = slackChannels.map((c) =>
      normalizeChannel(c, workspaceId)
    );

    return {
      channels,
      nextCursor: result.response_metadata?.next_cursor || undefined,
    };
  }

  /**
   * Get channel info
   */
  async getChannelInfo(channelId: string): Promise<Channel | null> {
    const workspaceId = this.getWorkspaceId();
    await this.rateLimiter.acquire('conversations.info');

    try {
      const result = await this.retryOnError(() =>
        this.client.conversations.info({ channel: channelId })
      );

      const channel = result.channel as SlackChannel | undefined;
      if (!channel) return null;

      return normalizeChannel(channel, workspaceId);
    } catch {
      return null;
    }
  }

  /**
   * Get channel message history
   */
  async getMessages(
    channelId: string,
    options?: { cursor?: string; limit?: number; oldest?: string; latest?: string }
  ): Promise<{
    messages: Message[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    await this.rateLimiter.acquire('conversations.history');

    const result = await this.retryOnError(() =>
      this.client.conversations.history({
        channel: channelId,
        limit: options?.limit ?? 100,
        cursor: options?.cursor,
        oldest: options?.oldest,
        latest: options?.latest,
      })
    );

    const slackMessages = (result.messages ?? []) as SlackMessage[];
    const messages = slackMessages.map((m) => normalizeMessage(m, channelId));

    return {
      messages,
      nextCursor: result.response_metadata?.next_cursor || undefined,
      hasMore: result.has_more ?? false,
    };
  }

  /**
   * Get thread replies
   */
  async getThreadReplies(
    channelId: string,
    threadTs: string,
    cursor?: string
  ): Promise<{
    messages: Message[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    await this.rateLimiter.acquire('conversations.replies');

    const result = await this.retryOnError(() =>
      this.client.conversations.replies({
        channel: channelId,
        ts: threadTs,
        limit: 100,
        cursor,
      })
    );

    const slackMessages = (result.messages ?? []) as SlackMessage[];
    const messages = slackMessages.map((m) => normalizeMessage(m, channelId));

    return {
      messages,
      nextCursor: result.response_metadata?.next_cursor || undefined,
      hasMore: result.has_more ?? false,
    };
  }

  /**
   * Get user info
   */
  async getUserInfo(userId: string): Promise<User | null> {
    const workspaceId = this.getWorkspaceId();
    await this.rateLimiter.acquire('users.info');

    try {
      const result = await this.retryOnError(() =>
        this.client.users.info({ user: userId })
      );

      const user = result.user as SlackUser | undefined;
      if (!user) return null;

      return normalizeUser(user, workspaceId);
    } catch {
      return null;
    }
  }

  /**
   * List workspace users
   */
  async listUsers(cursor?: string): Promise<{
    users: User[];
    nextCursor?: string;
  }> {
    const workspaceId = this.getWorkspaceId();
    await this.rateLimiter.acquire('users.list');

    const result = await this.retryOnError(() =>
      this.client.users.list({
        limit: 200,
        cursor,
      })
    );

    const slackUsers = (result.members ?? []) as SlackUser[];
    const users = slackUsers
      .filter((u) => !u.deleted && !u.is_bot)
      .map((u) => normalizeUser(u, workspaceId));

    return {
      users,
      nextCursor: result.response_metadata?.next_cursor || undefined,
    };
  }

  /**
   * Send a message
   */
  async sendMessage(
    channelId: string,
    text: string,
    threadTs?: string
  ): Promise<{ ok: boolean; ts?: string; error?: string }> {
    await this.rateLimiter.acquire('chat.postMessage');

    try {
      const result = await this.retryOnError(() =>
        this.client.chat.postMessage({
          channel: channelId,
          text,
          thread_ts: threadTs,
        })
      );

      return {
        ok: result.ok,
        ts: result.ts as string | undefined,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update a message
   */
  async updateMessage(
    channelId: string,
    ts: string,
    text: string
  ): Promise<{ ok: boolean; error?: string }> {
    await this.rateLimiter.acquire('chat.update');

    try {
      const result = await this.retryOnError(() =>
        this.client.chat.update({
          channel: channelId,
          ts,
          text,
        })
      );

      return { ok: result.ok };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete a message
   */
  async deleteMessage(
    channelId: string,
    ts: string
  ): Promise<{ ok: boolean; error?: string }> {
    await this.rateLimiter.acquire('chat.delete');

    try {
      const result = await this.retryOnError(() =>
        this.client.chat.delete({
          channel: channelId,
          ts,
        })
      );

      return { ok: result.ok };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Add a reaction
   */
  async addReaction(
    channelId: string,
    ts: string,
    emoji: string
  ): Promise<{ ok: boolean; error?: string }> {
    await this.rateLimiter.acquire('reactions.add');

    try {
      const result = await this.retryOnError(() =>
        this.client.reactions.add({
          channel: channelId,
          timestamp: ts,
          name: emoji,
        })
      );

      return { ok: result.ok };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Remove a reaction
   */
  async removeReaction(
    channelId: string,
    ts: string,
    emoji: string
  ): Promise<{ ok: boolean; error?: string }> {
    await this.rateLimiter.acquire('reactions.remove');

    try {
      const result = await this.retryOnError(() =>
        this.client.reactions.remove({
          channel: channelId,
          timestamp: ts,
          name: emoji,
        })
      );

      return { ok: result.ok };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Mark channel as read
   */
  async markRead(
    channelId: string,
    ts: string
  ): Promise<{ ok: boolean; error?: string }> {
    await this.rateLimiter.acquire('conversations.mark');

    try {
      const result = await this.retryOnError(() =>
        this.client.conversations.mark({
          channel: channelId,
          ts,
        })
      );

      return { ok: result.ok };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Retry a request on transient errors
   */
  private async retryOnError<T extends WebAPICallResult>(
    fn: () => Promise<T>
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await fn();

        // Check for rate limiting
        if (!result.ok && result.error === 'ratelimited') {
          const retryAfter = (result as unknown as { retry_after?: number }).retry_after ?? 30;
          const method = 'unknown'; // We don't have method context here
          this.rateLimiter.handleRateLimit(method, retryAfter);
          await this.sleep(retryAfter * 1000);
          continue;
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        if (this.isRetryableError(lastError)) {
          await this.sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
          continue;
        }

        throw lastError;
      }
    }

    throw lastError ?? new Error('Max retries exceeded');
  }

  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('socket hang up')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
