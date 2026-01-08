/**
 * Offline action queue management
 */
import type { Command } from '../commands/types';
import type { OutboxItem } from '../types';
import * as queries from './queries';

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 1000;

/**
 * Queue a command for later execution (offline mode)
 */
export function queueCommand(command: Command): number {
  return queries.addToOutbox(command.type, command);
}

/**
 * Get all pending commands
 */
export function getPendingCommands(): OutboxItem[] {
  return queries.getPendingOutboxItems();
}

/**
 * Mark a command as in-flight
 */
export function markInFlight(id: number): void {
  queries.updateOutboxStatus(id, 'in_flight');
}

/**
 * Mark a command as failed
 */
export function markFailed(id: number): void {
  const items = queries.getPendingOutboxItems();
  const item = items.find((i) => i.id === id);

  if (item && item.attempts >= MAX_ATTEMPTS) {
    // Give up after max attempts
    queries.updateOutboxStatus(id, 'failed');
  } else {
    // Reset to pending for retry
    queries.updateOutboxStatus(id, 'pending');
  }
}

/**
 * Remove a successfully processed command
 */
export function markCompleted(id: number): void {
  queries.removeFromOutbox(id);
}

/**
 * Calculate backoff delay for retry
 */
export function getRetryDelay(attempts: number): number {
  // Exponential backoff with jitter
  const delay = BASE_DELAY_MS * Math.pow(2, attempts);
  const jitter = Math.random() * 0.3 * delay;
  return Math.min(delay + jitter, 30000); // Cap at 30 seconds
}

/**
 * Parse command from outbox item
 */
export function parseCommand(item: OutboxItem): Command | null {
  try {
    const payload = JSON.parse(item.payload) as Record<string, unknown>;
    return { type: item.commandType, ...payload } as Command;
  } catch {
    return null;
  }
}
