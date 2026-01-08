/**
 * Command dispatcher
 * All user actions go through this dispatcher
 */
import type { Command, CommandResult } from './types';
import * as handlers from './handlers';
import { log } from '../../utils/logger';

/**
 * Execute a command
 */
export async function execute(command: Command): Promise<CommandResult> {
  log.debug('Executing command', { type: command.type });

  try {
    switch (command.type) {
      case 'SwitchChannel':
        return handlers.switchChannel(command);

      case 'OpenThread':
        return handlers.openThread(command);

      case 'CloseThread':
        return handlers.closeThread();

      case 'SendMessage':
        return handlers.sendMessage(command);

      case 'AddReaction':
        return handlers.addReaction(command);

      case 'RemoveReaction':
        return handlers.removeReaction(command);

      case 'EditMessage':
        return handlers.editMessage(command);

      case 'DeleteMessage':
        return handlers.deleteMessage(command);

      case 'MarkRead':
        return handlers.markRead(command);

      case 'FetchMessages':
        return handlers.fetchMessages(command);

      case 'FetchChannels':
        return handlers.fetchChannels();

      case 'FetchUsers':
        return handlers.fetchUsers();

      case 'Refresh':
        return handlers.refresh();

      case 'Reconnect':
        return handlers.reconnect();

      default: {
        const _exhaustive: never = command;
        return { success: false, error: `Unknown command: ${JSON.stringify(_exhaustive)}` };
      }
    }
  } catch (error) {
    log.error('Command execution failed', { type: command.type, error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      retryable: true,
    };
  }
}

// Re-export types
export type { Command, CommandResult } from './types';
