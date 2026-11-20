# 🔞 18gram - Short-form 18+ Reels App

A lightweight, zero-bloat web application designed for browsing short-form 18+ adult vertical reels in an **Instagram Reels / TikTok** style interface.

---

## ✨ Features

- **📱 Instagram Reels / TikTok UX**:
  - Full-screen vertical swipe feed with smooth CSS scroll-snap.
  - Native HTML5 video player with loop and zero playback latency.
  - **Single tap**: Toggle Play / Pause with animated feedback icon.
  - **Double tap**: Heart explosion animation + like counter increment.
  - **Progress Bar**: Live video playback and buffer indicators.
- **🔄 Multi-Source Aggregator**:
  - **RedGifs**: High-definition, native vertical MP4 short-form clips.
  - **Pornhub**: Curated shorties and embed reels.
  - Auto-retrying token manager with session-consistent headers.
- **🏷️ Categories & Niches**:
  - Filter by curated niches: *TikTok Trends*, *Amateur*, *Cosplay*, *Thick Booty*, *Fit & Athletic*, *Latinas*, *Asian*, *Goth & E-Girl*, and *Pornhub Shorts*.
- **🔍 Search & Discovery**:
  - Search any keyword, creator, or topic.
  - Instant quick-tag selector for trending themes.
- **🔊 Global Audio Control**:
  - Follows browser autoplay standards (starts muted by default).
  - One-tap master sound toggle that persists across reels.
- **⭐ Saved / Favorites**:
  - Bookmark reels to local storage and sync with the backend.
  - Dedicated "Saved" tab to revisit favorite clips.
- **⌨️ Desktop & Mobile Ready**:
  - Full mobile-first responsive layout (fullscreen PWA style on mobile, phone frame on desktop).
  - Keyboard navigation for desktop:
    - <kbd>↓</kbd> / <kbd>j</kbd> : Next reel
    - <kbd>↑</kbd> / <kbd>k</kbd> : Previous reel
    - <kbd>Space</kbd> : Play / Pause
    - <kbd>m</kbd> : Mute / Unmute
    - <kbd>l</kbd> : Like
- **🔞 Age Verification Gate**:
  - Standard 18+ age verification disclaimer modal on first visit.

---

## 🚀 Getting Started

### 1. Requirements
- Node.js (v18+)

### 2. Install Dependencies
```bash
npm install
```

### 3. Run the App
```bash
npm start
```
Or with auto-reload:
```bash
npm run dev
```

Open your browser at **[http://localhost:3000](http://localhost:3000)**.

---

## 🛠️ Tech Stack ("Minimal Code" Architecture)

- **Backend**: Node.js + Express (single-file architecture in `server.js` using native Node `fetch`).
- **Frontend**: Vanilla HTML5 + CSS3 + Modern JavaScript (no bundlers, Webpack, or heavy frameworks required).
- **Icons**: Lucide icons via CDN.

---

## ⚡ High-Throughput Video Discovery Engine

The repository includes an optimized video collection engine designed to discover and store hundreds of unique videos per run while strictly observing GitHub Actions and Supabase Free Tier limits.

### ⏱️ Automated Collection Frequency
Configured in [`.github/workflows/video-collection.yml`](file:///.github/workflows/video-collection.yml):
```yaml
schedule:
  - cron: '7,37 * * * *' # Every 30 minutes (~48 runs/day, ~1,440 runs/month)
runs-on: ubuntu-slim
timeout-minutes: 3
```

### 🎯 Key Features
- **Batch Collection Target**: Collects 200 new unique records per run (configurable up to 300 cap via `TARGET_NEW_LINKS_PER_RUN` and `MAX_NEW_LINKS_PER_RUN`).
- **Deep Pagination & State Checkpoints**: Modular source adapters with persistent cursors stored in `source_cursors`. Commits database batches *before* advancing checkpoints for bulletproof failure recovery.
- **Strict Deduplication & In-Memory Filtering**: In-memory `Set` deduplication paired with PostgreSQL `ON CONFLICT (dedupe_key)` upserts. Preserves original `discovered_at` timestamps on re-discovery while refreshing `last_seen_at`.
- **Runtime Budget Watchdog**: Internal 150-second timer gracefully commits in-flight batches, saves checkpoints, and logs metrics before GitHub Actions hits its 3-minute timeout.
- **Storage Health Protection**: Monitors PostgreSQL database and table size. Triggers 7-day cleanup when DB exceeds 70% (`DB_WARNING_THRESHOLD_PERCENT`), and halts collection when DB exceeds 80% (`DB_CRITICAL_THRESHOLD_PERCENT`) to prevent free tier overages.
- **7-Day Retention Cleanup**: Daily automated pruning of discovery records older than 7 days via Supabase RPC (`cleanup_old_videos(7)`). User bookmarks are stored client-side in IndexedDB and never affected by server cleanups.
- **Adaptive Provider Allocation**: Allocates request quotas based on real-time yields (new unique links per request) while gracefully handling rate limits (HTTP 429) and network timeouts without stalling other sources.

### 🧪 Running Tests
The collection engine features an automated test suite covering pagination, cursor persistence, failure recovery, deduplication, concurrency, rate limiting, budget exhaustion, batch insertion, storage thresholds, and 7-day retention cleanup:
```bash
npm test
```

### 💻 Manual / Local Collection Execution
Run a dry run without committing to the database:
```bash
npm run collect -- --dry-run --target=50
```
Run live collection with configured Supabase credentials:
```bash
npm run collect -- --target=200
```
Run standalone 7-day retention cleanup:
```bash
npm run collect -- --cleanup-only
```

