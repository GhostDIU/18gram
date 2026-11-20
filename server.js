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

// API: Get Curated Categories / Niches
app.get('/api/niches', (req, res) => {
  res.json({ success: true, niches: CURATED_NICHES });
});

// API: Get Reels (Reads from Supabase Discovery Engine when available, with live fallback)
app.get('/api/reels', async (req, res) => {
  const { source = 'all', niche = 'tik-tok', query = '', page = 1 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = 15;

  let reels = [];

  // 1. Try reading from pre-discovered Supabase videos if configured
  if (supabase) {
    try {
      let q = supabase
        .from('videos')
        .select('*')
        .eq('is_available', true)
        .order('discovered_at', { ascending: false });

      if (source !== 'all') {
        q = q.eq('source', source);
      }
      if (query && query.trim().length > 0) {
        q = q.ilike('title', `%${query.trim()}%`);
      }

      const from = (pageNum - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await q.range(from, to);

      if (!error && Array.isArray(data) && data.length > 0) {
        reels = data.map(v => ({
          id: `db_${v.id}`,
          rawId: v.external_id,
          source: v.source,
          sourceName: v.source.toUpperCase(),
          author: v.author || `@${v.source}`,
          title: v.title || `${v.source} reel`,
          videoUrl: v.video_url || v.embed_url,
          sdUrl: v.video_url,
          embedUrl: v.embed_url,
          poster: v.poster_url,
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
        }));
      }
    } catch (err) {
      console.warn('[server] Supabase read failed, falling back to live fetch:', err.message);
    }
  }

  // 2. If no database records found, fallback to live provider fetch
  if (reels.length === 0) {
    if (source === 'pornhub' || niche === 'pornhub') {
      reels = await fetchPornhub({ query, page: pageNum, count: 12 });
    } else if (source === 'redgifs') {
      reels = await fetchRedGifs({ niche, query, page: pageNum, count: 15 });
    } else {
      const redGifsItems = await fetchRedGifs({ niche, query, page: pageNum, count: 15 });
      reels = redGifsItems;

      if (pageNum === 1 && !niche.startsWith('tik-tok') && query) {
        const phItems = await fetchPornhub({ query, page: 1, count: 4 });
        if (phItems.length) {
          reels = [...reels, ...phItems];
        }
      }
    }
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
