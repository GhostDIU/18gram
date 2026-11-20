import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { RedGifsAdapter } from '../src/collector/adapters/redgifs.js';
import { PornhubAdapter } from '../src/collector/adapters/pornhub.js';
import { EpornerAdapter } from '../src/collector/adapters/eporner.js';

describe('Provider Adapters Normalization and Pagination Tests', () => {

  test('RedGifs Adapter: Token acquisition and video normalization', async () => {
    const adapter = new RedGifsAdapter();

    // Mock fetch responses
    adapter.request = async (url) => {
      if (url.includes('/auth/temporary')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ token: 'mock_token_123' })
        };
      }
      if (url.includes('/niches/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            page: 1,
            pages: 10,
            gifs: [
              {
                id: 'sample_gif_1',
                userName: 'creator1',
                description: 'Amazing #vertical clip',
                urls: {
                  hd: 'https://media.redgifs.com/sample_gif_1.mp4',
                  poster: 'https://thumbs.redgifs.com/sample_gif_1.jpg'
                },
                tags: ['tiktok', 'cosplay'],
                duration: 15
              }
            ]
          })
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const res = await adapter.fetchVideos({ cursor: { nicheIndex: 0, page: 1 }, limit: 15 });

    assert.equal(res.items.length, 1);
    const item = res.items[0];
    assert.equal(item.source, 'redgifs');
    assert.equal(item.external_id, 'sample_gif_1');
    assert.equal(item.dedupe_key, 'redgifs:sample_gif_1');
    assert.equal(item.video_url, 'https://media.redgifs.com/sample_gif_1.mp4');
    assert.deepEqual(res.nextCursor, { nicheIndex: 0, page: 2 });
    assert.equal(res.hasMore, true);
  });

  test('Pornhub Adapter: Query rotation and video normalization', async () => {
    const adapter = new PornhubAdapter();

    adapter.request = async (url) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          videos: [
            {
              video_id: 'ph123456',
              title: 'Short Reel Demo',
              url: 'https://www.pornhub.com/view_video.php?viewkey=ph123456',
              default_thumb: 'https://ci.phncdn.com/thumb.jpg',
              duration: 45,
              tags: ['shorties', 'amateur']
            }
          ]
        })
      };
    };

    const res = await adapter.fetchVideos({ cursor: { queryIndex: 0, page: 1 }, limit: 10 });

    assert.equal(res.items.length, 1);
    const item = res.items[0];
    assert.equal(item.source, 'pornhub');
    assert.equal(item.external_id, 'ph123456');
    assert.equal(item.dedupe_key, 'pornhub:ph123456');
    assert.equal(item.embed_url, 'https://www.pornhub.com/embed/ph123456');
    assert.deepEqual(res.nextCursor, { queryIndex: 0, page: 2 });
    assert.equal(res.hasMore, true);
  });

  test('Eporner Adapter: Search and video normalization', async () => {
    const adapter = new EpornerAdapter();

    adapter.request = async (url) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          count: 1,
          total_pages: 5,
          videos: [
            {
              id: 'ep98765',
              title: 'Vertical Quick Clip',
              url: 'https://www.eporner.com/video-ep98765/',
              embed: 'https://www.eporner.com/embed/ep98765/',
              default_thumb: { src: 'https://static.eporner.com/thumb.jpg' },
              keywords: 'vertical, reels, amateur',
              length_sec: 32
            }
          ]
        })
      };
    };

    const res = await adapter.fetchVideos({ cursor: { queryIndex: 0, page: 1 }, limit: 15 });

    assert.equal(res.items.length, 1);
    const item = res.items[0];
    assert.equal(item.source, 'eporner');
    assert.equal(item.external_id, 'ep98765');
    assert.equal(item.dedupe_key, 'eporner:ep98765');
    assert.equal(item.embed_url, 'https://www.eporner.com/embed/ep98765/');
    assert.deepEqual(res.nextCursor, { queryIndex: 0, page: 2 });
    assert.equal(res.hasMore, true);
  });
});
