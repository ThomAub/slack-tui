#!/usr/bin/env bun
/**
 * slacktui - A Slack terminal UI with vim-first ergonomics
 *
 * CLI entry point for Phase 1 validation
 */
import { parseArgs } from 'util';
import { start, stop } from './core/runtime';
import { execute } from './core/commands';
import { loadConfig, configExists, hasAuthTokens, getConfigPath, createDefaultConfig } from './utils/config';
import { configureLogger, log, setConsoleOutput } from './utils/logger';
import { getDb, isDatabaseInitialized, getDatabasePath } from './core/store/db';
import * as queries from './core/store/queries';
import { formatSlackTs } from './utils/time';

const VERSION = '0.1.0';

const HELP = `
slacktui v${VERSION} - A Slack terminal UI with vim-first ergonomics

USAGE:
  slacktui [command] [options]

COMMANDS:
  (default)       Start the TUI (not implemented in Phase 1)
  channels        List all channels
  messages <id>   Show messages from a channel
  users           List all users
  doctor          Validate setup and connectivity
  init            Create default config file

OPTIONS:
  -h, --help      Show this help message
  -v, --version   Show version
  --debug         Enable debug logging
  --json          Output as JSON (for scripting)

EXAMPLES:
  slacktui channels
  slacktui messages C0123456789
  slacktui messages '#general'
  slacktui doctor
`;

interface CliOptions {
  help: boolean;
  version: boolean;
  debug: boolean;
  json: boolean;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
      debug: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  const options = values as CliOptions;
  const command = positionals[0] ?? 'tui';
  const args = positionals.slice(1);

