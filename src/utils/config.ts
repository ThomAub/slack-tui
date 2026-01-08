/**
 * Configuration loading and management
 */
import { join } from 'path';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { parse as parseToml } from '@toml-tools/parser';

export interface Config {
  auth: {
    appToken: string;
    botToken: string;
    userToken?: string;
  };
  ui: {
    theme: 'default' | 'minimal' | 'high-contrast';
    sidebarWidth: number;
    relativeTime: boolean;
    threadCollapseThreshold: number;
    previewLength: number;
  };
  cache: {
    retentionDays: number;
    maxMessagesPerChannel: number;
    staleThresholdSeconds: number;
  };
  network: {
    maxInflightRequests: number;
    reconnectBaseDelayMs: number;
    reconnectMaxDelayMs: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    file: string;
  };
  keybindings: Record<string, string>;
  behavior: {
    autoMarkRead: boolean;
    confirmDelete: boolean;
    sendTyping: boolean;
  };
}

const DEFAULT_CONFIG: Config = {
  auth: {
    appToken: '',
    botToken: '',
  },
  ui: {
    theme: 'default',
    sidebarWidth: 20,
    relativeTime: true,
    threadCollapseThreshold: 3,
    previewLength: 50,
  },
  cache: {
    retentionDays: 30,
    maxMessagesPerChannel: 1000,
    staleThresholdSeconds: 300,
  },
  network: {
    maxInflightRequests: 4,
    reconnectBaseDelayMs: 1000,
    reconnectMaxDelayMs: 30000,
  },
  logging: {
    level: 'info',
    file: '~/.local/share/slacktui/logs/slacktui.log',
  },
  keybindings: {},
  behavior: {
    autoMarkRead: true,
    confirmDelete: true,
    sendTyping: false,
  },
};

/**
 * Get XDG config directory
 */
export function getConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(xdgConfig, 'slacktui');
}

/**
 * Get config file path
 */
export function getConfigPath(): string {
  return join(getConfigDir(), 'config.toml');
}

/**
 * Load configuration from file
 */
export function loadConfig(): Config {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = parseToml(content) as Partial<DeepPartial<Config>>;
    return mergeConfig(DEFAULT_CONFIG, parsed);
  } catch (error) {
    console.error(`Failed to parse config file: ${error}`);
    return DEFAULT_CONFIG;
  }
}

/**
 * Check if config file exists
 */
export function configExists(): boolean {
  return existsSync(getConfigPath());
}

/**
 * Check if auth tokens are configured
 */
export function hasAuthTokens(config: Config): boolean {
  return !!(config.auth.appToken && config.auth.botToken);
}

/**
 * Create default config file
 */
export function createDefaultConfig(): void {
  const configDir = getConfigDir();
  const configPath = getConfigPath();

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const defaultToml = `# slacktui configuration
# See: https://github.com/your-repo/slacktui#configuration

[auth]
# App-level token for Socket Mode (requires connections:write scope)
app_token = ""    # xapp-...

# Bot token for Web API
bot_token = ""    # xoxb-...

# Optional: User token for user-context actions
# user_token = ""  # xoxp-...

[ui]
theme = "default"                 # default | minimal | high-contrast
sidebar_width = 20
relative_time = true              # "5m ago" vs "10:32 AM"
thread_collapse_threshold = 3     # Inline expand if ≤ this
preview_length = 50               # Sidebar message preview

[cache]
retention_days = 30
max_messages_per_channel = 1000
stale_threshold_seconds = 300     # Fetch from API if older

[network]
max_inflight_requests = 4         # Parallel Web API calls
reconnect_base_delay_ms = 1000    # Backoff base
reconnect_max_delay_ms = 30000    # Backoff cap

[logging]
level = "info"                    # debug | info | warn | error
file = "~/.local/share/slacktui/logs/slacktui.log"

[keybindings]
# Override defaults
# quit = "Ctrl+q"
# send_message = "Ctrl+Enter"

[behavior]
auto_mark_read = true
confirm_delete = true
send_typing = false
`;

  writeFileSync(configPath, defaultToml);
}

// Helper types for deep partial
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Merge configs recursively
function mergeConfig<T extends object>(defaults: T, overrides: DeepPartial<T>): T {
  const result = { ...defaults };

  for (const key of Object.keys(overrides) as (keyof T)[]) {
    const value = overrides[key];
    if (value === undefined) continue;

    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof defaults[key] === 'object'
    ) {
      result[key] = mergeConfig(
        defaults[key] as object,
        value as DeepPartial<object>
      ) as T[keyof T];
    } else {
      result[key] = value as T[keyof T];
    }
  }

  return result;
}
