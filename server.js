import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Optional Supabase client for reading pre-collected discovery videos
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const supabase = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
  : null;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data folder exists for bookmarks
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const bookmarksFile = path.join(dataDir, 'bookmarks.json');
if (!fs.existsSync(bookmarksFile)) {
  fs.writeFileSync(bookmarksFile, JSON.stringify([]));
}

// In-memory token store for RedGifs
let redGifsToken = null;
let tokenExpiresAt = 0;

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function getRedGifsToken(forceRefresh = false) {
  if (!forceRefresh && redGifsToken && Date.now() < tokenExpiresAt) {
    return redGifsToken;
  }
  try {
    const res = await fetch('https://api.redgifs.com/v2/auth/temporary', {
      headers: { 'User-Agent': USER_AGENT }
    });
    if (!res.ok) throw new Error(`Auth failed with status ${res.status}`);
    const data = await res.json();
    redGifsToken = data.token;
    tokenExpiresAt = Date.now() + 12 * 60 * 60 * 1000;
    return redGifsToken;
  } catch (err) {
    console.error('Error fetching RedGifs temporary token:', err.message);
    return null;
  }
}

// Fetch RedGifs with auto-retry
async function fetchRedGifs({ niche = 'tik-tok', query = '', page = 1, count = 15 }) {
  let token = await getRedGifsToken();
  if (!token) return [];

  let url;
  if (query && query.trim().length > 0) {
    url = `https://api.redgifs.com/v2/gifs/search?search_text=${encodeURIComponent(query.trim())}&count=${count}&page=${page}`;
  } else if (niche && niche !== 'all') {
    url = `https://api.redgifs.com/v2/niches/${encodeURIComponent(niche)}/gifs?count=${count}&page=${page}`;
  } else {
    url = `https://api.redgifs.com/v2/niches/tik-tok/gifs?count=${count}&page=${page}`;
  }

  try {
    let res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Authorization': `Bearer ${token}`
      }
    });

    // If 401 unauthorized, refresh token and retry once
    if (res.status === 401) {
      console.warn('RedGifs token expired, refreshing and retrying...');
      token = await getRedGifsToken(true);
      if (token) {
        res = await fetch(url, {
          headers: {
            'User-Agent': USER_AGENT,
            'Authorization': `Bearer ${token}`
          }
        });
      }
    }

    if (!res.ok) {
      console.warn(`RedGifs returned status ${res.status}`);
      return [];
    }

    const data = await res.json();
    const rawGifs = data.gifs || [];

    return rawGifs
      .filter(g => g.urls && (g.urls.hd || g.urls.sd))
      .map(g => {
        const isVertical = (g.height || 0) >= (g.width || 0);
        return {
          id: `rg_${g.id}`,
          rawId: g.id,
          source: 'redgifs',
          sourceName: 'RedGifs',
          author: g.userName ? `@${g.userName}` : '@anonymous',
          title: g.description?.trim() || (g.tags && g.tags.length ? g.tags.slice(0, 3).map(t => '#' + t.replace(/\s+/g, '')).join(' ') : '#reels #18+'),
          videoUrl: g.urls.hd || g.urls.sd,
          sdUrl: g.urls.sd,
          poster: g.urls.poster || g.urls.thumbnail,
          hasAudio: Boolean(g.hasAudio),
          likes: g.likes || Math.floor(Math.random() * 900) + 100,
          views: g.views || 0,
          duration: Math.round(g.duration || 0),
          width: g.width,
          height: g.height,
          isVertical,
          tags: g.tags || [],
          type: 'mp4',
          webUrl: `https://www.redgifs.com/watch/${g.id}`
        };
      });
  } catch (err) {
    console.error('RedGifs fetch error:', err.message);
    return [];
  }
}

// Fetch Pornhub Shorts
async function fetchPornhub({ query = '', page = 1, count = 10 }) {
  const searchTerm = query && query.trim().length > 0 ? query.trim() : 'shorties';
  const url = `https://www.pornhub.com/webmasters/search?search=${encodeURIComponent(searchTerm)}&thumbsize=large&ordering=mostviewed&page=${page}&count=${count}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json();
    const videos = data.videos || [];

    return videos.map(v => {
      const tags = Array.isArray(v.tags)
        ? v.tags.map(t => (typeof t === 'string' ? t : t.tag_name))
        : [];

      return {
        id: `ph_${v.video_id}`,
        rawId: v.video_id,
        source: 'pornhub',
        sourceName: 'Pornhub',
        author: '@pornhub_shorts',
        title: v.title || 'Pornhub Short',
        videoUrl: `https://www.pornhub.com/embed/${v.video_id}`,
        poster: v.default_thumb || v.thumb,
        hasAudio: true,
        likes: Math.round(parseFloat(v.rating || 85) * 12),
        views: v.views || 0,
        duration: v.duration,
        width: 1080,
        height: 1920,
        isVertical: true,
        tags: tags.slice(0, 4),
        type: 'embed',
        webUrl: v.url
      };
    });
  } catch (err) {
    console.error('Pornhub fetch error:', err.message);
    return [];
  }
}

