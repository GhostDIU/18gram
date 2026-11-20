/**
 * Checkpoint Manager
 * Manages per-source pagination cursors and ensures strict commit-before-advance semantics.
 */
export class CheckpointManager {
  /**
   * @param {Object} storage SupabaseStorage or MockStorage
   * @param {number} [options.overlapWindowSeconds=300] Overlap window for timestamp-based cursors (default 5 mins)
   */
  constructor(storage, { overlapWindowSeconds = 300 } = {}) {
    this.storage = storage;
    this.overlapWindowSeconds = overlapWindowSeconds;
    this.cursors = new Map(); // source -> { cursor, lastSeenPublishedAt, uncommittedCursor }
  }

  /**
   * Load checkpoints for all active sources from database.
   * @param {string[]} sourceNames
   */
  async loadAll(sourceNames) {
    for (const source of sourceNames) {
      const data = await this.storage.getCursor(source);
      this.cursors.set(source, {
        committedCursor: data.cursor,
        pendingCursor: data.cursor,
        lastSeenPublishedAt: data.lastSeenPublishedAt,
        pendingPublishedAt: data.lastSeenPublishedAt
      });
    }
  }

  /**
   * Get current working cursor for a source.
   * @param {string} source
   * @returns {any}
   */
  getCursor(source) {
    const entry = this.cursors.get(source);
    return entry ? entry.pendingCursor : null;
  }

  /**
   * Stage cursor advance pending database commit.
   * @param {string} source
   * @param {any} nextCursor
   * @param {string} [lastSeenPublishedAt]
   */
  stageAdvance(source, nextCursor, lastSeenPublishedAt = null) {
    let entry = this.cursors.get(source);
    if (!entry) {
      entry = { committedCursor: null, pendingCursor: null };
      this.cursors.set(source, entry);
    }
    entry.pendingCursor = nextCursor;
    if (lastSeenPublishedAt) {
      entry.pendingPublishedAt = lastSeenPublishedAt;
    }
  }

  /**
   * Commit staged cursor to persistent storage.
   * MUST be called only AFTER the database batch has been committed!
   * @param {string} source
   */
  async commitAdvance(source) {
    const entry = this.cursors.get(source);
    if (!entry || entry.pendingCursor === undefined) return;

    // Persist to storage
    await this.storage.saveCursor(
      source,
      entry.pendingCursor,
      entry.pendingPublishedAt
    );

    // Update in-memory committed cursor
    entry.committedCursor = entry.pendingCursor;
    entry.lastSeenPublishedAt = entry.pendingPublishedAt;
  }

  /**
   * Roll back pending cursor to last known committed cursor (on failure).
   * @param {string} source
   */
  rollback(source) {
    const entry = this.cursors.get(source);
    if (entry) {
      entry.pendingCursor = entry.committedCursor;
      entry.pendingPublishedAt = entry.lastSeenPublishedAt;
    }
  }

  /**
   * Calculate timestamp with overlap window to avoid edge drops.
   * @param {string|number} timestamp
   * @returns {string}
   */
  getTimestampWithOverlap(timestamp) {
    if (!timestamp) return null;
    const timeMs = new Date(timestamp).getTime();
    if (isNaN(timeMs)) return null;
    const overlapMs = this.overlapWindowSeconds * 1000;
    return new Date(Math.max(0, timeMs - overlapMs)).toISOString();
  }
}
