import { BaseAdapter } from './base.js';

const NICHES = [
  'instagram',
  'tik-tok',
  'amateur-girls',
  'nsfw-cosplay',
  'thick-booty',
  'fit-girls',
  'latinas',
  'busty-asians',
  'goth-girls'
];

export class RedGifsAdapter extends BaseAdapter {
  constructor(options = {}) {
    super({ name: 'redgifs', timeoutMs: 9000, maxRequestsPerRun: 25, ...options });
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  /**
   * Acquire or refresh RedGifs temporary bearer token.
   * @param {boolean} [force=false]
   * @returns {Promise<string|null>}
   */
  async getAuthToken(force = false) {
    if (!force && this.token && Date.now() < this.tokenExpiresAt) {
      return this.token;
    }

    try {
      const res = await this.request('https://api.redgifs.com/v2/auth/temporary');
      if (!res.ok) {
        console.warn(`[redgifs] Auth returned status ${res.status}`);
        return null;
      }
      const data = await res.json();
      this.token = data.token;
      // Expire in 6 hours (API tokens typically valid for 12-24h)
      this.tokenExpiresAt = Date.now() + 6 * 60 * 60 * 1000;
      return this.token;
    } catch (err) {
      console.warn(`[redgifs] Auth token error: ${err.message}`);
      return null;
    }
  }

  /**
   * Deep pagination across niches and pages.
   * Cursor structure: { nicheIndex: number, page: number }
   */
  async fetchVideos({ cursor, limit = 20, since = null, category = null } = {}) {
    let nicheIndex = cursor?.nicheIndex ?? 0;
    let page = cursor?.page ?? 1;

    if (category) {
      const cat = category === 'tiktok' ? 'tik-tok' : category;
      const idx = NICHES.indexOf(cat);
      if (idx >= 0) nicheIndex = idx;
    }

    if (nicheIndex >= NICHES.length) {
      nicheIndex = 0;
      page = 1;
    }

    const currentNiche = NICHES[nicheIndex];
    let token = await this.getAuthToken();
    if (!token) {
      return { items: [], nextCursor: { nicheIndex, page }, hasMore: false };
    }

    const count = Math.min(Math.max(limit, 10), 30);
    const targetCategory = category || currentNiche;
    let url;

    if (targetCategory === 'facebook') {
      url = `https://api.redgifs.com/v2/gifs/search?search_text=facebook&count=${count}&page=${page}`;
    } else if (targetCategory === 'tiktok' || targetCategory === 'tik-tok') {
      url = `https://api.redgifs.com/v2/niches/tik-tok/gifs?count=${count}&page=${page}`;
    } else if (targetCategory === 'instagram') {
      url = `https://api.redgifs.com/v2/niches/instagram/gifs?count=${count}&page=${page}`;
    } else if (NICHES.includes(targetCategory)) {
      url = `https://api.redgifs.com/v2/niches/${encodeURIComponent(targetCategory)}/gifs?count=${count}&page=${page}`;
    } else {
      url = `https://api.redgifs.com/v2/gifs/search?search_text=${encodeURIComponent(targetCategory)}&count=${count}&page=${page}`;
    }

    try {
      let res = await this.request(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // Handle token expiration retry
      if (res.status === 401) {
        console.log('[redgifs] 401 received, refreshing token and retrying...');
        token = await this.getAuthToken(true);
        if (token) {
          res = await this.request(url, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
        }
      }

      if (res.status === 429) {
        return { items: [], nextCursor: { nicheIndex, page }, hasMore: false };
      }

      if (!res.ok) {
        console.warn(`[redgifs] Fetch returned status ${res.status}`);
        // Advance to next niche on repeated errors
        return {
          items: [],
          nextCursor: { nicheIndex: (nicheIndex + 1) % NICHES.length, page: 1 },
          hasMore: true
        };
      }

      const data = await res.json();
      const rawGifs = data.gifs || [];
      const totalPages = data.pages || 50;

      const normalized = rawGifs
        .filter(g => g.id && g.urls && (g.urls.hd || g.urls.sd))
        .filter(g => !g.duration || g.duration <= 90) // Strictly short reels <= 90s
        .map(g => {
          return this.normalizeVideo({
            external_id: g.id,
            category: targetCategory === 'tik-tok' ? 'tiktok' : targetCategory,
            canonical_url: `https://www.redgifs.com/watch/${g.id}`,
            video_url: g.urls.hd || g.urls.sd,
            embed_url: `https://www.redgifs.com/ifr/${g.id}`,
            title: g.description?.trim() || (g.tags?.length ? `#${g.tags[0]} reel` : `RedGifs Reel ${g.id}`),
            poster_url: g.urls.poster || g.urls.thumbnail,
            author: g.userName ? `@${g.userName}` : '@anonymous',
            tags: g.tags || [],
            duration: Math.round(g.duration || 0),
            is_available: true
          });
        });

      this.itemsFound += normalized.length;

      // Determine next cursor
      let nextCursor;
      let hasMore = true;

      if (rawGifs.length === 0 || page >= totalPages) {
        // Switch to next niche
        const nextNicheIdx = (nicheIndex + 1) % NICHES.length;
        nextCursor = { nicheIndex: nextNicheIdx, page: 1 };
      } else {
        nextCursor = { nicheIndex, page: page + 1 };
      }

      return {
        items: normalized,
        nextCursor,
        hasMore
      };
    } catch (err) {
      console.warn(`[redgifs] fetchVideos error: ${err.message}`);
      return {
        items: [],
        nextCursor: { nicheIndex: (nicheIndex + 1) % NICHES.length, page: 1 },
        hasMore: true
      };
    }
  }
}