// Fetch Eporner 18+ Videos / Shorts
async function fetchEporner({ query = 'vertical', page = 1, count = 12 }) {
  const url = `https://www.eporner.com/api/v2/web/search/?query=${encodeURIComponent(query)}&per_page=${count}&page=${page}&thumbsize=big&order=latest&format=json`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json();
    const videos = data.videos || [];

    return videos.map(v => {
      const rawKeywords = typeof v.keywords === 'string' ? v.keywords.split(',') : [];
      const poster = v.default_thumb?.src || (Array.isArray(v.thumbs) && v.thumbs[0]?.src) || null;

      return {
        id: `ep_${v.id}`,
        rawId: String(v.id),
        source: 'eporner',
        source_platform: 'eporner',
        sourceName: 'Eporner',
        author: '@eporner_creator',
        title: v.title || 'Eporner Video',
        videoUrl: v.embed || `https://www.eporner.com/embed/${v.id}/`,
        poster: poster,
        hasAudio: true,
        likes: Math.floor(Math.random() * 600) + 80,
        views: v.views || 0,
        duration: parseInt(v.length_sec, 10) || 0,
        width: 1080,
        height: 1920,
        isVertical: true,
        tags: rawKeywords.slice(0, 4),
        type: 'embed',
        webUrl: v.url || `https://www.eporner.com/video-${v.id}/`
      };
    });
  } catch (err) {
    console.warn('[server] Eporner fetch error:', err.message);
    return [];
  }
}

// Multi-platform live fallback aggregator
async function fetchMultiPlatformLive({ category = 'tik-tok', query = '', page = 1, count = 20 }) {
  const results = [];
  const promises = [];

  // 1. RedGifs fetch (unless strictly pornhub category)
  if (category !== 'pornhub') {
    promises.push(
      fetchRedGifs({ niche: category, query, page, count: 12 })
        .then(items => results.push(...items))
        .catch(() => {})
    );
  }

  // 2. Pornhub fetch
  const phQuery = query || (category === 'pornhub' ? 'shorties' : `shorties ${category.replace('-', ' ')}`);
  promises.push(
    fetchPornhub({ query: phQuery, page, count: 10 })
      .then(items => results.push(...items))
      .catch(() => {})
  );

  // 3. Eporner fetch (unless strictly pornhub category)
  if (category !== 'pornhub') {
    const epQuery = query || `${category.replace('-', ' ')} vertical`;
    promises.push(
      fetchEporner({ query: epQuery, page, count: 10 })
        .then(items => results.push(...items))
        .catch(() => {})
    );
  }

  await Promise.allSettled(promises);
  return results;
}

// Curated Niches / Categories
const CURATED_NICHES = [
  { id: 'tik-tok', name: 'TikTok & Reels', icon: '🎵', count: '250K+' },
  { id: 'amateur-girls', name: 'Amateur', icon: '💃', count: '1.2M+' },
  { id: 'nsfw-cosplay', name: 'Cosplay', icon: '🎭', count: '35K+' },
  { id: 'thick-booty', name: 'Thick Booty', icon: '🍑', count: '660K+' },
  { id: 'fit-girls', name: 'Fit & Athletic', icon: '💪', count: '67K+' },
  { id: 'latinas', name: 'Latinas', icon: '🔥', count: '318K+' },
  { id: 'busty-asians', name: 'Asian', icon: '🌸', count: '63K+' },
  { id: 'goth-girls', name: 'Goth & E-Girl', icon: '🖤', count: '98K+' },
  { id: 'pornhub', name: 'Pornhub Shorts', icon: '🔞', count: 'Shorties' },
];

