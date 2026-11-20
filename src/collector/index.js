#!/usr/bin/env node
import 'dotenv/config';
import { CollectionEngine } from './engine.js';
import { SupabaseStorage } from './storage.js';

function parseArgs(args) {
  const options = {};
  for (const arg of args) {
    if (arg.startsWith('--target=')) {
      options.targetNewLinks = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--max=' )) {
      options.maxNewLinks = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--sources=')) {
      process.env.ENABLED_SOURCES = arg.split('=')[1];
    } else if (arg.startsWith('--budget=')) {
      options.maxExecutionTimeSeconds = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--cleanup-only') {
      options.cleanupOnly = true;
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.cleanupOnly) {
    console.log('[collector] Running standalone 7-day retention cleanup...');
    const storage = new SupabaseStorage();
    const deleted = await storage.cleanupOldVideos(7);
    console.log(`[collector] Cleanup completed. Removed ${deleted} old videos.`);
    process.exit(0);
  }

  try {
    const engine = new CollectionEngine(options);
    const reporter = await engine.run();

    // Exit 0 always on successful graceful exit
    process.exit(0);
  } catch (err) {
    console.error('[collector] Fatal execution error:', err);
    process.exit(1);
  }
}

main();
