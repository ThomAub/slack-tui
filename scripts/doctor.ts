#!/usr/bin/env bun
/**
 * Doctor script - validate slacktui setup
 * This is a convenience wrapper around the main CLI doctor command
 */
import { $ } from 'bun';

async function doctor(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonFlag = args.includes('--json') ? '--json' : '';

  await $`bun run src/main.ts doctor ${jsonFlag}`.quiet();
}

doctor().catch((error) => {
  console.error('Doctor failed:', error);
  process.exit(1);
});
