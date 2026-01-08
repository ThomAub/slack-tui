/**
 * Database connection and migration management
 */
import { Database } from 'bun:sqlite';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { homedir } from 'os';

const SCHEMA_VERSION = 1;

// XDG-compliant paths
function getDataDir(): string {
  const xdgData = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
  return join(xdgData, 'slacktui');
}

function getDbPath(): string {
  return join(getDataDir(), 'cache.db');
}

let db: Database | null = null;

/**
 * Initialize and return the database connection
 */
export function getDb(): Database {
  if (db) return db;

  const dataDir = getDataDir();
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = getDbPath();
  db = new Database(dbPath);

  // Enable WAL mode for better concurrency
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  // Run migrations
  runMigrations(db);

  return db;
}

/**
 * Run database migrations
 */
function runMigrations(db: Database): void {
  const currentVersion = getCurrentVersion(db);

  if (currentVersion < SCHEMA_VERSION) {
    // Apply initial schema
    const schemaPath = join(import.meta.dir, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    // Execute schema as a transaction
    db.run('BEGIN TRANSACTION');
    try {
      // Split by semicolon and execute each statement
      const statements = schema
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));

      for (const stmt of statements) {
        db.run(stmt);
      }

      // Record schema version
      db.run(
        'INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)',
        [SCHEMA_VERSION, Math.floor(Date.now() / 1000)]
      );

      db.run('COMMIT');
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }
  }
}

/**
 * Get current schema version
 */
function getCurrentVersion(db: Database): number {
  try {
    const result = db
      .query<{ version: number }, []>(
        'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
      )
      .get();
    return result?.version ?? 0;
  } catch {
    // Table doesn't exist yet
    return 0;
  }
}

/**
 * Close the database connection
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Get database path (for doctor command)
 */
export function getDatabasePath(): string {
  return getDbPath();
}

/**
 * Check if database is initialized
 */
export function isDatabaseInitialized(): boolean {
  const dbPath = getDbPath();
  if (!existsSync(dbPath)) return false;

  try {
    const testDb = new Database(dbPath, { readonly: true });
    const result = testDb
      .query<{ version: number }, []>(
        'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
      )
      .get();
    testDb.close();
    return (result?.version ?? 0) >= SCHEMA_VERSION;
  } catch {
    return false;
  }
}
