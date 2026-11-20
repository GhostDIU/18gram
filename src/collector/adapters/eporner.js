import { BaseAdapter } from './base.js';

const QUERIES = [
  'vertical',
  'short',
  'tiktok',
  'reels',
  'quickie',
  'amateur'
];

export class EpornerAdapter extends BaseAdapter {
  constructor(options = {}) {
    super({ name: 'eporner', timeoutMs: 9000, maxRequestsPerRun: 25, ...options });
  }

  /**
   * Deep pagination across queries and pages.
   * Cursor structure: { queryIndex: number, page: number }
   */
  async fetchVideos({ cursor, limit = 20, since = null } = {}) {
    let queryIndex = cursor?.queryIndex ?? 0;
    let page = cursor?.page ?? 1;

    if (queryIndex >= QUERIES.length) {
      queryIndex = 0;
      page = 1;
    }

    const currentQuery = QUERIES[queryIndex];
    const count = Math.min(Math.max(limit, 10), 30);
    const url = `https://www.eporner.com/api/v2/web/search/?query=${encodeURIComponent(currentQuery)}&per_page=${count}&page=${page}&thumbsize=big&order=latest&format=json`;

    try {
      const res = await this.request(url);

      if (res.status === 429) {
        return { items: [], nextCursor: { queryIndex, page }, hasMore: false };
      }

      if (!res.ok) {
        console.warn(`[eporner] Fetch returned status ${res.status}`);
        return {
          items: [],
          nextCursor: { queryIndex: (queryIndex + 1) % QUERIES.length, page: 1 },
          hasMore: true
        };
      }

      const data = await res.json();
      const videos = data.videos || [];
      const totalPages = data.total_pages || 50;

      const normalized = videos
        .filter(v => v.id)
        .map(v => {
          const rawKeywords = typeof v.keywords === 'string' ? v.keywords.split(',') : [];
          const poster = v.default_thumb?.src || (Array.isArray(v.thumbs) && v.thumbs[0]?.src) || null;

          return this.normalizeVideo({
            external_id: String(v.id),
            canonical_url: v.url || `https://www.eporner.com/video-${v.id}/`,
            video_url: null,
            embed_url: v.embed || `https://www.eporner.com/embed/${v.id}/`,
            title: v.title || 'Eporner Video',
            poster_url: poster,
            author: '@eporner_creator',
            tags: rawKeywords,
            duration: parseInt(v.length_sec, 10) || 0,
            is_available: true
          });
        });

      this.itemsFound += normalized.length;

      let nextCursor;
      let hasMore = true;

      if (videos.length === 0 || page >= totalPages) {
        const nextQueryIdx = (queryIndex + 1) % QUERIES.length;
        nextCursor = { queryIndex: nextQueryIdx, page: 1 };
      } else {
        nextCursor = { queryIndex, page: page + 1 };
      }

      return {
        items: normalized,
        nextCursor,
        hasMore
      };
    } catch (err) {
      console.warn(`[eporner] fetchVideos error: ${err.message}`);
      return {
        items: [],
        nextCursor: { queryIndex: (queryIndex + 1) % QUERIES.length, page: 1 },
        hasMore: true
      };
    }
  }
}
