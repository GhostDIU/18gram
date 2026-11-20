/**
 * Base Source Adapter Interface for Video Collection
 * All providers (RedGifs, Pornhub, Eporner, etc.) extend this class.
 */
export class BaseAdapter {
  /**
   * @param {Object} options
   * @param {string} options.name Source identifier (e.g. 'redgifs', 'pornhub')
   * @param {number} [options.timeoutMs=8000] HTTP request timeout in milliseconds
   * @param {number} [options.maxRequestsPerRun=25] Safety cap on requests per run
   * @param {string} [options.userAgent] Custom User-Agent
   */
  constructor({ name, timeoutMs = 8000, maxRequestsPerRun = 25, userAgent } = {}) {
    this.name = name;
    this.timeoutMs = timeoutMs;
    this.maxRequestsPerRun = maxRequestsPerRun;
    this.userAgent = userAgent || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    // Metrics for adaptive allocation & reporting
    this.requestsCount = 0;
    this.itemsFound = 0;
    this.newItemsCount = 0;
    this.errorsCount = 0;
    this.consecutiveErrors = 0;
    this.rateLimitEvents = 0;
    this.isRateLimited = false;
  }

  /**
   * Fetch a page/batch of videos from the provider.
   * Standard interface: fetchVideos({ cursor, limit, since })
   * @param {Object} params
   * @param {any} [params.cursor] Provider pagination cursor/page/offset
   * @param {number} [params.limit=20] Requested item count
   * @param {string|number} [params.since] Optional timestamp for incremental collection
   * @returns {Promise<{ items: Array, nextCursor: any, hasMore: boolean }>}
   */
  async fetchVideos({ cursor, limit = 20, since = null }) {
    throw new Error(`fetchVideos() must be implemented by adapter ${this.name}`);
  }

  /**
   * Helper to execute lightweight HTTP requests with timeout, error and rate limit handling.
   * @param {string} url
   * @param {RequestInit} [options={}]
   * @returns {Promise<Response>}
   */
  async request(url, options = {}) {
    if (this.requestsCount >= this.maxRequestsPerRun) {
      throw new Error(`[${this.name}] Request quota exceeded (${this.maxRequestsPerRun} requests)`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers = {
      'User-Agent': this.userAgent,
      'Accept': 'application/json, text/plain, */*',
      ...(options.headers || {})
    };

    try {
      this.requestsCount++;
      const res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });

      if (res.status === 429) {
        this.rateLimitEvents++;
        this.isRateLimited = true;
        this.consecutiveErrors++;
        console.warn(`[${this.name}] Rate limit (429) encountered at ${url}`);
        return res;
      }

      if (!res.ok) {
        this.consecutiveErrors++;
      } else {
        this.consecutiveErrors = 0;
      }

      return res;
    } catch (err) {
      this.errorsCount++;
      this.consecutiveErrors++;
      if (err.name === 'AbortError') {
        console.warn(`[${this.name}] Request timed out after ${this.timeoutMs}ms: ${url}`);
      } else {
        console.warn(`[${this.name}] Network error: ${err.message}`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Normalize raw provider item into standard 18gram video schema.
   * Removes unnecessary bloated HTML and trims fields to save Supabase storage.
   * @param {Object} raw
   * @returns {Object} Normalized video record
   */
  normalizeVideo(raw) {
    const externalId = String(raw.external_id || raw.id || raw.rawId || '').trim();
    if (!externalId) {
      throw new Error(`[${this.name}] Cannot normalize video without external id`);
    }

    const dedupeKey = `${this.name}:${externalId}`;
    const title = String(raw.title || '').trim().slice(0, 255);
    const author = String(raw.author || '').trim().slice(0, 100);
    const canonicalUrl = String(raw.canonical_url || raw.webUrl || raw.url || '').trim();

    // Clean and deduplicate tags, maximum 10 compact tags
    const rawTags = Array.isArray(raw.tags) ? raw.tags : [];
    const tags = Array.from(
      new Set(
        rawTags
          .map(t => (typeof t === 'string' ? t : t?.name || t?.tag_name || ''))
          .map(t => t.toLowerCase().trim().replace(/[^a-z0-9_-]/g, ''))
          .filter(t => t.length > 1 && t.length <= 30)
      )
    ).slice(0, 10);

    return {
      source: this.name,
      external_id: externalId,
      canonical_url: canonicalUrl,
      dedupe_key: dedupeKey,
      video_url: raw.video_url || raw.videoUrl || null,
      embed_url: raw.embed_url || raw.embedUrl || null,
      title: title || `${this.name.toUpperCase()} Reel #${externalId}`,
      poster_url: raw.poster_url || raw.poster || raw.thumbnail || null,
      author: author || `@${this.name}`,
      tags,
      duration: Number.isInteger(raw.duration) ? raw.duration : Math.round(Number(raw.duration) || 0),
      is_available: raw.is_available !== false
    };
  }

  /**
   * Current yield ratio (new unique videos / requests).
   * Used by adaptive scheduler.
   */
  getYieldRatio() {
    if (this.requestsCount === 0) return 1.0;
    return this.newItemsCount / this.requestsCount;
  }

  /**
   * Reset adapter counters between runs.
   */
  resetStats() {
    this.requestsCount = 0;
    this.itemsFound = 0;
    this.newItemsCount = 0;
    this.errorsCount = 0;
    this.consecutiveErrors = 0;
    this.rateLimitEvents = 0;
    this.isRateLimited = false;
  }
}
