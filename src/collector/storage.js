import { createClient } from '@supabase/supabase-js';

/**
 * Storage Interface and Supabase implementation for video collection.
 */
export class SupabaseStorage {
  /**
   * @param {Object} options
   * @param {string} [options.supabaseUrl]
   * @param {string} [options.supabaseKey] Service role key or anon key
   * @param {number} [options.dbMaxSizeBytes=524288000] 500 MB Free Tier limit
   * @param {number} [options.warningThresholdPercent=70]
   * @param {number} [options.criticalThresholdPercent=80]
   */
  constructor({
    supabaseUrl = process.env.SUPABASE_URL,
    supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
    dbMaxSizeBytes = 524288000,
    warningThresholdPercent = 70,
    criticalThresholdPercent = 80
  } = {}) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
    this.dbMaxSizeBytes = parseInt(process.env.DB_MAX_SIZE_BYTES, 10) || dbMaxSizeBytes;
    this.warningThresholdPercent = parseFloat(process.env.DB_WARNING_THRESHOLD_PERCENT) || warningThresholdPercent;
    this.criticalThresholdPercent = parseFloat(process.env.DB_CRITICAL_THRESHOLD_PERCENT) || criticalThresholdPercent;

    if (this.supabaseUrl && this.supabaseKey) {
      this.client = createClient(this.supabaseUrl, this.supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
    } else {
      this.client = null;
    }
  }

  /**
   * Check if live database is configured.
   */
  isConfigured() {
    return Boolean(this.client);
  }

  /**
   * Batch upsert videos into the videos table.
   * Commits in batches of batchSize (default 50-100).
   * Uses dedupe_key as the unique conflict target.
   * Preserves original discovered_at on conflict!
   * @param {Array<Object>} videos
   * @param {number} [batchSize=50]
   * @returns {Promise<{ insertedCount: number, updatedCount: number, totalCommitted: number }>}
   */
  async batchUpsertVideos(videos, batchSize = 50) {
    if (!videos || videos.length === 0) {
      return { insertedCount: 0, updatedCount: 0, totalCommitted: 0 };
    }

    if (!this.client) {
      console.warn('[storage] Supabase client not configured. Simulating batch commit.');
      return { insertedCount: videos.length, updatedCount: 0, totalCommitted: videos.length };
    }

    let insertedCount = 0;
    let updatedCount = 0;
    let totalCommitted = 0;

    for (let i = 0; i < videos.length; i += batchSize) {
      const rawChunk = videos.slice(i, i + batchSize);
      const nowIso = new Date().toISOString();

      // Ensure deduplication within the chunk to prevent Postgres ON CONFLICT DO UPDATE error
      const chunkMap = new Map();
      for (const v of rawChunk) {
        const key = v.dedupe_key || `${v.source_platform || v.source}:${v.external_id}`;
        if (!chunkMap.has(key)) {
          chunkMap.set(key, v);
        }
      }
      const chunk = Array.from(chunkMap.values());

      // Ensure compact fields and valid dates
      const payload = chunk.map(v => ({
        source: v.source_platform || v.source,
        source_platform: v.source_platform || v.source,
        category: v.category || 'tik-tok',
        is_nsfw: v.is_nsfw !== false,
        external_id: v.external_id,
        canonical_url: v.canonical_url,
        dedupe_key: v.dedupe_key || `${v.source_platform || v.source}:${v.external_id}`,
        video_url: v.video_url || null,
        embed_url: v.embed_url || null,
        title: (v.title || '').slice(0, 255),
        poster_url: v.poster_url || v.thumbnail_url || null,
        thumbnail_url: v.thumbnail_url || v.poster_url || null,
        author: (v.author || '').slice(0, 100),
        tags: Array.isArray(v.tags) ? v.tags.slice(0, 10) : [],
        duration: v.duration || 0,
        discovered_at: v.discovered_at || v.created_at || nowIso,
        created_at: v.created_at || v.discovered_at || nowIso,
        last_seen_at: nowIso,
        is_available: v.is_available !== false
      }));

      // PostgREST upsert with onConflict on dedupe_key
      const { data, error } = await this.client
        .from('videos')
        .upsert(payload, {
          onConflict: 'dedupe_key',
          ignoreDuplicates: false
        })
        .select('id, dedupe_key, discovered_at, last_seen_at');

      if (error) {
        console.error(`[storage] Batch upsert failed for ${chunk.length} items:`, error.message);
        throw error;
      }

      // Calculate newly inserted vs updated
      const returnedRows = data || [];
      totalCommitted += returnedRows.length || chunk.length;

      for (const row of returnedRows) {
        // If discovered_at is equal to last_seen_at (within 2s), it was newly inserted
        const disc = new Date(row.discovered_at).getTime();
        const seen = new Date(row.last_seen_at).getTime();
        if (Math.abs(disc - seen) < 3000) {
          insertedCount++;
        } else {
          updatedCount++;
        }
      }
    }

    return { insertedCount, updatedCount, totalCommitted };
  }

