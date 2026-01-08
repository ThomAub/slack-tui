/**
 * Command types for slacktui
 * All user actions go through the command dispatcher
 */

// All available commands
export type Command =
  | { type: 'SwitchChannel'; channelId: string }
  | { type: 'OpenThread'; channelId: string; parentTs: string }
  | { type: 'CloseThread' }
  | { type: 'SendMessage'; channelId: string; text: string; threadTs?: string }
  | { type: 'AddReaction'; channelId: string; ts: string; emoji: string }
  | { type: 'RemoveReaction'; channelId: string; ts: string; emoji: string }
  | { type: 'EditMessage'; channelId: string; ts: string; text: string }
  | { type: 'DeleteMessage'; channelId: string; ts: string }
  | { type: 'MarkRead'; channelId: string; ts: string }
  | { type: 'FetchMessages'; channelId: string; cursor?: string }
  | { type: 'FetchChannels' }
  | { type: 'FetchUsers' }
  | { type: 'Refresh' }
  | { type: 'Reconnect' };

// Command result
export type CommandResult =
  | { success: true; data?: unknown }
  | { success: false; error: string; retryable?: boolean };

// Command handler type
export type CommandHandler<T extends Command = Command> = (
  command: T
) => Promise<CommandResult>;

// Extract command by type
export type CommandOfType<T extends Command['type']> = Extract<
  Command,
  { type: T }
>;
