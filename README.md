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