  /**
   * Monitor database and table storage health.
   * Compares against safety thresholds.
   * @returns {Promise<{
   *   dbSizeBytes: number,
   *   videosTableBytes: number,
   *   totalVideoCount: number,
   *   avgBytesPerVideo: number,
   *   usagePercentage: number,
   *   isWarning: boolean,
   *   isCritical: boolean
   * }>}
   */
  async checkStorageHealth() {
    let dbSizeBytes = 0;
    let videosTableBytes = 0;
    let totalVideoCount = 0;
    let avgBytesPerVideo = 450; // Average row estimate in bytes
    let usagePercentage = 0;

    if (this.client) {
      try {
        // Try calling custom RPC function
        const { data, error } = await this.client.rpc('get_storage_health', {
          db_max_size_bytes: this.dbMaxSizeBytes
        });

        if (!error && data && data.length > 0) {
          const stats = data[0];
          dbSizeBytes = Number(stats.db_size_bytes) || 0;
          videosTableBytes = Number(stats.videos_table_bytes) || 0;
          totalVideoCount = Number(stats.total_video_count) || 0;
          avgBytesPerVideo = Number(stats.avg_bytes_per_video) || 450;
          usagePercentage = Number(stats.usage_percentage) || 0;
        } else {
          // Fallback: query videos count directly
          const { count, error: countErr } = await this.client
            .from('videos')
            .select('*', { count: 'exact', head: true });

          if (!countErr && typeof count === 'number') {
            totalVideoCount = count;
            videosTableBytes = totalVideoCount * avgBytesPerVideo;
            dbSizeBytes = videosTableBytes + 15 * 1024 * 1024; // Base postgres overhead ~15MB
            usagePercentage = (dbSizeBytes / this.dbMaxSizeBytes) * 100;
          }
        }
      } catch (err) {
        console.warn('[storage] Error checking storage health, using fallback calculation:', err.message);
      }
    }

    const isWarning = usagePercentage >= this.warningThresholdPercent;
    const isCritical = usagePercentage >= this.criticalThresholdPercent;

    return {
      dbSizeBytes,
      videosTableBytes,
      totalVideoCount,
      avgBytesPerVideo: Math.round(avgBytesPerVideo),
      usagePercentage: parseFloat(usagePercentage.toFixed(2)),
      isWarning,
      isCritical
    };
  }