const NICHE_MAP = {
  'tik-tok': {
    tags: ['tiktok', 'reels', 'dance', 'trend', 'trends', 'viral', 'short', 'tok', 'tiktoker'],
    source: 'redgifs'
  },
  'amateur-girls': {
    tags: ['amateur', 'homemade', 'verified', 'real', 'amateur-girls', 'girlfriend', 'selfie', 'amateurcouple'],
    source: 'redgifs'
  },
  'nsfw-cosplay': {
    tags: ['cosplay', 'anime', 'costume', 'waifu', 'nsfw-cosplay', 'genshin', 'gamer', 'cosplayer'],
    source: 'redgifs'
  },
  'thick-booty': {
    tags: ['booty', 'thick', 'ass', 'pawg', 'curvy', 'thick-booty', 'bubble', 'bigass', 'twerk', 'twerking'],
    source: 'redgifs'
  },
  'fit-girls': {
    tags: ['fit', 'athletic', 'gym', 'muscle', 'abs', 'fitness', 'fit-girls', 'workout', 'yoga', 'sporty'],
    source: 'redgifs'
  },
  'latinas': {
    tags: ['latina', 'latinas', 'spanish', 'colombian', 'brazilian', 'mexican', 'hispanic'],
    source: 'redgifs'
  },
  'busty-asians': {
    tags: ['asian', 'japanese', 'korean', 'chinese', 'busty-asians', 'oriental', 'filipina'],
    source: 'redgifs'
  },
  'goth-girls': {
    tags: ['goth', 'egirl', 'e-girl', 'punk', 'alt', 'goth-girls', 'emo', 'tattoos', 'tattoo', 'tattooed', 'piercing', 'pierced'],
    source: 'redgifs'
  },
  'pornhub': {
    tags: ['pornhub', 'shorties', 'shorts'],
    source: 'pornhub'
  }
};

// API: Get Curated Categories / Niches
app.get('/api/niches', (req, res) => {
  res.json({ success: true, niches: CURATED_NICHES });
});

// Fisher-Yates array shuffler for fresh discovery feeds
function shuffleArray(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// API: Get Reels (Reads from Supabase Discovery Engine when available, with live fallback)
app.get('/api/reels', async (req, res) => {
  // Prevent any browser or CDN edge caching
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });

  const { source = 'all', niche = 'tik-tok', query = '', page = 1, exclude = '' } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = 15;

  const excludedSet = new Set(
    exclude
      ? exclude.split(',').map(s => s.trim().replace(/^db_/, '')).filter(Boolean)
      : []
  );

  const isPornhubNiche = niche === 'pornhub' || source === 'pornhub';
  const effectiveSource = isPornhubNiche ? 'pornhub' : (source !== 'all' ? source : null);
  const nicheConfig = NICHE_MAP[niche];

  let reels = [];

  // 1. Try reading from pre-discovered Supabase videos if configured
  if (supabase) {
    try {
      let q = supabase
        .from('videos')
        .select('*')
        .eq('is_available', true);

      if (effectiveSource) {
        q = q.or(`source.eq.${effectiveSource},source_platform.eq.${effectiveSource}`);
      }

      // Filter by category in Supabase
      if (niche && niche !== 'all') {
        q = q.eq('category', niche);
      }

      if (query && query.trim().length > 0) {
        q = q.ilike('title', `%${query.trim()}%`);
      }

      // Fetch candidate pool so we can exclude seen reels and ensure a multi-platform mix
      const poolLimit = pageNum === 1 ? 90 : 60;
      const offset = (pageNum - 1) * pageSize;
      const { data, error } = await q
        .order('created_at', { ascending: false })
        .range(offset, offset + poolLimit);

      if (!error && Array.isArray(data) && data.length > 0) {
        // Filter out any excluded/seen videos
        const unseenData = data.filter(v =>
          !excludedSet.has(String(v.id)) &&
          !excludedSet.has(String(v.external_id)) &&
          !excludedSet.has(`${v.source_platform || v.source}:${v.external_id}`)
        );

        // Group by platform to interleave and ensure multi-platform diversity
        const byPlatform = {};
        for (const item of unseenData) {
          const plat = item.source_platform || item.source || 'redgifs';
          if (!byPlatform[plat]) byPlatform[plat] = [];
          byPlatform[plat].push(item);
        }

        // Interleave across platforms (e.g. RedGifs, Pornhub, Eporner)
        const interleaved = [];
        const platKeys = Object.keys(byPlatform);
        let maxLen = Math.max(...platKeys.map(k => byPlatform[k].length), 0);
        for (let i = 0; i < maxLen; i++) {
          for (const k of platKeys) {
            if (byPlatform[k][i]) interleaved.push(byPlatform[k][i]);
          }
        }

        // Shuffle candidate pool on page 1 for fresh discovery
        const candidatePool = pageNum === 1 ? shuffleArray(interleaved) : interleaved;

        reels = candidatePool.slice(0, pageSize).map(v => {
          const platform = v.source_platform || v.source || 'redgifs';
          return {
            id: `db_${v.id}`,
            rawId: v.external_id,
            source: platform,
            source_platform: platform,
            sourceName: platform.toUpperCase(),
            category: v.category || niche,
            is_nsfw: v.is_nsfw !== false,
            author: v.author || `@${platform}`,
            title: v.title || `${platform} reel`,
            videoUrl: v.video_url || v.embed_url,
            sdUrl: v.video_url,
            embedUrl: v.embed_url,
            poster: v.thumbnail_url || v.poster_url,
            thumbnail_url: v.thumbnail_url || v.poster_url,
            hasAudio: true,
            likes: Math.floor(Math.random() * 800) + 120,
            views: Math.floor(Math.random() * 8000) + 500,
            duration: v.duration || 0,
            width: 1080,
            height: 1920,
            isVertical: true,
            tags: v.tags || [],
            type: v.video_url ? 'mp4' : 'embed',
            webUrl: v.canonical_url
          };
        });
      }
    } catch (err) {
      console.warn('[server] Supabase read failed, falling back to live fetch:', err.message);
    }
  }

  // 2. If fewer than 10 category-specific reels from database, supplement with multi-platform live fetch
  if (reels.length < 10) {
    const existingRawIds = new Set(reels.map(r => r.rawId));
    // Use dynamic page offset on page 1 so fresh reels appear on every refresh
    const livePage = pageNum === 1 ? Math.floor(Math.random() * 5) + 1 : pageNum;

    let liveItems = [];
    if (isPornhubNiche) {
      liveItems = await fetchPornhub({ query: query || 'shorties', page: livePage, count: 18 });
      // If Pornhub is geo-blocked or unreachable, gracefully fallback to RedGifs
      if (liveItems.length === 0) {
        liveItems = await fetchRedGifs({ niche: 'amateur-girls', query: query || 'shorts', page: livePage, count: 18 });
      }
    } else {
      liveItems = await fetchMultiPlatformLive({ category: niche, query, page: livePage, count: 20 });
    }

    // Filter out already seen or already selected reels
    const freshLive = liveItems.filter(item =>
      !existingRawIds.has(item.rawId) &&
      !excludedSet.has(item.id) &&
      !excludedSet.has(item.rawId)
    );

    reels = [...reels, ...shuffleArray(freshLive)].slice(0, pageSize);
  }

  // Shuffle slightly or sort by vertical preference
  reels.sort((a, b) => (b.isVertical ? 1 : 0) - (a.isVertical ? 1 : 0));

  res.json({
    success: true,
    page: pageNum,
    count: reels.length,
    reels
  });
});

