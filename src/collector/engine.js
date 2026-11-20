import { SupabaseStorage, MockStorage } from './storage.js';
import { CheckpointManager } from './checkpoint.js';
import { CollectionReporter } from './reporter.js';
import { createEnabledAdapters } from './adapters/index.js';

export class CollectionEngine {
  /**
   * @param {Object} options
   * @param {import('./storage.js').SupabaseStorage} [options.storage]
   * @param {import('./adapters/base.js').BaseAdapter[]} [options.adapters]
   * @param {number} [options.targetNewLinks] Default 200
   * @param {number} [options.maxNewLinks] Default 300
   * @param {number} [options.batchSize] Default 50
   * @param {number} [options.maxExecutionTimeSeconds] Default 150
   * @param {number} [options.concurrencyLimit] Default 2
   * @param {number} [options.safetyMarginSeconds] Default 20
   */
  constructor({
    storage = null,
    adapters = null,
    targetNewLinks = parseInt(process.env.TARGET_NEW_LINKS_PER_RUN, 10) || 200,
    maxNewLinks = parseInt(process.env.MAX_NEW_LINKS_PER_RUN, 10) || 300,
    batchSize = parseInt(process.env.BATCH_SIZE, 10) || 50,
    maxExecutionTimeSeconds = parseInt(process.env.MAX_EXECUTION_TIME_SECONDS, 10) || 150,
    concurrencyLimit = parseInt(process.env.CONCURRENCY_LIMIT, 10) || 2,
    safetyMarginSeconds = 20,
    dryRun = process.env.DRY_RUN === 'true'
  } = {}) {
    this.storage = storage || new SupabaseStorage();
    this.adapters = adapters || createEnabledAdapters(process.env.ENABLED_SOURCES);
    this.targetNewLinks = targetNewLinks;
    this.maxNewLinks = maxNewLinks;
    this.batchSize = batchSize;
    this.maxExecutionTimeSeconds = maxExecutionTimeSeconds;
    this.concurrencyLimit = Math.max(1, Math.min(concurrencyLimit || 2, 5));
    this.safetyMarginSeconds = typeof safetyMarginSeconds === 'number' && safetyMarginSeconds !== 20
      ? safetyMarginSeconds
      : Math.min(20, Math.max(1, Math.floor(this.maxExecutionTimeSeconds * 0.15)));
    this.dryRun = dryRun;

    this.checkpointManager = new CheckpointManager(this.storage);
    this.reporter = new CollectionReporter();
    this.seenDedupeKeys = new Set(); // In-memory deduplication set for this execution
    this.startTime = 0;
  }

  /**
   * Check if execution time budget is nearly exhausted.
   * Leaves safetyMarginSeconds for database flush, checkpoint commit, and summary.
   * @returns {boolean}
   */
  isTimeExhausted() {
    const elapsedSec = (Date.now() - this.startTime) / 1000;
    const remainingSec = this.maxExecutionTimeSeconds - elapsedSec;
    return remainingSec <= this.safetyMarginSeconds;
  }

  getRemainingTimeSeconds() {
    const elapsedSec = (Date.now() - this.startTime) / 1000;
    return Math.max(0, this.maxExecutionTimeSeconds - elapsedSec);
  }

