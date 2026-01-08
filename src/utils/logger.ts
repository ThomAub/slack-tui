/**
 * Structured logging utility
 */
import { join } from 'path';
import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { homedir } from 'os';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogConfig {
  level: LogLevel;
  file?: string;
  console: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let config: LogConfig = {
  level: 'info',
  console: true,
};

let logFile: string | null = null;

/**
 * Configure the logger
 */
export function configureLogger(options: Partial<LogConfig>): void {
  config = { ...config, ...options };

  if (config.file) {
    // Expand ~ in path
    const expandedPath = config.file.replace(/^~/, homedir());
    const dir = join(expandedPath, '..');

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    logFile = expandedPath;
  }
}

/**
 * Get default log file path
 */
export function getDefaultLogPath(): string {
  const xdgData = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
  return join(xdgData, 'slacktui', 'logs', 'slacktui.log');
}

/**
 * Format a log message
 */
function formatMessage(
  level: LogLevel,
  message: string,
  data?: unknown
): string {
  const timestamp = new Date().toISOString();
  const levelStr = level.toUpperCase().padEnd(5);

  let line = `${timestamp} ${levelStr} ${message}`;

  if (data !== undefined) {
    if (data instanceof Error) {
      line += ` ${data.message}`;
      if (data.stack) {
        line += `\n${data.stack}`;
      }
    } else if (typeof data === 'object') {
      line += ` ${JSON.stringify(data)}`;
    } else {
      line += ` ${data}`;
    }
  }

  return line;
}

/**
 * Write a log entry
 */
function writeLog(level: LogLevel, message: string, data?: unknown): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[config.level]) {
    return;
  }

  const formatted = formatMessage(level, message, data);

  // Write to console
  if (config.console) {
    const consoleFn =
      level === 'error'
        ? console.error
        : level === 'warn'
          ? console.warn
          : level === 'debug'
            ? console.debug
            : console.log;

    consoleFn(formatted);
  }

  // Write to file
  if (logFile) {
    try {
      appendFileSync(logFile, formatted + '\n');
    } catch {
      // Silently ignore file write errors
    }
  }
}

/**
 * Logger interface
 */
export const log = {
  debug: (message: string, data?: unknown) => writeLog('debug', message, data),
  info: (message: string, data?: unknown) => writeLog('info', message, data),
  warn: (message: string, data?: unknown) => writeLog('warn', message, data),
  error: (message: string, data?: unknown) => writeLog('error', message, data),
};

/**
 * Set log level at runtime
 */
export function setLogLevel(level: LogLevel): void {
  config.level = level;
}

/**
 * Enable/disable console output
 */
export function setConsoleOutput(enabled: boolean): void {
  config.console = enabled;
}
