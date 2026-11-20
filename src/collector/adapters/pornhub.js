import { BaseAdapter } from './base.js';

const QUERIES = [
  'shorties',
  'tiktok',
  'reels',
  'vertical',
  'amateur shorts',
  'quickies'
];

export class PornhubAdapter extends BaseAdapter {
  constructor(options = {}) {
    super({ name: 'pornhub', timeoutMs: 9000, maxRequestsPerRun: 25, ...options });
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
    const url = `https://www.pornhub.com/webmasters/search?search=${encodeURIComponent(currentQuery)}&thumbsize=large&ordering=mostviewed&page=${page}&count=${count}`;

    try {
      const res = await this.request(url);

      if (res.status === 429) {
        return { items: [], nextCursor: { queryIndex, page }, hasMore: false };
      }

      if (!res.ok) {
        console.warn(`[pornhub] Fetch returned status ${res.status}`);
        return {
          items: [],
          nextCursor: { queryIndex: (queryIndex + 1) % QUERIES.length, page: 1 },
          hasMore: true
        };
      }

      const data = await res.json();
      const videos = data.videos || [];

      const normalized = videos
        .filter(v => v.video_id)
        .map(v => {
          const tags = Array.isArray(v.tags)
            ? v.tags.map(t => (typeof t === 'string' ? t : t.tag_name || ''))
            : [];

          return this.normalizeVideo({
            external_id: String(v.video_id),
            canonical_url: v.url || `https://www.pornhub.com/view_video.php?viewkey=${v.video_id}`,
            video_url: null,
            embed_url: `https://www.pornhub.com/embed/${v.video_id}`,
            title: v.title || 'Pornhub Short',
            poster_url: v.default_thumb || v.thumb || null,
            author: '@pornhub_shorts',
            tags,
            duration: parseInt(v.duration, 10) || 0,
            is_available: true
          });
        });

      this.itemsFound += normalized.length;

      let nextCursor;
      let hasMore = true;

      // When fewer results returned or max page reached for query, rotate query
      if (videos.length === 0 || page >= 40) {
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
      console.warn(`[pornhub] fetchVideos error: ${err.message}`);
      return {
        items: [],
        nextCursor: { queryIndex: (queryIndex + 1) % QUERIES.length, page: 1 },
        hasMore: true
      };
    }
  }
}
