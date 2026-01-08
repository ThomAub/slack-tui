/**
 * Apply domain events to the database
 */
import type { DomainEvent } from '../types';
import * as queries from './queries';

/**
 * Apply a domain event to the database
 */
export function applyEvent(event: DomainEvent): void {
  switch (event.type) {
    case 'ChannelCreated':
    case 'ChannelUpdated':
      queries.upsertChannel(event.channel);
      break;

    case 'ChannelDeleted':
      queries.deleteChannel(event.channelId);
      break;

    case 'MessageReceived':
    case 'MessageUpdated':
      queries.upsertMessage(event.message);
      break;

    case 'MessageDeleted':
      queries.markMessageDeleted(event.channelId, event.ts);
      break;

    case 'ReactionAdded':
      queries.addReaction(event.reaction);
      break;

    case 'ReactionRemoved':
      queries.removeReaction(event.reaction);
      break;

    case 'UserUpdated':
      queries.upsertUser(event.user);
      break;

    case 'ConnectionStateChanged':
    case 'Error':
      // These events don't need to be persisted
      break;
  }
}

/**
 * Apply multiple events in a transaction
 */
export function applyEvents(events: DomainEvent[]): void {
  for (const event of events) {
    applyEvent(event);
  }
}
