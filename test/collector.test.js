import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { BaseAdapter } from '../src/collector/adapters/base.js';
import { MockStorage } from '../src/collector/storage.js';
import { CheckpointManager } from '../src/collector/checkpoint.js';
import { CollectionEngine } from '../src/collector/engine.js';
import { CollectionReporter } from '../src/collector/reporter.js';

/**
 * Mock adapter for deterministic offline testing.
 */
class ConfigurableMockAdapter extends BaseAdapter {
  constructor({ name, pages = [], rateLimitAtPage = -1, errorAtPage = -1, ...options } = {}) {
    super({ name, timeoutMs: 1000, maxRequestsPerRun: 50, ...options });
    this.pages = pages;
    this.rateLimitAtPage = rateLimitAtPage;
    this.errorAtPage = errorAtPage;
    this.pageCallCount = 0;
  }

  async fetchVideos({ cursor, limit = 20 }) {
    this.pageCallCount++;
    const pageIndex = cursor?.pageIndex ?? 0;

    if (this.pageCallCount === this.rateLimitAtPage) {
      this.isRateLimited = true;
      this.rateLimitEvents++;
      return { items: [], nextCursor: { pageIndex }, hasMore: false };
    }

    if (this.pageCallCount === this.errorAtPage) {
      this.errorsCount++;
      throw new Error(`Simulated error at page ${this.pageCallCount}`);
    }

    const currentPageData = this.pages[pageIndex];
    if (!currentPageData) {
      return { items: [], nextCursor: { pageIndex }, hasMore: false };
    }

    const normalized = currentPageData.items.map(item => this.normalizeVideo(item));
    this.itemsFound += normalized.length;

    const hasMore = pageIndex + 1 < this.pages.length;
    const nextCursor = { pageIndex: pageIndex + 1 };

    return {
      items: normalized,
      nextCursor,
      hasMore
    };
  }
}