  /**
   * Execute video collection pipeline across all enabled sources.
   * @returns {Promise<import('./reporter.js').CollectionReporter>}
   */
  async run() {
    this.startTime = Date.now();
    console.log(`[engine] Starting video discovery engine.`);
    console.log(`[engine] Targets: ${this.targetNewLinks} new links (cap: ${this.maxNewLinks}), budget: ${this.maxExecutionTimeSeconds}s, concurrency: ${this.concurrencyLimit}`);

    // 1. Storage Health & Safety Check
    let storageHealth = await this.storage.checkStorageHealth();
    let currentTarget = this.targetNewLinks;

    if (storageHealth.isCritical) {
      console.error(`[engine] CRITICAL DB USAGE: ${storageHealth.usagePercentage}%. Halting new link collection to protect quota.`);
      // Run emergency 7-day cleanup
      const deleted = await this.storage.cleanupOldVideos(7);
      storageHealth = await this.storage.checkStorageHealth();

      if (storageHealth.isCritical) {
        this.reporter.finish({
          status: 'storage_critical',
          notes: `DB usage ${storageHealth.usagePercentage}% exceeded critical threshold. Cleaned ${deleted} old records. Collection paused.`,
          storageHealth,
          targetNewLinks: this.targetNewLinks,
          maxNewLinks: this.maxNewLinks
        });
        await this.storage.recordCollectionRun(this.reporter.toDatabaseRecord());
        this.reporter.printConsoleSummary();
        this.reporter.writeGitHubStepSummary();
        return this.reporter;
      }
    } else if (storageHealth.isWarning) {
      console.warn(`[engine] DB storage warning: ${storageHealth.usagePercentage}%. Scaling target down to 50 and running 7-day cleanup.`);
      await this.storage.cleanupOldVideos(7);
      currentTarget = Math.min(currentTarget, 50);
    }

    // 2. Initialize Checkpoints for all active sources
    const sourceNames = this.adapters.map(a => a.name);
    await this.checkpointManager.loadAll(sourceNames);

    // 3. Process Sources with Bounded Concurrency
    const activeAdapters = [...this.adapters];
    let exitReason = 'success';

    // Worker pool for bounded concurrency
    let activeIndex = 0;
    const workerPromises = [];

    const worker = async () => {
      while (activeIndex < activeAdapters.length) {
        if (this.isTimeExhausted()) {
          exitReason = 'budget_exhausted';
          break;
        }

        if (this.reporter.uniqueNewRecords >= currentTarget) {
          exitReason = 'target_reached';
          break;
        }

        const adapter = activeAdapters[activeIndex++];
        if (!adapter) break;

        try {
          await this.collectFromSource(adapter, currentTarget);
        } catch (err) {
          console.error(`[engine] Unexpected error processing source ${adapter.name}:`, err.message);
          this.checkpointManager.rollback(adapter.name);
        }
      }
    };

    const poolSize = Math.min(this.concurrencyLimit, activeAdapters.length);
    for (let i = 0; i < poolSize; i++) {
      workerPromises.push(worker());
    }

    await Promise.all(workerPromises);

    // 4. Wrap-up & Final Checkpoints
    if (this.reporter.uniqueNewRecords >= this.maxNewLinks) {
      exitReason = 'max_cap_reached';
    } else if (this.reporter.uniqueNewRecords >= currentTarget && exitReason === 'success') {
      exitReason = 'target_reached';
    } else if (this.isTimeExhausted() && exitReason === 'success') {
      exitReason = 'budget_exhausted';
    }

    // Refresh final storage stats
    const finalStorage = await this.storage.checkStorageHealth();

    this.reporter.finish({
      status: exitReason,
      notes: `Finished with reason: ${exitReason}. Remaining time: ${this.getRemainingTimeSeconds().toFixed(1)}s`,
      storageHealth: finalStorage,
      targetNewLinks: this.targetNewLinks,
      maxNewLinks: this.maxNewLinks
    });

    if (!this.dryRun) {
      await this.storage.recordCollectionRun(this.reporter.toDatabaseRecord());
    }

    this.reporter.printConsoleSummary();
    this.reporter.writeGitHubStepSummary();

    return this.reporter;
  }

