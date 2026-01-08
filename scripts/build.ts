#!/usr/bin/env bun
/**
 * Build script for slacktui
 * Creates single-file executables for multiple platforms
 */
import { $ } from 'bun';

const TARGETS = [
  'bun-linux-x64',
  'bun-linux-arm64',
  'bun-darwin-x64',
  'bun-darwin-arm64',
] as const;

async function build(): Promise<void> {
  const args = process.argv.slice(2);
  const currentOnly = args.includes('--current');
  const allTargets = args.includes('--all');

  console.log('Building slacktui...\n');

  if (currentOnly || (!allTargets && TARGETS.length > 0)) {
    // Build for current platform only
    console.log('Building for current platform...');
    await $`bun build ./src/main.ts --compile --outfile dist/slacktui`;
    console.log('✓ Built: dist/slacktui\n');
  }

  if (allTargets) {
    // Build for all platforms
    for (const target of TARGETS) {
      const outfile = `dist/slacktui-${target.replace('bun-', '')}`;
      console.log(`Building for ${target}...`);

      try {
        await $`bun build ./src/main.ts --compile --target=${target} --outfile ${outfile}`;
        console.log(`✓ Built: ${outfile}`);
      } catch (error) {
        console.error(`✗ Failed to build for ${target}:`, error);
      }
    }

    // Generate checksums
    console.log('\nGenerating checksums...');
    await $`cd dist && sha256sum slacktui-* > checksums.sha256 2>/dev/null || shasum -a 256 slacktui-* > checksums.sha256`;
    console.log('✓ Generated: dist/checksums.sha256');
  }

  console.log('\nBuild complete!');
}

build().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