describe('18gram Video Discovery Collection Engine Tests', () => {

  // 1. Multiple pagination pages
  test('1. Deep pagination across multiple pages', async () => {
    const mockPages = [
      {
        items: [
          { external_id: 'vid_1', title: 'Video 1', url: 'https://test.com/1' },
          { external_id: 'vid_2', title: 'Video 2', url: 'https://test.com/2' }
        ]
      },
      {
        items: [
          { external_id: 'vid_3', title: 'Video 3', url: 'https://test.com/3' },
          { external_id: 'vid_4', title: 'Video 4', url: 'https://test.com/4' }
        ]
      }
    ];

    const adapter = new ConfigurableMockAdapter({ name: 'mock_provider', pages: mockPages });
    const storage = new MockStorage();
    const engine = new CollectionEngine({
      storage,
      adapters: [adapter],
      targetNewLinks: 10,
      batchSize: 50,
      maxExecutionTimeSeconds: 10
    });

    const reporter = await engine.run();

    assert.equal(reporter.pagesFetched, 2, 'Should fetch both pages');
    assert.equal(reporter.uniqueNewRecords, 4, 'Should collect all 4 videos across pages');
    assert.equal(storage.videos.size, 4, 'Storage should contain 4 records');
  });

  // 2. Cursor persistence
  test('2. Cursor persistence across batch commits', async () => {
    const storage = new MockStorage();
    const checkpointManager = new CheckpointManager(storage);

    await checkpointManager.loadAll(['test_source']);
    assert.equal(checkpointManager.getCursor('test_source'), null);

    checkpointManager.stageAdvance('test_source', { page: 2, niche: 'amateur' });
    assert.deepEqual(checkpointManager.getCursor('test_source'), { page: 2, niche: 'amateur' });

    // Cursor in storage should still be null before commit
    const storedBefore = await storage.getCursor('test_source');
    assert.equal(storedBefore.cursor, null);

    // Commit advance
    await checkpointManager.commitAdvance('test_source');

    const storedAfter = await storage.getCursor('test_source');
    assert.deepEqual(storedAfter.cursor, { page: 2, niche: 'amateur' });
    assert.ok(storedAfter.lastSuccessfulCollectionAt);
  });

  // 3. Resume after failure
  test('3. Safe resume from saved checkpoint after failure', async () => {
    const storage = new MockStorage();

    // Run 1: Successfully processes page 0, then fails on page 1
    const pagesRun1 = [
      {
        items: [
          { external_id: 'run1_v1', title: 'R1 V1', url: 'https://test.com/r1v1' },
          { external_id: 'run1_v2', title: 'R1 V2', url: 'https://test.com/r1v2' }
        ]
      },
      {
        items: [
          { external_id: 'run1_v3', title: 'R1 V3', url: 'https://test.com/r1v3' }
        ]
      }
    ];

    const failingAdapter = new ConfigurableMockAdapter({
      name: 'resilient_source',
      pages: pagesRun1,
      errorAtPage: 2 // Fails on 2nd page request
    });

    const engine1 = new CollectionEngine({
      storage,
      adapters: [failingAdapter],
      targetNewLinks: 10,
      batchSize: 50,
      maxExecutionTimeSeconds: 10
    });

    await engine1.run();

    // Checkpoint should be at pageIndex: 1 (after page 0 committed)
    const savedCursor = await storage.getCursor('resilient_source');
    assert.deepEqual(savedCursor.cursor, { pageIndex: 1 });
    assert.equal(storage.videos.size, 2, 'Only first page items should be committed');

    // Run 2: Resume with healthy adapter from checkpoint
    const pagesRun2 = [
      pagesRun1[0], // pageIndex 0 (already committed)
      pagesRun1[1], // pageIndex 1 (to be processed)
      {
        items: [
          { external_id: 'run2_v4', title: 'R2 V4', url: 'https://test.com/r2v4' }
        ]
      }
    ];

    const healthyAdapter = new ConfigurableMockAdapter({
      name: 'resilient_source',
      pages: pagesRun2
    });

    const engine2 = new CollectionEngine({
      storage,
      adapters: [healthyAdapter],
      targetNewLinks: 10,
      batchSize: 50,
      maxExecutionTimeSeconds: 10
    });

    const reporter2 = await engine2.run();
    assert.equal(storage.videos.size, 4, 'Should resume and collect remaining items');
    assert.ok(storage.videos.has('resilient_source:run1_v3'));
    assert.ok(storage.videos.has('resilient_source:run2_v4'));
  });

  // 4. Duplicate links across different pages
  test('4. Duplicate links across different pages in the same run', async () => {
    const mockPages = [
      {
        items: [
          { external_id: 'dup_1', title: 'Video A', url: 'https://test.com/a' },
          { external_id: 'dup_2', title: 'Video B', url: 'https://test.com/b' }
        ]
      },
      {
        items: [
          { external_id: 'dup_1', title: 'Video A (Page 2 Dup)', url: 'https://test.com/a' },
          { external_id: 'dup_3', title: 'Video C', url: 'https://test.com/c' }
        ]
      }
    ];

    const adapter = new ConfigurableMockAdapter({ name: 'dup_provider', pages: mockPages });
    const storage = new MockStorage();
    const engine = new CollectionEngine({
      storage,
      adapters: [adapter],
      targetNewLinks: 10,
      batchSize: 50,
      maxExecutionTimeSeconds: 10
    });

    const reporter = await engine.run();

    assert.equal(reporter.uniqueNewRecords, 3, 'Should only record 3 unique videos');
    assert.equal(reporter.duplicatesSkipped, 1, 'Should record 1 duplicate skipped');
    assert.equal(storage.videos.size, 3);
  });

  // 5. Duplicate links across different executions
  test('5. Duplicate links across different executions (upsert & preserve discovered_at)', async () => {
    const storage = new MockStorage();
    const originalTime = '2026-01-01T00:00:00.000Z';

    // Seed storage with existing video
    await storage.batchUpsertVideos([{
      source: 'exec_source',
      external_id: 'existing_vid',
      dedupe_key: 'exec_source:existing_vid',
      title: 'Old Title',
      canonical_url: 'https://test.com/existing',
      discovered_at: originalTime,
      last_seen_at: originalTime,
      is_available: true
    }]);

    const mockPages = [
      {
        items: [
          { external_id: 'existing_vid', title: 'Updated Title', url: 'https://test.com/existing' },
          { external_id: 'brand_new_vid', title: 'New Video', url: 'https://test.com/new' }
        ]
      }
    ];

    const adapter = new ConfigurableMockAdapter({ name: 'exec_source', pages: mockPages });
    const engine = new CollectionEngine({
      storage,
      adapters: [adapter],
      targetNewLinks: 10,
      batchSize: 50,
      maxExecutionTimeSeconds: 10
    });

    const reporter = await engine.run();

    assert.equal(storage.videos.size, 2, 'Total rows should be 2, not 3');
    const existing = storage.videos.get('exec_source:existing_vid');
    assert.equal(existing.discovered_at, originalTime, 'Original discovered_at must be preserved');
    assert.notEqual(existing.last_seen_at, originalTime, 'last_seen_at must be refreshed');
    assert.equal(reporter.recordsUpdated, 1, 'Should count 1 updated record');
    assert.equal(reporter.uniqueNewRecords, 1, 'Should count 1 new record');
  });

  // 6. Multiple sources running together
  test('6. Multiple sources running together concurrently', async () => {
    const adapterA = new ConfigurableMockAdapter({
      name: 'source_a',
      pages: [{ items: [{ external_id: 'a1', title: 'A1', url: 'https://a.com/1' }] }]
    });
    const adapterB = new ConfigurableMockAdapter({
      name: 'source_b',
      pages: [{ items: [{ external_id: 'b1', title: 'B1', url: 'https://b.com/1' }] }]
    });
    const adapterC = new ConfigurableMockAdapter({
      name: 'source_c',
      pages: [{ items: [{ external_id: 'c1', title: 'C1', url: 'https://c.com/1' }] }]
    });

    const storage = new MockStorage();
    const engine = new CollectionEngine({
      storage,
      adapters: [adapterA, adapterB, adapterC],
      concurrencyLimit: 2,
      targetNewLinks: 10,
      maxExecutionTimeSeconds: 10
    });

    const reporter = await engine.run();

    assert.equal(reporter.uniqueNewRecords, 3, 'All 3 sources should contribute');
    assert.ok(storage.videos.has('source_a:a1'));
    assert.ok(storage.videos.has('source_b:b1'));
    assert.ok(storage.videos.has('source_c:c1'));
  });

  // 7. Source-specific rate limiting
  test('7. Source-specific rate limiting does not block other sources', async () => {
    const rateLimitedAdapter = new ConfigurableMockAdapter({
      name: 'rate_limited_source',
      pages: [
        { items: [{ external_id: 'rl1', title: 'RL1', url: 'https://rl.com/1' }] }
      ],
      rateLimitAtPage: 1
    });

    const healthyAdapter = new ConfigurableMockAdapter({
      name: 'healthy_source',
      pages: [
        { items: [{ external_id: 'h1', title: 'H1', url: 'https://h.com/1' }] },
        { items: [{ external_id: 'h2', title: 'H2', url: 'https://h.com/2' }] }
      ]
    });

    const storage = new MockStorage();
    const engine = new CollectionEngine({
      storage,
      adapters: [rateLimitedAdapter, healthyAdapter],
      targetNewLinks: 10,
      maxExecutionTimeSeconds: 10
    });

    const reporter = await engine.run();

    assert.ok(reporter.rateLimitEvents >= 1, 'Should record rate limit event');
    assert.ok(storage.videos.has('healthy_source:h1'), 'Healthy source should succeed');
    assert.ok(storage.videos.has('healthy_source:h2'), 'Healthy source should complete pagination');
  });

  // 8. Runtime-budget exhaustion
  test('8. Runtime budget exhaustion triggers graceful exit and saves checkpoints', async () => {
    const adapter = new ConfigurableMockAdapter({
      name: 'slow_source',
      pages: [
        { items: [{ external_id: 's1', title: 'S1', url: 'https://s.com/1' }] },
        { items: [{ external_id: 's2', title: 'S2', url: 'https://s.com/2' }] },
        { items: [{ external_id: 's3', title: 'S3', url: 'https://s.com/3' }] }
      ]
    });

    const storage = new MockStorage();
    const engine = new CollectionEngine({
      storage,
      adapters: [adapter],
      targetNewLinks: 100,
      maxExecutionTimeSeconds: 0.1,
      safetyMarginSeconds: 0.5 // Safety margin > budget => immediately triggers budget_exhausted
    });

    const reporter = await engine.run();

    assert.equal(reporter.status, 'budget_exhausted', 'Status should be budget_exhausted');
  });

  // 9. Batch database insertion
  test('9. Batch database insertion splits into configured batchSize', async () => {
    const storage = new MockStorage();
    const items = [];
    for (let i = 0; i < 125; i++) {
      items.push({
        source: 'batch_source',
        external_id: `item_${i}`,
        dedupe_key: `batch_source:item_${i}`,
        title: `Item ${i}`,
        canonical_url: `https://test.com/${i}`
      });
    }

    const res = await storage.batchUpsertVideos(items, 50);

    assert.equal(res.totalCommitted, 125);
    assert.equal(res.insertedCount, 125);
    assert.equal(storage.videos.size, 125);
  });

  // 10. Storage threshold protection
  test('10. Storage threshold protection (Warning >70% & Critical >80%)', async () => {
    // Critical threshold exceeded (85%)
    const criticalStorage = new MockStorage({
      dbMaxSizeBytes: 1000,
      warningThresholdPercent: 70,
      criticalThresholdPercent: 80,
      simulatedStorageBytes: 850
    });

    const adapter = new ConfigurableMockAdapter({
      name: 'test_provider',
      pages: [{ items: [{ external_id: 'crit1', title: 'Crit', url: 'https://c.com' }] }]
    });

    const engineCritical = new CollectionEngine({
      storage: criticalStorage,
      adapters: [adapter],
      targetNewLinks: 10
    });

    const reporterCritical = await engineCritical.run();

    assert.equal(reporterCritical.status, 'storage_critical');
    assert.equal(criticalStorage.videos.size, 0, 'No collection should occur under critical storage');

    // Warning threshold exceeded (75%)
    const warningStorage = new MockStorage({
      dbMaxSizeBytes: 1000,
      warningThresholdPercent: 70,
      criticalThresholdPercent: 80,
      simulatedStorageBytes: 750
    });

    const engineWarning = new CollectionEngine({
      storage: warningStorage,
      adapters: [adapter],
      targetNewLinks: 200
    });

    const reporterWarning = await engineWarning.run();
    assert.ok(reporterWarning.storageHealth.isWarning);
  });

  // 11. Seven-day cleanup
  test('11. Seven-day cleanup deletes old discovery records while preserving recent records', async () => {
    const storage = new MockStorage();
    const now = Date.now();
    const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();

    await storage.batchUpsertVideos([
      { dedupe_key: 'old_1', source: 't', external_id: 'o1', discovered_at: tenDaysAgo },
      { dedupe_key: 'old_2', source: 't', external_id: 'o2', discovered_at: tenDaysAgo },
      { dedupe_key: 'recent_1', source: 't', external_id: 'r1', discovered_at: threeDaysAgo },
      { dedupe_key: 'recent_2', source: 't', external_id: 'r2', discovered_at: oneDayAgo }
    ]);

    assert.equal(storage.videos.size, 4);

    const deleted = await storage.cleanupOldVideos(7);

    assert.equal(deleted, 2, 'Should delete exactly 2 records older than 7 days');
    assert.equal(storage.videos.size, 2, '2 recent records must be preserved');
    assert.ok(storage.videos.has('recent_1'));
    assert.ok(storage.videos.has('recent_2'));
  });

  // 12. Collection statistics
  test('12. Collection statistics tracking and provider ranking', async () => {
    const reporter = new CollectionReporter();
    reporter.recordPageFetch('alpha', { itemCount: 20, requests: 1 });
    reporter.recordBatchResult('alpha', { newCount: 18, dupCount: 2 });

    reporter.recordPageFetch('beta', { itemCount: 10, requests: 2 });
    reporter.recordBatchResult('beta', { newCount: 4, dupCount: 6 });

    reporter.finish({
      status: 'target_reached',
      notes: 'Completed successfully',
      targetNewLinks: 200,
      maxNewLinks: 300
    });

    const dbRecord = reporter.toDatabaseRecord();

    assert.equal(dbRecord.videosDiscovered, 30);
    assert.equal(dbRecord.uniqueNewRecords, 22);
    assert.equal(dbRecord.duplicatesSkipped, 8);
    assert.equal(dbRecord.providerRequests, 3);
    assert.equal(dbRecord.pagesFetched, 2);
    assert.equal(dbRecord.status, 'target_reached');
    assert.ok(dbRecord.providerStats.alpha.newItems > dbRecord.providerStats.beta.newItems);
  });
});