  /**
   * Process a single source with deep pagination, batching, and cursor persistence.
   * @param {import('./adapters/base.js').BaseAdapter} adapter
   * @param {number} targetCount
   */
  async collectFromSource(adapter, targetCount) {
    const source = adapter.name;
    console.log(`[engine] Processing source '${source}' (Current cursor: ${JSON.stringify(this.checkpointManager.getCursor(source))})`);

    let consecutiveDuplicates = 0;
    let consecutiveEmptyPages = 0;
    let pageCount = 0;
    const maxPagesForSource = 15; // Bound pages per run per source to maintain diversity

    while (pageCount < maxPagesForSource) {
      // 1. Check stop conditions
      if (this.isTimeExhausted()) {
        console.log(`[engine] Time budget running low (${this.getRemainingTimeSeconds().toFixed(1)}s remaining). Gracefully finishing ${source}.`);
        break;
      }

      if (this.reporter.uniqueNewRecords >= this.maxNewLinks) {
        console.log(`[engine] Max collection cap (${this.maxNewLinks}) reached. Stopping ${source}.`);
        break;
      }

      if (this.reporter.uniqueNewRecords >= targetCount) {
        console.log(`[engine] Collection target (${targetCount}) reached. Stopping ${source}.`);
        break;
      }

      if (adapter.isRateLimited) {
        console.warn(`[engine] Source ${source} is rate limited. Skipping remaining requests.`);
        break;
      }

      const cursor = this.checkpointManager.getCursor(source);
      pageCount++;

      // 2. Fetch page from adapter
      let result;
      try {
        result = await adapter.fetchVideos({
          cursor,
          limit: 25
        });
      } catch (err) {
        console.warn(`[engine] Error fetching page from ${source}: ${err.message}`);
        this.reporter.recordPageFetch(source, { itemCount: 0, requests: 1, isError: true });
        break;
      }

      const { items = [], nextCursor, hasMore } = result;
      this.reporter.recordPageFetch(source, {
        itemCount: items.length,
        requests: 1,
        isRateLimit: adapter.isRateLimited
      });

      if (items.length === 0) {
        consecutiveEmptyPages++;
        console.log(`[engine] No items returned from ${source} for page ${pageCount} (consecutive empty: ${consecutiveEmptyPages}).`);
        // Stage next cursor if provider rotated niche/query
        if (nextCursor) {
          this.checkpointManager.stageAdvance(source, nextCursor);
          await this.checkpointManager.commitAdvance(source);
        }
        if (!hasMore || consecutiveEmptyPages >= 3) {
          console.log(`[engine] Stopping ${source} after ${consecutiveEmptyPages} consecutive empty responses.`);
          break;
        }
        continue;
      }
      consecutiveEmptyPages = 0;

      // 3. In-memory deduplication & normalization
      const newItemsInBatch = [];
      let duplicateCount = 0;

      for (const item of items) {
        if (!item.dedupe_key) continue;

        if (this.seenDedupeKeys.has(item.dedupe_key)) {
          duplicateCount++;
        } else {
          this.seenDedupeKeys.add(item.dedupe_key);
          newItemsInBatch.push(item);
        }
      }

      // Track adaptive yield
      adapter.newItemsCount += newItemsInBatch.length;

      // Check consecutive duplicates: if a provider gives 0 new items across 3 consecutive pages, move on
      if (newItemsInBatch.length === 0) {
        consecutiveDuplicates++;
        if (consecutiveDuplicates >= 3) {
          console.log(`[engine] High duplicate density on ${source} (3 consecutive empty pages). Rotating.`);
          if (nextCursor) {
            this.checkpointManager.stageAdvance(source, nextCursor);
            await this.checkpointManager.commitAdvance(source);
          }
          break;
        }
      } else {
        consecutiveDuplicates = 0;
      }

      // 4. Batch Commit to Database
      if (!this.dryRun && newItemsInBatch.length > 0) {
        try {
          const { insertedCount, updatedCount } = await this.storage.batchUpsertVideos(
            newItemsInBatch,
            this.batchSize
          );

          this.reporter.recordBatchResult(source, {
            newCount: insertedCount,
            dupCount: duplicateCount,
            updatedCount
          });

          // 5. Advance Checkpoint ONLY AFTER successful database commit!
          if (nextCursor) {
            this.checkpointManager.stageAdvance(source, nextCursor);
            await this.checkpointManager.commitAdvance(source);
          }
        } catch (dbErr) {
          console.error(`[engine] Failed to commit batch for ${source}:`, dbErr.message);
          this.checkpointManager.rollback(source);
          break;
        }
      } else {
        // Dry run or zero items
        this.reporter.recordBatchResult(source, {
          newCount: newItemsInBatch.length,
          dupCount: duplicateCount,
          updatedCount: 0
        });

        if (nextCursor) {
          this.checkpointManager.stageAdvance(source, nextCursor);
          if (!this.dryRun) {
            await this.checkpointManager.commitAdvance(source);
          }
        }
      }

      if (!hasMore) {
        console.log(`[engine] Provider ${source} has no more results.`);
        break;
      }
    }
  }
}
