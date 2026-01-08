/**
 * Socket Mode transport for real-time Slack events
 */
import { SocketModeClient } from '@slack/socket-mode';
import { normalizeEvent } from './normalize';
import type { DomainEvent, DomainEventListener } from '../types';
import type { EventsApiPayload, SlackEvent } from './types';
import { log } from '../../utils/logger';

const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const ENVELOPE_CACHE_SIZE = 1000;

export interface SocketModeConfig {
  appToken: string;
  workspaceId: string;
}

export class SocketModeTransport {
  private client: SocketModeClient;
  private workspaceId: string;
  private listeners: Set<DomainEventListener> = new Set();
  private seenEnvelopes: Set<string> = new Set();
  private reconnectAttempts = 0;
  private isConnected = false;
  private isConnecting = false;

  constructor(config: SocketModeConfig) {
    this.workspaceId = config.workspaceId;
    this.client = new SocketModeClient({
      appToken: config.appToken,
    });

    this.setupEventHandlers();
  }

  /**
   * Start the Socket Mode connection
   */
  async connect(): Promise<void> {
    if (this.isConnected || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      await this.client.start();
      this.isConnected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;

      log.info('Socket Mode connected');
      this.emit({ type: 'ConnectionStateChanged', state: 'ONLINE' });
    } catch (error) {
      this.isConnecting = false;
      log.error('Socket Mode connection failed', error);
      this.emit({ type: 'ConnectionStateChanged', state: 'OFFLINE' });
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from Socket Mode
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.client.disconnect();
    } catch (error) {
      log.error('Error disconnecting Socket Mode', error);
    }

    this.isConnected = false;
    this.emit({ type: 'ConnectionStateChanged', state: 'OFFLINE' });
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Subscribe to domain events
   */
  subscribe(listener: DomainEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setupEventHandlers(): void {
    // Handle all events
    this.client.on('message', async ({ envelope_id, payload, ack }) => {
      // ACK immediately (Slack requires fast acknowledgment)
      try {
        await ack();
      } catch (error) {
        log.error('Failed to ACK envelope', { envelope_id, error });
      }

      // Deduplicate events
      if (this.seenEnvelopes.has(envelope_id)) {
        return;
      }
      this.addSeenEnvelope(envelope_id);

      // Process event
      this.handlePayload(payload);
    });

    // Handle disconnect
    this.client.on('disconnect', () => {
      log.warn('Socket Mode disconnected');
      this.isConnected = false;
      this.emit({ type: 'ConnectionStateChanged', state: 'DEGRADED' });
      this.scheduleReconnect();
    });

    // Handle reconnect
    this.client.on('connected', () => {
      log.info('Socket Mode reconnected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit({ type: 'ConnectionStateChanged', state: 'ONLINE' });
    });

    // Handle errors
    this.client.on('error', (error) => {
      log.error('Socket Mode error', error);
      this.emit({
        type: 'Error',
        error: error instanceof Error ? error : new Error(String(error)),
        context: 'socket_mode',
      });
    });
  }

  private handlePayload(payload: unknown): void {
    const typed = payload as { type?: string; event?: SlackEvent };

    // Events API payload
    if (typed.type === 'events_api' && typed.event) {
      const eventsPayload = payload as EventsApiPayload;
      const domainEvents = normalizeEvent(eventsPayload.event, this.workspaceId);

      for (const event of domainEvents) {
        this.emit(event);
      }
    }
  }

  private emit(event: DomainEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        log.error('Error in event listener', { event: event.type, error });
      }
    }
  }

  private addSeenEnvelope(envelopeId: string): void {
    this.seenEnvelopes.add(envelopeId);

    // Trim cache if too large
    if (this.seenEnvelopes.size > ENVELOPE_CACHE_SIZE) {
      const toDelete = Array.from(this.seenEnvelopes).slice(
        0,
        ENVELOPE_CACHE_SIZE / 2
      );
      for (const id of toDelete) {
        this.seenEnvelopes.delete(id);
      }
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;

    // Exponential backoff with jitter
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts - 1),
      RECONNECT_MAX_DELAY
    );
    const jitter = Math.random() * 0.3 * delay;

    log.info(`Scheduling reconnect in ${delay + jitter}ms`, {
      attempt: this.reconnectAttempts,
    });

    setTimeout(() => {
      this.connect().catch((error) => {
        log.error('Reconnect failed', error);
      });
    }, delay + jitter);
  }
}