  // Handle help and version
  if (options.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (options.version) {
    console.log(`slacktui v${VERSION}`);
    process.exit(0);
  }

  // Configure logging
  configureLogger({
    level: options.debug ? 'debug' : 'info',
    console: options.debug,
  });

  // Disable console logging in non-debug mode for clean output
  if (!options.debug) {
    setConsoleOutput(false);
  }

  try {
    switch (command) {
      case 'init':
        await cmdInit();
        break;

      case 'doctor':
        await cmdDoctor(options.json);
        break;

      case 'channels':
        await cmdChannels(options.json);
        break;

      case 'messages':
        await cmdMessages(args[0], options.json);
        break;

      case 'users':
        await cmdUsers(options.json);
        break;

      case 'tui':
        console.log('TUI not implemented in Phase 1. Use CLI commands:');
        console.log('  slacktui channels');
        console.log('  slacktui messages <channel>');
        console.log('  slacktui users');
        console.log('  slacktui doctor');
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.log('Run "slacktui --help" for usage.');
        process.exit(1);
    }
  } catch (error) {
    log.error('Command failed', error);
    if (options.debug) {
      console.error(error);
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
    }
    process.exit(1);
  } finally {
    await stop();
  }
}

/**
 * Initialize config file
 */
async function cmdInit(): Promise<void> {
  if (configExists()) {
    console.log(`Config file already exists at: ${getConfigPath()}`);
    return;
  }

  createDefaultConfig();
  console.log(`Created config file at: ${getConfigPath()}`);
  console.log('\nNext steps:');
  console.log('1. Edit the config file and add your Slack tokens');
  console.log('2. Run "slacktui doctor" to validate your setup');
}

/**
 * Doctor command - validate setup
 */
async function cmdDoctor(json: boolean): Promise<void> {
  const checks: { name: string; status: 'ok' | 'warn' | 'error'; message: string }[] = [];

  // Check config file
  if (configExists()) {
    checks.push({ name: 'Config file', status: 'ok', message: getConfigPath() });
  } else {
    checks.push({ name: 'Config file', status: 'error', message: 'Not found. Run "slacktui init"' });
  }

  // Load config
  const config = loadConfig();

  // Check auth tokens
  if (hasAuthTokens(config)) {
    checks.push({ name: 'Auth tokens', status: 'ok', message: 'Present' });
  } else {
    checks.push({ name: 'Auth tokens', status: 'error', message: 'Missing app_token or bot_token' });
  }

  // Check database
  if (isDatabaseInitialized()) {
    checks.push({ name: 'Database', status: 'ok', message: getDatabasePath() });
  } else {
    checks.push({ name: 'Database', status: 'warn', message: 'Not initialized (will be created on first run)' });
  }

  // Test Slack connection if tokens are present
  if (hasAuthTokens(config)) {
    try {
      const runtime = await start({
        appToken: config.auth.appToken,
        botToken: config.auth.botToken,
        userToken: config.auth.userToken,
      });

      checks.push({
        name: 'Bot token',
        status: 'ok',
        message: `Valid (workspace: ${runtime.workspaceId})`,
      });

      // Check Socket Mode connection
      if (runtime.connectionState === 'ONLINE') {
        checks.push({ name: 'Socket Mode', status: 'ok', message: 'Connected' });
      } else {
        checks.push({ name: 'Socket Mode', status: 'warn', message: runtime.connectionState });
      }
    } catch (error) {
      checks.push({
        name: 'Slack connection',
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed',
      });
    }
  }

  // Check terminal
  const term = process.env.TERM ?? 'unknown';
  const colorTerm = process.env.COLORTERM;
  const termInfo = colorTerm === 'truecolor' ? `${term} (true color)` : term;
  checks.push({ name: 'Terminal', status: 'ok', message: termInfo });

  // Output results
  if (json) {
    console.log(JSON.stringify(checks, null, 2));
  } else {
    for (const check of checks) {
      const icon = check.status === 'ok' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
      console.log(`${icon} ${check.name}: ${check.message}`);
    }
  }

  // Exit with error if any check failed
  if (checks.some((c) => c.status === 'error')) {
    process.exit(1);
  }
}

/**
 * List channels
 */
async function cmdChannels(json: boolean): Promise<void> {
  const config = loadConfig();

  if (!hasAuthTokens(config)) {
    throw new Error('Missing auth tokens. Run "slacktui init" and configure your tokens.');
  }

  const runtime = await start({
    appToken: config.auth.appToken,
    botToken: config.auth.botToken,
    userToken: config.auth.userToken,
  });

  // Fetch channels from API
  await execute({ type: 'FetchChannels' });

  // Get channels from cache
  const channels = queries.getChannels(runtime.workspaceId);

  if (json) {
    console.log(JSON.stringify(channels, null, 2));
  } else {
    console.log(`Found ${channels.length} channels:\n`);
    for (const channel of channels) {
      const prefix = channel.type === 'im' ? '@' : channel.type === 'mpim' ? '&' : '#';
      const name = channel.name ?? channel.id;
      console.log(`  ${prefix}${name} (${channel.id})`);
    }
  }
}

/**
 * Show messages from a channel
 */
async function cmdMessages(channelArg: string | undefined, json: boolean): Promise<void> {
  if (!channelArg) {
    throw new Error('Channel ID or name required. Usage: slacktui messages <channel>');
  }

  const config = loadConfig();

  if (!hasAuthTokens(config)) {
    throw new Error('Missing auth tokens. Run "slacktui init" and configure your tokens.');
  }

  const runtime = await start({
    appToken: config.auth.appToken,
    botToken: config.auth.botToken,
    userToken: config.auth.userToken,
  });

  // Resolve channel ID from name if needed
  let channelId = channelArg;
  if (channelArg.startsWith('#') || channelArg.startsWith('@')) {
    const channels = queries.getChannels(runtime.workspaceId);
    const name = channelArg.slice(1);
    const channel = channels.find((c) => c.name === name);

    if (!channel) {
      // Fetch fresh channel list
      await execute({ type: 'FetchChannels' });
      const freshChannels = queries.getChannels(runtime.workspaceId);
      const freshChannel = freshChannels.find((c) => c.name === name);

      if (!freshChannel) {
        throw new Error(`Channel not found: ${channelArg}`);
      }
      channelId = freshChannel.id;
    } else {
      channelId = channel.id;
    }
  }

  // Fetch messages
  const result = await execute({ type: 'FetchMessages', channelId });

  if (!result.success) {
    throw new Error(result.error);
  }

  // Fetch users for display names
  await execute({ type: 'FetchUsers' });

  // Get messages from cache
  const messages = queries.getMessages(channelId, 50);

  if (json) {
    console.log(JSON.stringify(messages, null, 2));
  } else {
    console.log(`Messages from ${channelArg}:\n`);
    for (const message of messages.reverse()) {
      const user = message.userId ? queries.getUser(message.userId) : null;
      const userName = user?.displayName ?? user?.username ?? message.userId ?? 'unknown';
      const time = formatSlackTs(message.ts);
      const text = message.text ?? '[no text]';

      console.log(`[${time}] ${userName}: ${text}`);

      if (message.replyCount > 0) {
        console.log(`  └── ${message.replyCount} replies`);
      }
    }
  }
}

/**
 * List users
 */
async function cmdUsers(json: boolean): Promise<void> {
  const config = loadConfig();

  if (!hasAuthTokens(config)) {
    throw new Error('Missing auth tokens. Run "slacktui init" and configure your tokens.');
  }

  const runtime = await start({
    appToken: config.auth.appToken,
    botToken: config.auth.botToken,
    userToken: config.auth.userToken,
  });

  // Fetch users from API
  await execute({ type: 'FetchUsers' });

  // Get users from cache
  const users = queries.getUsers(runtime.workspaceId);

  if (json) {
    console.log(JSON.stringify(users, null, 2));
  } else {
    console.log(`Found ${users.length} users:\n`);
    for (const user of users) {
      const name = user.displayName ?? user.realName ?? user.username ?? 'Unknown';
      console.log(`  @${user.username ?? user.id} - ${name}`);
    }
  }
}

// Run main
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
