/**
 * Core runtime - headless backend for slacktui
 */
import type { DomainEvent, DomainEventListener, ConnectionState } from './types';
import { SlackWebClient } from './slack/web';
import { SocketModeTransport } from './slack/socket';
import { applyEvent } from './store/writeModel';
import { getDb, closeDb } from './store/db';
import * as queries from './store/queries';
import { log } from '../utils/logger';

export interface RuntimeConfig {
  appToken: string;
  botToken: string;
  userToken?: string;
}

export interface Runtime {
  webClient: SlackWebClient;
  workspaceId: string;
  connectionState: ConnectionState;
  subscribe: (listener: DomainEventListener) => () => void;
  reconnect: () => Promise<void>;
  stop: () => Promise<void>;
}

let runtime: Runtime | null = null;

/**
 * Start the core runtime
 */
export async function start(config: RuntimeConfig): Promise<Runtime> {
  if (runtime) {
    throw new Error('Runtime already started');
  }

  log.info('Starting runtime...');

  // Initialize database
  getDb();

  // Create Slack Web API client
  const webClient = new SlackWebClient({
    botToken: config.botToken,
    userToken: config.userToken,
  });

  // Test authentication
  const authResult = await webClient.testAuth();
  if (!authResult.ok) {
    throw new Error(`Authentication failed: ${authResult.error}`);
  }

  const workspaceId = authResult.teamId!;
  log.info('Authenticated', { team: authResult.team, workspaceId });

  // Ensure workspace exists in DB
  queries.upsertWorkspace({
    id: workspaceId,
    name: authResult.team ?? 'Unknown',
    teamId: workspaceId,
    createdAt: Math.floor(Date.now() / 1000),
  });

  // Event listeners
  const listeners = new Set<DomainEventListener>();
  let connectionState: ConnectionState = 'OFFLINE';

  // Create Socket Mode transport
  const socketTransport = new SocketModeTransport({
    appToken: config.appToken,
    workspaceId,
  });

  // Subscribe to socket events
  socketTransport.subscribe((event) => {
    // Update connection state
    if (event.type === 'ConnectionStateChanged') {
      connectionState = event.state;
    }

    // Persist to database
    applyEvent(event);

    // Notify listeners
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        log.error('Error in event listener', error);
      }
    }
  });

  // Connect to Socket Mode
  await socketTransport.connect();

  // Create runtime object
  runtime = {
    webClient,
    workspaceId,
    get connectionState() {
      return connectionState;
    },
    subscribe(listener: DomainEventListener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async reconnect() {
      await socketTransport.disconnect();
      await socketTransport.connect();
    },
    async stop() {
      log.info('Stopping runtime...');
      await socketTransport.disconnect();
      closeDb();
      runtime = null;
    },
  };

  log.info('Runtime started');
  return runtime;
}

/**
 * Get the current runtime instance
 */
export function getRuntime(): Runtime | null {
  return runtime;
}

/**
 * Stop the runtime
 */
export async function stop(): Promise<void> {
  if (runtime) {
    await runtime.stop();
  }
}