  /**
   * Delete discovery records older than retentionDays (default 7 days).
   * Does NOT touch user bookmarks (which are stored in IndexedDB).
   * @param {number} [retentionDays=7]
   * @returns {Promise<number>} Number of deleted rows
   */
  async cleanupOldVideos(retentionDays = 7) {
    if (!this.client) {
      return 0;
    }

    try {
      // 1. Try cleanup_old_videos RPC
      const { data, error } = await this.client.rpc('cleanup_old_videos', {
        retention_days: retentionDays
      });

      if (!error && typeof data === 'number') {
        console.log(`[storage] 7-day retention cleanup deleted ${data} old video records.`);
        return data;
      }

      // 2. Fallback direct DELETE
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
      const { count, error: delErr } = await this.client
        .from('videos')
        .delete({ count: 'exact' })
        .lt('discovered_at', cutoff);

      if (delErr) {
        console.error('[storage] Cleanup failed:', delErr.message);
        return 0;
      }

      const deleted = count || 0;
      console.log(`[storage] 7-day retention cleanup deleted ${deleted} old video records.`);
      return deleted;
    } catch (err) {
      console.error('[storage] Error during 7-day cleanup:', err.message);
      return 0;
    }
  }

  /**
   * Read saved pagination checkpoint for a source.
   * @param {string} source
   * @returns {Promise<{ cursor: any, lastSuccessfulCollectionAt: string|null, lastSeenPublishedAt: string|null }>}
   */
  async getCursor(source) {
    if (!this.client) {
      return { cursor: null, lastSuccessfulCollectionAt: null, lastSeenPublishedAt: null };
    }

    try {
      const { data, error } = await this.client
        .from('source_cursors')
        .select('*')
        .eq('source', source)
        .maybeSingle();

      if (error || !data) {
        return { cursor: null, lastSuccessfulCollectionAt: null, lastSeenPublishedAt: null };
      }

      return {
        cursor: data.cursor,
        lastSuccessfulCollectionAt: data.last_successful_collection_at,
        lastSeenPublishedAt: data.last_seen_published_at
      };
    } catch (err) {
      console.warn(`[storage] Could not load cursor for ${source}:`, err.message);
      return { cursor: null, lastSuccessfulCollectionAt: null, lastSeenPublishedAt: null };
    }
  }

  /**
   * Save pagination checkpoint for a source.
   * MUST only be called after database batch has successfully committed!
   * @param {string} source
   * @param {any} cursor
   * @param {string} [lastSeenPublishedAt]
   */
  async saveCursor(source, cursor, lastSeenPublishedAt = null) {
    if (!this.client) {
      return;
    }

    try {
      const nowIso = new Date().toISOString();
      const payload = {
        source,
        cursor: cursor || {},
        last_successful_collection_at: nowIso,
        updated_at: nowIso
      };

      if (lastSeenPublishedAt) {
        payload.last_seen_published_at = lastSeenPublishedAt;
      }

      const { error } = await this.client
        .from('source_cursors')
        .upsert(payload, { onConflict: 'source' });

      if (error) {
        console.error(`[storage] Failed to save cursor for ${source}:`, error.message);
      }
    } catch (err) {
      console.error(`[storage] Error saving cursor for ${source}:`, err.message);
    }
  }

  /**
   * Record collection execution metrics into collection_runs.
   * @param {Object} runMetrics
   */
  async recordCollectionRun(runMetrics) {
    if (!this.client) {
      return null;
    }

    try {
      const { data, error } = await this.client
        .from('collection_runs')
        .insert([{
          started_at: runMetrics.startedAt,
          completed_at: runMetrics.completedAt,
          duration_ms: runMetrics.durationMs,
          pages_fetched: runMetrics.pagesFetched || 0,
          provider_requests: runMetrics.providerRequests || 0,
          videos_discovered: runMetrics.videosDiscovered || 0,
          unique_new_records: runMetrics.uniqueNewRecords || 0,
          duplicates_skipped: runMetrics.duplicatesSkipped || 0,
          records_updated: runMetrics.recordsUpdated || 0,
          failed_provider_count: runMetrics.failedProviderCount || 0,
          rate_limit_events: runMetrics.rateLimitEvents || 0,
          storage_used_bytes: runMetrics.storageUsedBytes || 0,
          storage_percentage: runMetrics.storagePercentage || 0,
          status: runMetrics.status || 'success',
          summary_notes: runMetrics.summaryNotes || '',
          provider_stats: runMetrics.providerStats || {}
        }])
        .select('id')
        .single();

      if (error) {
        console.error('[storage] Failed to record collection run:', error.message);
        return null;
      }

      return data?.id;
    } catch (err) {
      console.error('[storage] Error recording collection run:', err.message);
      return null;
    }
  }
}

