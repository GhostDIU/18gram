/**
 * 18gram - Short-form 18+ Reels Aggregator
 * High-performance, multi-screen responsive client
 */

(function () {
  'use strict';

  const SEEN_STORAGE_KEY = '18gram_seen_reels';

  // --- State ---
  const state = {
    currentNiche: 'tik-tok',
    currentQuery: '',
    currentPage: 1,
    isLoading: false,
    hasMore: true,
    isMuted: true,
    viewMode: 'feed', // 'feed' | 'saved'
    savedReels: JSON.parse(localStorage.getItem('18gram_saved_reels') || '[]'),
    likedReels: new Set(JSON.parse(localStorage.getItem('18gram_liked_reels') || '[]')),
    seenReels: new Set(JSON.parse(localStorage.getItem(SEEN_STORAGE_KEY) || '[]')),
    renderedReelIds: new Set(),
    reelsData: [],
    currentVisibleIndex: -1,
    nichesList: [],
  };

  // --- Watched / Seen History Tracking ---
  function markReelAsSeen(reel) {
    if (!reel) return;
    const id = String(reel.id || '');
    const rawId = String(reel.rawId || '');
    let updated = false;

    if (id && !state.seenReels.has(id)) {
      state.seenReels.add(id);
      updated = true;
    }
    if (rawId && !state.seenReels.has(rawId)) {
      state.seenReels.add(rawId);
      updated = true;
    }

    if (updated) {
      if (state.seenReels.size > 2500) {
        const arr = Array.from(state.seenReels);
        state.seenReels = new Set(arr.slice(arr.length - 2000));
      }
      try {
        localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(Array.from(state.seenReels)));
      } catch (e) {}
    }
  }

  // --- DOM Elements ---
  const ageGateModal = document.getElementById('age-gate');
  const btnEnterAge = document.getElementById('btn-enter-age');
  const btnExitAge = document.getElementById('btn-exit-age');

  // Search
  const searchModal = document.getElementById('search-modal');
  const btnSearchOpen = document.getElementById('btn-search');
  const btnSearchClose = document.getElementById('btn-close-search');
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  const desktopSearchForm = document.getElementById('desktop-search-form');
  const desktopSearchInput = document.getElementById('desktop-search-input');

  // Audio Toggles
  const btnSoundToggle = document.getElementById('btn-sound-toggle');
  const soundIcon = document.getElementById('sound-icon');
  const sidebarSoundBtn = document.getElementById('sidebar-sound-btn');
  const sidebarSoundIcon = document.getElementById('sidebar-sound-icon');
  const sidebarSoundStatus = document.getElementById('sidebar-sound-status');

  // Bookmarks / Tabs
  const btnBookmarksTab = document.getElementById('btn-bookmarks-tab');
  const sidebarSavedCount = document.getElementById('sidebar-saved-count');

  // Category Pills & Scroll Arrows
  const categoryPillsContainer = document.getElementById('category-pills');
  const btnPillScrollLeft = document.getElementById('btn-pill-scroll-left');
  const btnPillScrollRight = document.getElementById('btn-pill-scroll-right');

  // Desktop Sidebar
  const sidebarNichesContainer = document.getElementById('sidebar-niches');
  const navForYou = document.getElementById('nav-for-you');
  const navPornhub = document.getElementById('nav-pornhub');
  const navSaved = document.getElementById('nav-saved');

  // Desktop Right Side Panel
  const ambientPlayerGlow = document.getElementById('ambient-player-glow');
  const nowPlayingAvatar = document.getElementById('now-playing-avatar');
  const nowPlayingUsername = document.getElementById('now-playing-username');
  const nowPlayingBadge = document.getElementById('now-playing-badge');
  const nowPlayingCaption = document.getElementById('now-playing-caption');
  const nowPlayingTags = document.getElementById('now-playing-tags');
  const btnSideCopy = document.getElementById('btn-side-copy');
  const btnSideOpen = document.getElementById('btn-side-open');
  const upNextList = document.getElementById('up-next-list');

  // Filter Banner
  const filterBanner = document.getElementById('filter-banner');
  const filterBannerText = document.getElementById('filter-banner-text');
  const btnClearFilter = document.getElementById('btn-clear-filter');

  // Container & Toast
  const reelsContainer = document.getElementById('reels-container');
  const toastEl = document.getElementById('toast');

  // --- Initialize Lucide Icons Helper ---
  function refreshIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // --- Toast Notification ---
  let toastTimer = null;
  function showToast(message) {
    if (toastTimer) clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    toastTimer = setTimeout(() => {
      toastEl.classList.add('hidden');
    }, 2200);
  }

  // --- Age Gate Handler ---
  function initAgeGate() {
    const isVerified = localStorage.getItem('18gram_age_verified');
    if (isVerified === 'true') {
      ageGateModal.classList.add('hidden');
      initApp();
    } else {
      btnEnterAge.addEventListener('click', () => {
        localStorage.setItem('18gram_age_verified', 'true');
        ageGateModal.classList.add('hidden');
        initApp();
      });
      btnExitAge.addEventListener('click', () => {
        window.location.href = 'https://www.google.com';
      });
    }
  }

  // --- Category / Niches Loading & Horizontal Scroll Controls ---
  async function loadCategories() {
    try {
      const res = await fetch('/api/niches');
      const data = await res.json();
      if (!data.success) return;

      state.nichesList = data.niches;

      // 1. Render Top Pills
      categoryPillsContainer.innerHTML = '';
      data.niches.forEach(niche => {
        const pill = document.createElement('button');
        pill.className = `pill-item ${niche.id === state.currentNiche ? 'active' : ''}`;
        pill.dataset.niche = niche.id;
        pill.innerHTML = `<span>${niche.icon}</span> <span>${niche.name}</span>`;
        pill.addEventListener('click', () => selectNiche(niche.id));
        categoryPillsContainer.appendChild(pill);
      });

      // 2. Render Sidebar Niches for Desktop
      if (sidebarNichesContainer) {
        sidebarNichesContainer.innerHTML = '';
        data.niches.forEach(niche => {
          const btn = document.createElement('button');
          btn.className = `sidebar-niche-btn ${niche.id === state.currentNiche ? 'active' : ''}`;
          btn.dataset.niche = niche.id;
          btn.innerHTML = `
            <div class="sidebar-niche-left">
              <span>${niche.icon}</span>
              <span>${niche.name}</span>
            </div>
            <span class="sidebar-niche-count">${niche.count}</span>
          `;
          btn.addEventListener('click', () => selectNiche(niche.id));
          sidebarNichesContainer.appendChild(btn);
        });
      }

      updateSavedCounts();
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  }

  // Horizontal Scroll Handler for Top Pills
  function initPillScrollControls() {
    // Left / Right Click Arrows
    if (btnPillScrollLeft) {
      btnPillScrollLeft.addEventListener('click', (e) => {
        e.stopPropagation();
        categoryPillsContainer.scrollBy({ left: -180, behavior: 'smooth' });
      });
    }

    if (btnPillScrollRight) {
      btnPillScrollRight.addEventListener('click', (e) => {
        e.stopPropagation();
        categoryPillsContainer.scrollBy({ left: 180, behavior: 'smooth' });
      });
    }

    // Mouse Wheel on Pills (maps vertical delta to horizontal scroll)
    categoryPillsContainer.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        categoryPillsContainer.scrollLeft += e.deltaY * 0.9;
      }
    }, { passive: false });

    // Drag-to-Scroll on Desktop
    let isDown = false;
    let startX = 0;
    let scrollStart = 0;

    categoryPillsContainer.addEventListener('mousedown', (e) => {
      isDown = true;
      categoryPillsContainer.classList.add('dragging');
      startX = e.pageX - categoryPillsContainer.offsetLeft;
      scrollStart = categoryPillsContainer.scrollLeft;
    });

    categoryPillsContainer.addEventListener('mouseleave', () => {
      isDown = false;
      categoryPillsContainer.classList.remove('dragging');
    });

    categoryPillsContainer.addEventListener('mouseup', () => {
      isDown = false;
      categoryPillsContainer.classList.remove('dragging');
    });

    categoryPillsContainer.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - categoryPillsContainer.offsetLeft;
      const walk = (x - startX) * 1.5;
      categoryPillsContainer.scrollLeft = scrollStart - walk;
    });
  }

  function selectNiche(nicheId) {
    if (state.currentNiche === nicheId && !state.currentQuery && state.viewMode === 'feed') {
      if (reelsContainer) reelsContainer.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Stop any playing video from previous category
    document.querySelectorAll('video').forEach(v => {
      try { v.pause(); v.src = ''; } catch (e) {}
    });

    state.currentNiche = nicheId;
    state.currentQuery = '';
    state.currentPage = 1;
    state.hasMore = true;
    state.viewMode = 'feed';
    state.reelsData = [];
    state.renderedReelIds.clear();
    state.currentVisibleIndex = -1;

    // Sync Top Pills UI
    document.querySelectorAll('.pill-item').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.niche === nicheId);
    });

    // Sync Sidebar Niches UI
    document.querySelectorAll('.sidebar-niche-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.niche === nicheId);
    });

    // Sync Sidebar Nav
    if (navForYou) navForYou.classList.toggle('active', nicheId !== 'pornhub');
    if (navPornhub) navPornhub.classList.toggle('active', nicheId === 'pornhub');
    if (navSaved) navSaved.classList.remove('active');
    btnBookmarksTab.classList.remove('active');

    hideFilterBanner();

    // Reset scroll position immediately
    if (reelsContainer) {
      reelsContainer.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });

    loadFeed(true);
  }

  // --- Fetch & Render Reels Feed ---
  async function loadFeed(reset = false) {
    if (state.isLoading) return;
    state.isLoading = true;

    if (reset) {
      state.currentPage = 1;
      state.reelsData = [];
      state.renderedReelIds.clear();
      state.hasMore = true;
      state.currentVisibleIndex = -1;
      if (reelsContainer) {
        reelsContainer.scrollTop = 0;
      }
      reelsContainer.innerHTML = `
        <div class="loader-container">
          <div class="spinner"></div>
          <p>Fetching fresh 18+ Reels...</p>
        </div>
      `;
    }

    try {
      const params = new URLSearchParams({
        page: state.currentPage,
        niche: state.currentNiche,
        _t: Date.now() // Prevent browser/edge caching
      });
      if (state.currentQuery) {
        params.append('query', state.currentQuery);
      }

      // Send recent seen IDs to server to exclude upfront
      const recentSeen = Array.from(state.seenReels).slice(-100);
      if (recentSeen.length > 0) {
        params.append('exclude', recentSeen.join(','));
      }

      const res = await fetch(`/api/reels?${params.toString()}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store',
          'Pragma': 'no-cache'
        }
      });
      const data = await res.json();

      if (reset) {
        reelsContainer.innerHTML = '';
        if (reelsContainer) {
          reelsContainer.scrollTop = 0;
        }
      }

      const incoming = data.reels || [];

      // Client-side strict deduplication & seen exclusion
      const freshReels = incoming.filter(reel => {
        if (!reel || !reel.id) return false;
        const id = String(reel.id);
        const rawId = String(reel.rawId || '');

        if (state.renderedReelIds.has(id) || (rawId && state.renderedReelIds.has(rawId))) {
          return false;
        }

        if (state.seenReels.has(id) || (rawId && state.seenReels.has(rawId))) {
          return false;
        }

        return true;
      });

      // Handle exhaustion: if zero unseen reels returned
      if (freshReels.length === 0) {
        // If on initial reset or infinite scroll, try fetching next page if under page 5
        if (incoming.length > 0 && state.currentPage < 5) {
          state.currentPage++;
          state.isLoading = false;
          return loadFeed(reset);
        }

        // If the user has truly watched everything available across this feed:
        if (state.reelsData.length === 0 && state.seenReels.size > 0 && reset) {
          console.log('[feed] All available reels watched. Gracefully resetting seen history and reshuffling...');
          state.seenReels.clear();
          try {
            localStorage.removeItem(SEEN_STORAGE_KEY);
          } catch (e) {}
          state.isLoading = false;
          return loadFeed(true);
        }

        // If on infinite scroll (page > 1) and this page was all seen, auto-fetch next page
        if (incoming.length > 0 && state.currentPage < 12) {
          state.currentPage++;
          state.isLoading = false;
          return loadFeed(false);
        }

        if (state.currentPage === 1 && state.reelsData.length === 0) {
          reelsContainer.innerHTML = `
            <div class="empty-container">
              <i data-lucide="video-off" style="width:48px;height:48px;opacity:0.6;"></i>
              <p>No new reels found for this topic.</p>
              <button class="btn-primary" style="margin-top:12px;padding:8px 18px;" onclick="window.resetSeenAndReload()">Reset Watch History</button>
            </div>
          `;
          refreshIcons();
        }

        state.hasMore = false;
        state.isLoading = false;
        return;
      }

      const startIndex = state.reelsData.length;
      for (const reel of freshReels) {
        const id = String(reel.id);
        const rawId = String(reel.rawId || '');
        state.renderedReelIds.add(id);
        if (rawId) state.renderedReelIds.add(rawId);
        state.reelsData.push(reel);
      }

      freshReels.forEach((reel, i) => {
        const itemEl = createReelElement(reel, startIndex + i);
        reelsContainer.appendChild(itemEl);
      });

      refreshIcons();
      setupIntersectionObserver();

      // Mark the first visible reel as watched immediately on initial load
      if (reset && state.reelsData.length > 0) {
        markReelAsSeen(state.reelsData[0]);
      }

      state.currentPage++;
    } catch (err) {
      console.error('Error fetching reels:', err);
      if (reset) {
        reelsContainer.innerHTML = `
          <div class="empty-container">
            <p>Failed to load reels. Please check your connection.</p>
            <button class="btn-primary" onclick="window.reloadCurrentFeed()">Retry</button>
          </div>
        `;
      }
    } finally {
      state.isLoading = false;
    }
  }

  // Window helpers for error retry & watch history reset
  window.resetToTrending = () => selectNiche('tik-tok');
  window.reloadCurrentFeed = () => loadFeed(true);
  window.resetSeenAndReload = () => {
    state.seenReels.clear();
    try {
      localStorage.removeItem(SEEN_STORAGE_KEY);
    } catch (e) {}
    loadFeed(true);
  };

  // Helper to resolve platform branding
  function getPlatformInfo(source) {
    const s = String(source || '').toLowerCase();
    if (s.includes('pornhub')) {
      return { id: 'pornhub', name: 'Pornhub', badgeClass: 'badge-pornhub', icon: '🔞' };
    } else if (s.includes('eporner')) {
      return { id: 'eporner', name: 'Eporner', badgeClass: 'badge-eporner', icon: '⚡' };
    } else if (s.includes('xhamster')) {
      return { id: 'xhamster', name: 'xHamster', badgeClass: 'badge-xhamster', icon: '🐹' };
    } else if (s.includes('xvideos')) {
      return { id: 'xvideos', name: 'XVideos', badgeClass: 'badge-xvideos', icon: '🎬' };
    } else {
      return { id: 'redgifs', name: 'RedGifs', badgeClass: 'badge-redgifs', icon: '🔥' };
    }
  }

  // --- Create Single Reel Item Element ---
  function createReelElement(reel, index) {
    const isLiked = state.likedReels.has(reel.id);
    const isSaved = state.savedReels.some(r => r.id === reel.id);

    const el = document.createElement('div');
    el.className = 'reel-item';
    el.id = `reel-item-${index}`;
    el.dataset.index = index;

    const platform = getPlatformInfo(reel.source_platform || reel.source);
    const sourceBadgeClass = platform.badgeClass;
    const sourceLabel = platform.name;

    // Format tags
    const tagsHtml = (reel.tags || [])
      .slice(0, 4)
      .map(tag => `<span class="tag-chip" onclick="window.searchByTag('${encodeURIComponent(tag)}')">#${tag.replace(/\s+/g, '')}</span>`)
      .join(' ');

    el.innerHTML = `
      <!-- Ambient Blurred Background (Eliminates Empty Space) -->
      <div class="reel-ambient-bg" style="background-image: url('${reel.poster || reel.thumbnail_url || ''}');"></div>

      <!-- Main Video Container -->
      <div class="reel-video-wrapper">
        ${
          reel.type === 'embed'
            ? `<div class="iframe-wrapper">
                <iframe class="reel-iframe" src="${reel.videoUrl}" allowfullscreen allow="autoplay; encrypted-media"></iframe>
                <div class="iframe-touch-layer" title="Swipe to scroll"></div>
              </div>`
            : `<video class="reel-video" 
                playsinline 
                loop 
                preload="${index < 2 ? 'auto' : 'none'}" 
                poster="${reel.poster || reel.thumbnail_url || ''}"
                src="${reel.videoUrl}">
              </video>`
        }
        <div class="video-tap-indicator"><i data-lucide="play"></i></div>
      </div>

      <!-- Right Floating Actions Column (Positioned to Never be Hidden on Mobile) -->
      <div class="reel-actions-column">
        <!-- Like Button -->
        <div class="action-btn-wrap">
          <button class="action-btn btn-like ${isLiked ? 'liked' : ''}" title="Like">
            <i data-lucide="heart"></i>
          </button>
          <span class="action-count count-likes">${formatCount(reel.likes + (isLiked ? 1 : 0))}</span>
        </div>

        <!-- Bookmark / Save Button -->
        <div class="action-btn-wrap">
          <button class="action-btn btn-bookmark ${isSaved ? 'bookmarked' : ''}" title="Save">
            <i data-lucide="bookmark"></i>
          </button>
          <span class="action-count">Save</span>
        </div>

        <!-- Share Button -->
        <div class="action-btn-wrap">
          <button class="action-btn btn-share" title="Share Reel">
            <i data-lucide="share-2"></i>
          </button>
          <span class="action-count">Share</span>
        </div>

        <!-- External Source Web Link -->
        <div class="action-btn-wrap">
          <a href="${reel.webUrl}" target="_blank" rel="noopener noreferrer" class="action-btn btn-source" title="View on ${sourceLabel}">
            <i data-lucide="external-link"></i>
          </a>
          <span class="action-count">${sourceLabel}</span>
        </div>
      </div>

      <!-- Bottom Info Overlay (Safe area padded) -->
      <div class="reel-info-overlay">
        <div class="creator-row">
          <div class="creator-avatar">${reel.author.replace('@', '').charAt(0).toUpperCase()}</div>
          <span class="creator-username">${reel.author}</span>
          <span class="source-badge ${sourceBadgeClass}">${platform.name}</span>
        </div>

        <div class="caption-text">${escapeHtml(reel.title)}</div>
        <div class="tags-row">${tagsHtml}</div>
      </div>

      <!-- Video Progress Bar -->
      <div class="progress-bar-container">
        <div class="progress-bar-fill"></div>
      </div>
    `;

    bindReelEvents(el, reel, index);
    return el;
  }

  // Tag click helper
  window.searchByTag = (tag) => {
    executeSearch(decodeURIComponent(tag));
  };

  // --- Reel Interactions (Tap, Double Tap, Actions) ---
  function bindReelEvents(el, reel, index) {
    const videoWrapper = el.querySelector('.reel-video-wrapper');
    const video = el.querySelector('video');
    const tapIndicator = el.querySelector('.video-tap-indicator');
    const progressBarFill = el.querySelector('.progress-bar-fill');

    const btnLike = el.querySelector('.btn-like');
    const countLikes = el.querySelector('.count-likes');
    const btnBookmark = el.querySelector('.btn-bookmark');
    const btnShare = el.querySelector('.btn-share');

    // Smooth vertical swipe gesture support across iframes
    const iframeTouchLayer = el.querySelector('.iframe-touch-layer');
    if (iframeTouchLayer) {
      let touchStartY = 0;
      iframeTouchLayer.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
      }, { passive: true });

      iframeTouchLayer.addEventListener('touchmove', (e) => {
        const currentY = e.touches[0].clientY;
        const deltaY = currentY - touchStartY;
        if (Math.abs(deltaY) > 8 && reelsContainer) {
          reelsContainer.scrollTop -= deltaY * 0.5;
        }
      }, { passive: true });
    }

    // Progress Bar Listener
    if (video) {
      video.addEventListener('timeupdate', () => {
        if (video.duration) {
          const pct = (video.currentTime / video.duration) * 100;
          progressBarFill.style.width = `${pct}%`;
        }
      });
    }

    // Tap & Double Tap Logic
    let lastTapTime = 0;
    let singleTapTimeout = null;

    videoWrapper.addEventListener('click', (e) => {
      if (e.target.closest('.reel-actions-column') || e.target.closest('.tag-chip')) return;

      const currentTime = Date.now();
      const tapInterval = currentTime - lastTapTime;

      if (tapInterval < 280 && tapInterval > 0) {
        if (singleTapTimeout) clearTimeout(singleTapTimeout);
        triggerDoubleTapLike(el, reel, btnLike, countLikes, e);
      } else {
        singleTapTimeout = setTimeout(() => {
          if (video) {
            toggleVideoPlayPause(video, tapIndicator);
          }
        }, 280);
      }
      lastTapTime = currentTime;
    });

    // Like Button
    btnLike.addEventListener('click', () => {
      toggleLike(reel, btnLike, countLikes);
    });

    // Bookmark Button
    btnBookmark.addEventListener('click', () => {
      toggleBookmark(reel, btnBookmark);
    });

    // Share Button
    btnShare.addEventListener('click', async () => {
      const shareUrl = reel.webUrl || window.location.href;
      if (navigator.share) {
        try {
          await navigator.share({
            title: `18gram - ${reel.title}`,
            url: shareUrl,
          });
        } catch {
          copyToClipboard(shareUrl);
        }
      } else {
        copyToClipboard(shareUrl);
      }
    });
  }

  // --- Video Controls ---
  function toggleVideoPlayPause(video, tapIndicator) {
    if (video.paused) {
      video.play().then(() => {
        showTapIndicator(tapIndicator, 'play');
      }).catch(err => console.log('Autoplay prevent:', err));
    } else {
      video.pause();
      showTapIndicator(tapIndicator, 'pause');
    }
  }

  function showTapIndicator(indicator, type) {
    indicator.innerHTML = `<i data-lucide="${type}"></i>`;
    refreshIcons();
    indicator.classList.add('active');
    setTimeout(() => {
      indicator.classList.remove('active');
    }, 550);
  }

  // --- Like & Double Tap Effects ---
  function triggerDoubleTapLike(el, reel, btnLike, countLikes, event) {
    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const heartBurst = document.createElement('div');
    heartBurst.className = 'heart-burst';
    heartBurst.style.left = `${x}px`;
    heartBurst.style.top = `${y}px`;
    heartBurst.innerHTML = `<i data-lucide="heart" fill="#ff2d55"></i>`;
    el.appendChild(heartBurst);
    refreshIcons();

    setTimeout(() => heartBurst.remove(), 900);

    if (!state.likedReels.has(reel.id)) {
      toggleLike(reel, btnLike, countLikes);
    }
  }

  function toggleLike(reel, btnLike, countLikes) {
    const isLiked = state.likedReels.has(reel.id);
    if (isLiked) {
      state.likedReels.delete(reel.id);
      btnLike.classList.remove('liked');
      countLikes.textContent = formatCount(reel.likes);
    } else {
      state.likedReels.add(reel.id);
      btnLike.classList.add('liked');
      countLikes.textContent = formatCount(reel.likes + 1);
    }
    localStorage.setItem('18gram_liked_reels', JSON.stringify([...state.likedReels]));
  }

  // --- Bookmarks Handling ---
  async function toggleBookmark(reel, btnBookmark) {
    const index = state.savedReels.findIndex(r => r.id === reel.id);

    if (index >= 0) {
      state.savedReels.splice(index, 1);
      btnBookmark.classList.remove('bookmarked');
      showToast('Removed from Saved');
    } else {
      state.savedReels.unshift(reel);
      btnBookmark.classList.add('bookmarked');
      showToast('Saved to your collection ❤️');
    }

    localStorage.setItem('18gram_saved_reels', JSON.stringify(state.savedReels));
    if (window.BookmarkDB) {
      window.BookmarkDB.toggle(reel).catch(() => {});
    }
    updateSavedCounts();

    try {
      fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reel)
      }).catch(() => {});
    } catch {}

    if (state.viewMode === 'saved') {
      renderSavedTab();
    }
  }

  function updateSavedCounts() {
    const count = state.savedReels.length;
    if (sidebarSavedCount) sidebarSavedCount.textContent = count;
  }

  // --- Intersection Observer (Autoplay + Now Playing Panel + Preload) ---
  let intersectionObserver = null;
  function setupIntersectionObserver() {
    if (intersectionObserver) intersectionObserver.disconnect();

    const options = {
      root: reelsContainer,
      threshold: 0.65,
    };

    intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const itemEl = entry.target;
        const index = parseInt(itemEl.dataset.index, 10);
        const video = itemEl.querySelector('video');
        const reel = state.reelsData[index];

        if (entry.isIntersecting) {
          state.currentVisibleIndex = index;

          // Track watched/seen reel immediately
          if (reel) {
            markReelAsSeen(reel);
            updateNowPlaying(reel, index);
          }

          if (video) {
            video.muted = state.isMuted;
            video.play().catch(err => console.log('Playback error:', err));
          }

          // Preload next video in advance
          const nextItem = document.getElementById(`reel-item-${index + 1}`);
          if (nextItem) {
            const nextVideo = nextItem.querySelector('video');
            if (nextVideo && nextVideo.preload === 'none') {
              nextVideo.preload = 'auto';
            }
          }

          // Infinite Scroll trigger
          if (state.hasMore && index >= state.reelsData.length - 2 && !state.isLoading && state.viewMode === 'feed') {
            loadFeed(false);
          }
        } else {
          if (video && !video.paused) {
            video.pause();
          }
        }
      });
    }, options);

    document.querySelectorAll('.reel-item').forEach((item) => {
      intersectionObserver.observe(item);
    });
  }

  // --- Update Desktop "Now Playing" and "Up Next" Panel ---
  function updateNowPlaying(reel, index) {
    // 1. Ambient Glow behind player
    if (ambientPlayerGlow && reel.poster) {
      ambientPlayerGlow.style.backgroundImage = `url('${reel.poster}')`;
    }

    // 2. Now Playing Card
    if (nowPlayingUsername) {
      nowPlayingAvatar.textContent = reel.author.replace('@', '').charAt(0).toUpperCase();
      nowPlayingUsername.textContent = reel.author;
      const platform = getPlatformInfo(reel.source_platform || reel.source);
      nowPlayingBadge.className = `source-badge ${platform.badgeClass}`;
      nowPlayingBadge.textContent = platform.name;
      nowPlayingCaption.textContent = reel.title;

      nowPlayingTags.innerHTML = (reel.tags || [])
        .slice(0, 5)
        .map(t => `<span class="tag-chip" onclick="window.searchByTag('${encodeURIComponent(t)}')">#${t.replace(/\s+/g, '')}</span>`)
        .join(' ');

      btnSideCopy.onclick = () => copyToClipboard(reel.webUrl || window.location.href);
      btnSideOpen.href = reel.webUrl || '#';
    }

    // 3. Up Next Queue Card
    renderUpNextQueue(index);
  }

  function renderUpNextQueue(currentIndex) {
    if (!upNextList) return;
    const upcoming = state.reelsData.slice(currentIndex + 1, currentIndex + 5);

    if (upcoming.length === 0) {
      upNextList.innerHTML = `<div class="empty-queue-hint">End of feed or loading more...</div>`;
      return;
    }

    upNextList.innerHTML = '';
    upcoming.forEach((r, i) => {
      const targetIndex = currentIndex + 1 + i;
      const card = document.createElement('div');
      card.className = 'up-next-item';
      card.innerHTML = `
        <img class="up-next-thumb" src="${r.poster || ''}" alt="thumb" loading="lazy">
        <div class="up-next-details">
          <span class="up-next-creator">${r.author}</span>
          <span class="up-next-caption">${escapeHtml(r.title)}</span>
        </div>
      `;
      card.addEventListener('click', () => {
        scrollToReel(targetIndex);
      });
      upNextList.appendChild(card);
    });
  }

  // --- Sound Toggle (Syncs Mobile & Desktop Sidebar) ---
  function initSoundToggle() {
    function toggleAudio() {
      state.isMuted = !state.isMuted;
      updateAudioUI();

      // Apply to all videos
      document.querySelectorAll('video').forEach((v) => {
        v.muted = state.isMuted;
      });

      showToast(state.isMuted ? 'Audio muted' : 'Audio unmuted 🔊');
    }

    btnSoundToggle.addEventListener('click', toggleAudio);
    if (sidebarSoundBtn) sidebarSoundBtn.addEventListener('click', toggleAudio);
  }

  function updateAudioUI() {
    const iconName = state.isMuted ? 'volume-x' : 'volume-2';
    if (soundIcon) soundIcon.setAttribute('data-lucide', iconName);
    if (sidebarSoundIcon) sidebarSoundIcon.setAttribute('data-lucide', iconName);
    if (sidebarSoundStatus) sidebarSoundStatus.textContent = state.isMuted ? 'Muted' : 'Unmuted 🔊';
    refreshIcons();
  }

  // --- Saved / Bookmarks Tab View ---
  function initBookmarksTab() {
    function openSaved() {
      if (state.viewMode === 'saved') {
        selectNiche(state.currentNiche);
      } else {
        state.viewMode = 'saved';
        btnBookmarksTab.classList.add('active');
        if (navSaved) navSaved.classList.add('active');
        if (navForYou) navForYou.classList.remove('active');
        if (navPornhub) navPornhub.classList.remove('active');
        document.querySelectorAll('.pill-item').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.sidebar-niche-btn').forEach(b => b.classList.remove('active'));
        showFilterBanner(`Saved Reels (${state.savedReels.length})`);
        renderSavedTab();
      }
    }

    btnBookmarksTab.addEventListener('click', openSaved);
    if (navSaved) navSaved.addEventListener('click', openSaved);
  }

  function renderSavedTab() {
    reelsContainer.innerHTML = '';
    if (state.savedReels.length === 0) {
      reelsContainer.innerHTML = `
        <div class="empty-container">
          <i data-lucide="bookmark" style="width:48px;height:48px;opacity:0.5;"></i>
          <p>No saved reels yet.</p>
          <span style="font-size:0.8rem;color:#888;">Tap the bookmark icon on any reel to save it here.</span>
        </div>
      `;
      refreshIcons();
      return;
    }

    state.savedReels.forEach((reel, i) => {
      const el = createReelElement(reel, i);
      reelsContainer.appendChild(el);
    });

    refreshIcons();
    setupIntersectionObserver();
  }

  // --- Search Handling (Mobile Modal + Desktop Sidebar Input) ---
  function initSearch() {
    btnSearchOpen.addEventListener('click', () => {
      searchModal.classList.remove('hidden');
      searchInput.focus();
    });

    btnSearchClose.addEventListener('click', () => {
      searchModal.classList.add('hidden');
    });

    searchModal.addEventListener('click', (e) => {
      if (e.target === searchModal) {
        searchModal.classList.add('hidden');
      }
    });

    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = searchInput.value.trim();
      if (query) executeSearch(query);
    });

    if (desktopSearchForm) {
      desktopSearchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = desktopSearchInput.value.trim();
        if (query) executeSearch(query);
      });
    }

    document.querySelectorAll('.quick-tag').forEach(tagBtn => {
      tagBtn.addEventListener('click', () => {
        const tag = tagBtn.dataset.tag;
        executeSearch(tag);
      });
    });

    btnClearFilter.addEventListener('click', () => {
      selectNiche('tik-tok');
    });

    // Sidebar Nav links
    if (navForYou) {
      navForYou.addEventListener('click', () => selectNiche('tik-tok'));
    }
    if (navPornhub) {
      navPornhub.addEventListener('click', () => selectNiche('pornhub'));
    }
  }

  function executeSearch(query) {
    searchModal.classList.add('hidden');
    state.currentQuery = query;
    state.currentPage = 1;
    state.hasMore = true;
    state.viewMode = 'feed';
    state.reelsData = [];
    state.renderedReelIds.clear();
    state.currentVisibleIndex = -1;

    // Clear active category highlights
    document.querySelectorAll('.pill-item').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sidebar-niche-btn').forEach(b => b.classList.remove('active'));
    btnBookmarksTab.classList.remove('active');
    if (navSaved) navSaved.classList.remove('active');

    if (reelsContainer) {
      reelsContainer.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });

    showFilterBanner(`Search: "${query}"`);
    loadFeed(true);
  }

  function showFilterBanner(text) {
    filterBannerText.textContent = text;
    filterBanner.classList.remove('hidden');
  }

  function hideFilterBanner() {
    filterBanner.classList.add('hidden');
  }

  // --- Keyboard Navigation ---
  function initKeyboardControls() {
    window.addEventListener('keydown', (e) => {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

      const currentIndex = state.currentVisibleIndex >= 0 ? state.currentVisibleIndex : 0;

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        scrollToReel(currentIndex + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        scrollToReel(currentIndex - 1);
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        const currentItem = document.getElementById(`reel-item-${currentIndex}`);
        if (currentItem) {
          const video = currentItem.querySelector('video');
          const indicator = currentItem.querySelector('.video-tap-indicator');
          if (video) toggleVideoPlayPause(video, indicator);
        }
      } else if (e.key === 'm' || e.key === 'M') {
        btnSoundToggle.click();
      } else if (e.key === 'l' || e.key === 'L') {
        const currentItem = document.getElementById(`reel-item-${currentIndex}`);
        if (currentItem) {
          const btnLike = currentItem.querySelector('.btn-like');
          if (btnLike) btnLike.click();
        }
      }
    });
  }

  function scrollToReel(index) {
    const targetItem = document.getElementById(`reel-item-${index}`);
    if (targetItem) {
      targetItem.scrollIntoView({ behavior: 'smooth' });
    }
  }

  // --- Utility Functions ---
  function formatCount(num) {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return String(num);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Link copied to clipboard! 📋');
    }).catch(() => {
      showToast('Could not copy link');
    });
  }

  // --- Main App Initialization ---
  function initApp() {
    if (window.BookmarkDB) {
      window.BookmarkDB.getAll().then(saved => {
        if (saved && saved.length > 0) {
          state.savedReels = saved;
          updateSavedCounts();
        }
      }).catch(() => {});
    }
    loadCategories();
    initPillScrollControls();
    loadFeed(true);
    initSoundToggle();
    initBookmarksTab();
    initSearch();
    initKeyboardControls();
  }

  // Boot
  document.addEventListener('DOMContentLoaded', () => {
    initAgeGate();
  });
})();
