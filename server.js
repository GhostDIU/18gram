import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

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

// API: Get Reels
app.get('/api/reels', async (req, res) => {
  const { source = 'all', niche = 'tik-tok', query = '', page = 1 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);

  let reels = [];

  if (source === 'pornhub' || niche === 'pornhub') {
    reels = await fetchPornhub({ query, page: pageNum, count: 12 });
  } else if (source === 'redgifs') {
    reels = await fetchRedGifs({ niche, query, page: pageNum, count: 15 });
  } else {
    // Default 'all': Fetch RedGifs as primary for seamless vertical MP4 reels
    const redGifsItems = await fetchRedGifs({ niche, query, page: pageNum, count: 15 });
    reels = redGifsItems;

    // If on page 1 or query search, optionally include a couple Pornhub shorties at intervals
    if (pageNum === 1 && !niche.startsWith('tik-tok') && query) {
      const phItems = await fetchPornhub({ query, page: 1, count: 4 });
      if (phItems.length) {
        reels = [...reels, ...phItems];
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

// API: Bookmarks
app.get('/api/bookmarks', (req, res) => {
  try {
    const raw = fs.readFileSync(bookmarksFile, 'utf8');
    res.json({ success: true, bookmarks: JSON.parse(raw) });
  } catch {
    res.json({ success: true, bookmarks: [] });
  }
});

app.post('/api/bookmarks', (req, res) => {
  try {
    const reel = req.body;
    if (!reel || !reel.id) {
      return res.status(400).json({ success: false, message: 'Invalid reel item' });
    }
    const raw = fs.readFileSync(bookmarksFile, 'utf8');
    let bookmarks = JSON.parse(raw);

    const existingIndex = bookmarks.findIndex(b => b.id === reel.id);
    let saved = false;

    if (existingIndex >= 0) {
      // Remove if already saved
      bookmarks.splice(existingIndex, 1);
      saved = false;
    } else {
      // Add to front
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔥 18gram server running at http://localhost:${PORT}`);
});