/**
 * In-memory Mock Storage for unit tests and local runs.
 * Fully mirrors SupabaseStorage interface without external dependencies.
 */
export class MockStorage {
  constructor({
    dbMaxSizeBytes = 524288000,
    warningThresholdPercent = 70,
    criticalThresholdPercent = 80,
    simulatedStorageBytes = 0
  } = {}) {
    this.dbMaxSizeBytes = dbMaxSizeBytes;
    this.warningThresholdPercent = warningThresholdPercent;
    this.criticalThresholdPercent = criticalThresholdPercent;
    this.simulatedStorageBytes = simulatedStorageBytes;

    this.videos = new Map(); // dedupe_key -> record
    this.cursors = new Map(); // source -> { cursor, last_successful_collection_at, ... }
    this.collectionRuns = [];
  }

  isConfigured() {
    return true;
  }

  async batchUpsertVideos(videos, batchSize = 50) {
    let insertedCount = 0;
    let updatedCount = 0;
    const nowIso = new Date().toISOString();

    for (const v of videos) {
      if (this.videos.has(v.dedupe_key)) {
        const existing = this.videos.get(v.dedupe_key);
        this.videos.set(v.dedupe_key, {
          ...existing,
          ...v,
          discovered_at: existing.discovered_at, // Preserve discovery timestamp!
          last_seen_at: nowIso
        });
        updatedCount++;
      } else {
        this.videos.set(v.dedupe_key, {
          ...v,
          discovered_at: v.discovered_at || nowIso,
          last_seen_at: nowIso
        });
        insertedCount++;
      }
    }

    return {
      insertedCount,
      updatedCount,
      totalCommitted: videos.length
    };
  }

  async checkStorageHealth() {
    const totalVideoCount = this.videos.size;
    const avgBytesPerVideo = 450;
    const videosTableBytes = totalVideoCount * avgBytesPerVideo;
    const dbSizeBytes = this.simulatedStorageBytes > 0
      ? this.simulatedStorageBytes
      : videosTableBytes + (15 * 1024 * 1024);
    const usagePercentage = (dbSizeBytes / this.dbMaxSizeBytes) * 100;

    return {
      dbSizeBytes,
      videosTableBytes,
      totalVideoCount,
      avgBytesPerVideo,
      usagePercentage: parseFloat(usagePercentage.toFixed(2)),
      isWarning: usagePercentage >= this.warningThresholdPercent,
      isCritical: usagePercentage >= this.criticalThresholdPercent
    };
  }

  async cleanupOldVideos(retentionDays = 7) {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let deleted = 0;

    for (const [key, record] of this.videos.entries()) {
      const disc = new Date(record.discovered_at).getTime();
      if (disc < cutoff) {
        this.videos.delete(key);
        deleted++;
      }
    }

    return deleted;
  }

  async getCursor(source) {
    const entry = this.cursors.get(source);
    if (!entry) {
      return { cursor: null, lastSuccessfulCollectionAt: null, lastSeenPublishedAt: null };
    }
    return {
      cursor: entry.cursor,
      lastSuccessfulCollectionAt: entry.last_successful_collection_at,
      lastSeenPublishedAt: entry.last_seen_published_at
    };
  }

  async saveCursor(source, cursor, lastSeenPublishedAt = null) {
    const nowIso = new Date().toISOString();
    this.cursors.set(source, {
      source,
      cursor,
      last_successful_collection_at: nowIso,
      last_seen_published_at: lastSeenPublishedAt,
      updated_at: nowIso
    });
  }

  async recordCollectionRun(runMetrics) {
    const id = `run_${this.collectionRuns.length + 1}`;
    this.collectionRuns.push({ id, ...runMetrics });
    return id;
  }
}