// API: Discovery Storage Health
app.get('/api/discovery/health', async (req, res) => {
  if (!supabase) {
    return res.json({ success: false, message: 'Supabase not configured' });
  }
  try {
    const { data, error } = await supabase.rpc('get_storage_health');
    if (error) throw error;
    res.json({ success: true, health: data?.[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Recent Discovery Collection Runs
app.get('/api/discovery/runs', async (req, res) => {
  if (!supabase) {
    return res.json({ success: false, message: 'Supabase not configured' });
  }
  try {
    const { data, error } = await supabase
      .from('collection_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    res.json({ success: true, runs: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// API: Bookmarks (Backed by Supabase bookmarks table with local fallback)
app.get('/api/bookmarks', async (req, res) => {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('bookmarks')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        return res.json({ success: true, bookmarks: data.map(b => b.reel_data) });
      }
    } catch (err) {
      console.warn('[server] Supabase bookmarks read error, falling back to local file:', err.message);
    }
  }

  try {
    const raw = fs.readFileSync(bookmarksFile, 'utf8');
    res.json({ success: true, bookmarks: JSON.parse(raw) });
  } catch {
    res.json({ success: true, bookmarks: [] });
  }
});

app.post('/api/bookmarks', async (req, res) => {
  const reel = req.body;
  if (!reel || !reel.id) {
    return res.status(400).json({ success: false, message: 'Invalid reel item' });
  }

  let saved = false;
  let count = 0;

  if (supabase) {
    try {
      const { data: existing } = await supabase
        .from('bookmarks')
        .select('id')
        .eq('id', String(reel.id))
        .maybeSingle();

      if (existing) {
        await supabase.from('bookmarks').delete().eq('id', String(reel.id));
        saved = false;
      } else {
        await supabase.from('bookmarks').upsert([
          { id: String(reel.id), reel_data: reel, updated_at: new Date().toISOString() }
        ]);
        saved = true;
      }

      const { count: total } = await supabase.from('bookmarks').select('*', { count: 'exact', head: true });
      count = total || 0;
      return res.json({ success: true, saved, count });
    } catch (err) {
      console.warn('[server] Supabase bookmarks write error, falling back to local file:', err.message);
    }
  }

  try {
    const raw = fs.readFileSync(bookmarksFile, 'utf8');
    let bookmarks = JSON.parse(raw);

    const existingIndex = bookmarks.findIndex(b => b.id === reel.id);

    if (existingIndex >= 0) {
      bookmarks.splice(existingIndex, 1);
      saved = false;
    } else {
      bookmarks.unshift(reel);
      saved = true;
    }

    fs.writeFileSync(bookmarksFile, JSON.stringify(bookmarks, null, 2));
    res.json({ success: true, saved, count: bookmarks.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Single Page App fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.VERCEL !== '1') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 18gram server running at http://localhost:${PORT}`);
  });
}

export default app;
