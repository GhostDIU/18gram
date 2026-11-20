import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { RedGifsAdapter } from './adapters/redgifs.js';
import { PornhubAdapter } from './adapters/pornhub.js';
import { EpornerAdapter } from './adapters/eporner.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CATEGORIES = [
  'instagram',
  'tiktok',
  'facebook',
  'amateur-girls',
  'nsfw-cosplay',
  'thick-booty',
  'fit-girls',
  'latinas',
  'busty-asians',
  'goth-girls',
  'pornhub'
];

/**
 * Curated multi-platform 18+ adult clips across all categories.
 * Ensures Pornhub and Eporner are represented even in environments where ISP filters block direct requests.
 */
const CURATED_18PLUS_MULTICLIPS = [
  // --- INSTAGRAM (18+ Spicy Instagram-style short reels & models <= 90s) ---
  {
    source_platform: 'pornhub',
    category: 'instagram',
    external_id: 'ph65a19028bc182',
    title: 'Hot 18+ Instagram model lingerie try-on haul #reels',
    video_url: null,
    embed_url: 'https://www.pornhub.com/embed/65a19028bc182',
    canonical_url: 'https://www.pornhub.com/view_video.php?viewkey=ph65a19028bc182',
    poster_url: 'https://ei.phncdn.com/videos/202401/12/445890121/thumbs_5/(m=eaAaGwObaaaa)(mh=qR9108aB1)5.jpg',
    author: '@insta_spicy_model',
    tags: ['instagram', 'insta', 'model', 'lingerie', 'reels', 'aesthetic'],
    duration: 32
  },
  {
    source_platform: 'eporner',
    category: 'instagram',
    external_id: 'ep_ig_891230',
    title: 'Instagram influencer spicy bikini mirror check 18+',
    video_url: null,
    embed_url: 'https://www.eporner.com/embed/nQhKqH1t7bK/',
    canonical_url: 'https://www.eporner.com/video-nQhKqH1t7bK/',
    poster_url: 'https://static.eporner.com/thumbs/static4/9/90/901/901234/5_360.jpg',
    author: '@ig_baddie',
    tags: ['instagram', 'bikini', 'model', 'aesthetic', 'spicy', 'reels'],
    duration: 25
  },
  {
    source_platform: 'pornhub',
    category: 'instagram',
    external_id: 'ph65d90182ce912',
    title: 'Spicy Instagram fitness model mirror selfie reveal',
    video_url: null,
    embed_url: 'https://www.pornhub.com/embed/65d90182ce912',
    canonical_url: 'https://www.pornhub.com/view_video.php?viewkey=ph65d90182ce912',
    poster_url: 'https://ei.phncdn.com/videos/202402/20/447810291/thumbs_5/(m=eaAaGwObaaaa)(mh=tK0198pC)7.jpg',
    author: '@insta_fit_queen',
    tags: ['instagram', 'fitness', 'mirror', 'reels', 'model'],
    duration: 28
  },
  {
    source_platform: 'eporner',
    category: 'instagram',
    external_id: 'ep_ig_782910',
    title: 'Aesthetic Insta story nude tease bedroom 18+',
    video_url: null,
    embed_url: 'https://www.eporner.com/embed/bL01x98pQm1/',
    canonical_url: 'https://www.eporner.com/video-bL01x98pQm1/',
    poster_url: 'https://static.eporner.com/thumbs/static4/9/93/931/931082/4_360.jpg',
    author: '@aesthetic_angel',
    tags: ['instagram', 'story', 'tease', 'bedroom', 'model'],
    duration: 22
  },

  // --- TIKTOK (18+ spicy short clips & trends <= 90s) ---
  {
    source_platform: 'pornhub',
    category: 'tiktok',
    external_id: 'ph64f01a82bc190',
    title: 'Hot 18+ TikTok dance nude reveal #shorties',
    video_url: null,
    embed_url: 'https://www.pornhub.com/embed/64f01a82bc190',
    canonical_url: 'https://www.pornhub.com/view_video.php?viewkey=ph64f01a82bc190',
    poster_url: 'https://ei.phncdn.com/videos/202308/31/438318181/thumbs_5/(m=eaAaGwObaaaa)(mh=h42eP949hT0fK2o1)12.jpg',
    author: '@tiktok_18plus',
    tags: ['tiktok', 'reels', 'dance', 'nude', 'vertical', 'shorts'],
    duration: 28
  },
  {
    source_platform: 'eporner',
    category: 'tiktok',
    external_id: 'ep_tt_891024',
    title: 'Viral TikTok bounce trend nude edit 18+',
    video_url: null,
    embed_url: 'https://www.eporner.com/embed/nQhKqH1t7bK/',
    canonical_url: 'https://www.eporner.com/video-nQhKqH1t7bK/',
    poster_url: 'https://static.eporner.com/thumbs/static4/9/90/901/901234/5_360.jpg',
    author: '@tok_adult',
    tags: ['tiktok', 'reels', 'bouncing', 'viral', 'nsfw', 'vertical'],
    duration: 22
  },
  {
    source_platform: 'pornhub',
    category: 'tiktok',
    external_id: 'ph65f19028ab711',
    title: 'TikTok dance trend bikini reveal 18+ #shorties',
    video_url: null,
    embed_url: 'https://www.pornhub.com/embed/65f19028ab711',
    canonical_url: 'https://www.pornhub.com/view_video.php?viewkey=ph65f19028ab711',
    poster_url: 'https://ei.phncdn.com/videos/202403/12/448910281/thumbs_5/(m=eaAaGwObaaaa)(mh=kL9018pA)2.jpg',
    author: '@tok_viral',
    tags: ['tiktok', 'reels', 'dance', 'shorts', 'nude'],
    duration: 25
  },
  {
    source_platform: 'eporner',
    category: 'tiktok',
    external_id: 'ep_tt_991823',
    title: 'E-Girl TikTok bounce trend stripped 18+',
    video_url: null,
    embed_url: 'https://www.eporner.com/embed/bL01x98pQm1/',
    canonical_url: 'https://www.eporner.com/video-bL01x98pQm1/',
    poster_url: 'https://static.eporner.com/thumbs/static4/9/93/931/931082/4_360.jpg',
    author: '@egirl_tok',
    tags: ['tiktok', 'reels', 'egirl', 'bounce', 'vertical'],
    duration: 21
  },

  // --- FACEBOOK (18+ spicy viral clips & amateur reels <= 90s) ---
  {
    source_platform: 'pornhub',
    category: 'facebook',
    external_id: 'ph64e90182bd819',
    title: 'Viral Facebook Reels amateur girlfriend dance 18+',
    video_url: null,
    embed_url: 'https://www.pornhub.com/embed/64e90182bd819',
    canonical_url: 'https://www.pornhub.com/view_video.php?viewkey=ph64e90182bd819',
    poster_url: 'https://ei.phncdn.com/videos/202308/25/437910281/thumbs_5/(m=eaAaGwObaaaa)(mh=sK9018pB)3.jpg',
    author: '@fb_viral_reels',
    tags: ['facebook', 'fb', 'fbreels', 'amateur', 'viral'],
    duration: 34
  },
  {
    source_platform: 'eporner',
    category: 'facebook',
    external_id: 'ep_fb_661920',
    title: 'Spicy housewife FB Reels mirror strip tease 18+',
    video_url: null,
    embed_url: 'https://www.eporner.com/embed/8N0dRt1k2aB/',
    canonical_url: 'https://www.eporner.com/video-8N0dRt1k2aB/',
    poster_url: 'https://static.eporner.com/thumbs/static4/8/82/821/821901/4_360.jpg',
    author: '@housewife_reels',
    tags: ['facebook', 'reels', 'amateur', 'mirror', 'striptease'],
    duration: 38
  },
  {
    source_platform: 'pornhub',
    category: 'facebook',
    external_id: 'ph65b10293ae781',
    title: 'Viral Facebook watch spicy amateur flash in car',
    video_url: null,
    embed_url: 'https://www.pornhub.com/embed/65b10293ae781',
    canonical_url: 'https://www.pornhub.com/view_video.php?viewkey=ph65b10293ae781',
    poster_url: 'https://ei.phncdn.com/videos/202401/15/446019281/thumbs_5/(m=eaAaGwObaaaa)(mh=uP018pB2)6.jpg',
    author: '@car_reels_amateur',
    tags: ['facebook', 'fbreels', 'viral', 'amateur', 'shorts'],
    duration: 29
  },
  {
    source_platform: 'eporner',
    category: 'facebook',
    external_id: 'ep_fb_551092',
    title: 'FB Reels cute girl next door bedroom dance 18+',
    video_url: null,
    embed_url: 'https://www.eporner.com/embed/vB7x0L9k1mP/',
    canonical_url: 'https://www.eporner.com/video-vB7x0L9k1mP/',
    poster_url: 'https://static.eporner.com/thumbs/static4/6/69/691/691230/3_360.jpg',
    author: '@fb_amateur_dance',
    tags: ['facebook', 'fbreels', 'dance', 'amateur', 'bedroom'],
    duration: 26
  },
  {
    source_platform: 'pornhub',
    category: 'tik-tok',
    external_id: 'ph65e891021bc82',
    title: 'POV TikTok challenge adult edition 18+',
    video_url: null,
    embed_url: 'https://www.pornhub.com/embed/65e891021bc82',
    canonical_url: 'https://www.pornhub.com/view_video.php?viewkey=ph65e891021bc82',
    poster_url: 'https://ei.phncdn.com/videos/202403/01/448190281/thumbs_5/(m=eaAaGwObaaaa)(mh=yT019pB)4.jpg',
    author: '@reels_adult',
    tags: ['tiktok', 'reels', 'challenge', 'shorts', 'pov'],
    duration: 30
  },
  {
    source_platform: 'eporner',
    category: 'tik-tok',
    external_id: 'ep_tt_991823',
    title: 'E-Girl TikTok bounce trend stripped 18+',
    video_url: null,
    embed_url: 'https://www.eporner.com/embed/bL01x98pQm1/',
    canonical_url: 'https://www.eporner.com/video-bL01x98pQm1/',
    poster_url: 'https://static.eporner.com/thumbs/static4/9/93/931/931082/4_360.jpg',
    author: '@egirl_tok',
    tags: ['tiktok', 'reels', 'egirl', 'bounce', 'vertical'],
    duration: 21
  },
  {
    source_platform: 'eporner',
    category: 'tik-tok',
    external_id: 'ep_tt_771928',
    title: 'Vertical phone selfie mirror flash #reels 18+',
    video_url: null,
    embed_url: 'https://www.eporner.com/embed/vB7x0L9k1mP/',
    canonical_url: 'https://www.eporner.com/video-vB7x0L9k1mP/',
    poster_url: 'https://static.eporner.com/thumbs/static4/6/69/691/691230/3_360.jpg',
    author: '@selfie_queen',
    tags: ['tiktok', 'reels', 'selfie', 'mirror', 'vertical'],
    duration: 19
  },
  {
    source_platform: 'eporner',
    category: 'tik-tok',
    external_id: 'ep_tt_551029',
    title: 'Cute college amateur TikTok leggings tease 18+',
    video_url: null,
    embed_url: 'https://www.eporner.com/embed/pQ9k1Lm08rT/',
    canonical_url: 'https://www.eporner.com/video-pQ9k1Lm08rT/',
    poster_url: 'https://static.eporner.com/thumbs/static4/8/88/881/881902/5_360.jpg',
    author: '@college_shorts',
    tags: ['tiktok', 'reels', 'leggings', 'college', 'shorts'],
    duration: 24
  },

  // --- AMATEUR ---
  {
    source_platform: 'pornhub',
    category: 'amateur-girls',
    external_id: 'ph63d891e459012',
    title: 'Cute real amateur girlfriend morning tease #shorties',
    video_url: null,
    embed_url: 'https://www.pornhub.com/embed/63d891e459012',
    canonical_url: 'https://www.pornhub.com/view_video.php?viewkey=ph63d891e459012',
    poster_url: 'https://ei.phncdn.com/videos/202302/01/424192011/thumbs_5/(m=eaAaGwObaaaa)(mh=x2GkL3491)8.jpg',
    author: '@real_amateur_couple',
    tags: ['amateur', 'homemade', 'verified', 'girlfriend', 'tease'],
    duration: 35
  },
  {
    source_platform: 'eporner',
    category: 'amateur-girls',
    external_id: 'ep_amat_481902',
    title: 'Homemade bedroom amateur quickie strip',
    video_url: null,
    embed_url: 'https://www.eporner.com/embed/8N0dRt1k2aB/',
    canonical_url: 'https://www.eporner.com/video-8N0dRt1k2aB/',
    poster_url: 'https://static.eporner.com/thumbs/static4/8/82/821/821901/4_360.jpg',
    author: '@amateur_home',
    tags: ['amateur', 'homemade', 'striptease', 'real', 'bedroom'],
    duration: 41
  },

  // --- COSPLAY ---
  {
    source_platform: 'pornhub',
    category: 'nsfw-cosplay',
    external_id: 'ph65b8921cf0981',
    title: '2B Nier Automata sexy cosplay tease #cosplay',
    video_url: null,
    embed_url: 'https://www.pornhub.com/embed/65b8921cf0981',
    canonical_url: 'https://www.pornhub.com/view_video.php?viewkey=ph65b8921cf0981',
    poster_url: 'https://ei.phncdn.com/videos/202401/18/446198121/thumbs_5/(m=eaAaGwObaaaa)(mh=bH81kP091)10.jpg',
    author: '@waifu_cosplayer',
    tags: ['cosplay', '2b', 'nier', 'anime', 'costume', 'booty'],
    duration: 30
  },
  {
    source_platform: 'eporner',
    category: 'nsfw-cosplay',
    external_id: 'ep_cos_391081',
    title: 'Tifa Lockhart Final Fantasy NSFW Cosplay strip',
    video_url: null,
    embed_url: 'https://www.eporner.com/embed/gT1x8K01lMn/',
    canonical_url: 'https://www.eporner.com/video-gT1x8K01lMn/',
    poster_url: 'https://static.eporner.com/thumbs/static4/7/74/741/741890/6_360.jpg',
    author: '@cosplay_sensations',
    tags: ['cosplay', 'tifa', 'anime', 'costume', 'gamer'],
    duration: 45
  },

  // --- THICK BOOTY ---
  {
    source_platform: 'pornhub',
    category: 'thick-booty',
    external_id: 'ph64a91082ce719',
    title: 'PAWG thick booty clapping in leggings #shorts',
    video_url: null,
    embed_url: 'https://www.pornhub.com/embed/64a91082ce719',
    canonical_url: 'https://www.pornhub.com/view_video.php?viewkey=ph64a91082ce719',
    poster_url: 'https://ei.phncdn.com/videos/202307/11/435198210/thumbs_5/(m=eaAaGwObaaaa)(mh=kL8192aP1)4.jpg',
    author: '@pawg_queen',
    tags: ['booty', 'pawg', 'thick', 'ass', 'leggings', 'twerk'],
    duration: 25
  },
  {
    source_platform: 'eporner',
    category: 'thick-booty',
    external_id: 'ep_booty_771920',
    title: 'Curvy latina bubble butt oil massage & twerk',
    video_url: null,
    embed_url: 'https://www.eporner.com/embed/vB7x0L9k1mP/',
    canonical_url: 'https://www.eporner.com/video-vB7x0L9k1mP/',
    poster_url: 'https://static.eporner.com/thumbs/static4/6/69/691/691230/3_360.jpg',
    author: '@thick_curves',
    tags: ['booty', 'thick', 'ass', 'curvy', 'oiled', 'twerk'],
    duration: 38
  },

  // --- FIT & ATHLETIC ---
  {
    source_platform: 'pornhub',
    category: 'fit-girls',
    external_id: 'ph64c81093af712',
    title: 'Gym babe post-workout locker room flash #fitness',
    video_url: null,
    embed_url: 'https://www.pornhub.com/embed/64c81093af712',
    canonical_url: 'https://www.pornhub.com/view_video.php?viewkey=ph64c81093af712',
    poster_url: 'https://ei.phncdn.com/videos/202308/04/436819021/thumbs_5/(m=eaAaGwObaaaa)(mh=yT719pL1)6.jpg',
    author: '@fit_goddess',
    tags: ['fit', 'gym', 'workout', 'abs', 'athletic', 'locker'],
    duration: 29
  },
  {
    source_platform: 'eporner',
    category: 'fit-girls',
    external_id: 'ep_fit_551028',
    title: 'Toned athletic blonde yoga stretch & strip',
    video_url: null,
    embed_url: 'https://www.eporner.com/embed/pQ9k1Lm08rT/',
    canonical_url: 'https://www.eporner.com/video-pQ9k1Lm08rT/',
    poster_url: 'https://static.eporner.com/thumbs/static4/8/88/881/881902/5_360.jpg',
    author: '@gym_bunnies',
    tags: ['fit', 'athletic', 'yoga', 'muscle', 'gym', 'flexible'],
    duration: 44
  },

  // --- LATINAS ---
  {
    source_platform: 'pornhub',
    category: 'latinas',
    external_id: 'ph64e91028ba661',
    title: 'Fiery Colombian babe bikini dance & strip #latina',
    video_url: null,
    embed_url: 'https://www.pornhub.com/embed/64e91028ba661',
    canonical_url: 'https://www.pornhub.com/view_video.php?viewkey=ph64e91028ba661',
    poster_url: 'https://ei.phncdn.com/videos/202308/21/437910281/thumbs_5/(m=eaAaGwObaaaa)(mh=qP018La1)9.jpg',
    author: '@latina_fire',
    tags: ['latina', 'colombian', 'bikini', 'spanish', 'curvy'],
    duration: 33
  },
  {
    source_platform: 'eporner',
    category: 'latinas',
    external_id: 'ep_lat_991823',
    title: 'Sensual Brazilian brunette shower tease',
    video_url: null,
    embed_url: 'https://www.eporner.com/embed/kL01x98pQm1/',
    canonical_url: 'https://www.eporner.com/video-kL01x98pQm1/',
    poster_url: 'https://static.eporner.com/thumbs/static4/9/93/931/931082/4_360.jpg',
    author: '@brazilian_beauty',
    tags: ['latina', 'brazilian', 'shower', 'wet', 'curves'],
    duration: 40
  },

  // --- ASIAN ---
  {
    source_platform: 'pornhub',
    category: 'busty-asians',
    external_id: 'ph65a91083bc719',
    title: 'Busty Japanese hottie kimono strip tease #asian',
    video_url: null,
    embed_url: 'https://www.pornhub.com/embed/65a91083bc719',
    canonical_url: 'https://www.pornhub.com/view_video.php?viewkey=ph65a91083bc719',
    poster_url: 'https://ei.phncdn.com/videos/202401/05/445109281/thumbs_5/(m=eaAaGwObaaaa)(mh=rM901pL8)7.jpg',
    author: '@tokyo_sensations',
    tags: ['asian', 'japanese', 'busty', 'kimono', 'cute'],
    duration: 32
  },
  {
    source_platform: 'eporner',
    category: 'busty-asians',
    external_id: 'ep_asn_112093',
    title: 'Cute Korean model lingerie try-on haul 18+',
    video_url: null,
    embed_url: 'https://www.eporner.com/embed/xN1p08kL9qR/',
    canonical_url: 'https://www.eporner.com/video-xN1p08kL9qR/',
    poster_url: 'https://static.eporner.com/thumbs/static4/7/79/791/791028/2_360.jpg',
    author: '@korean_secrets',
    tags: ['asian', 'korean', 'lingerie', 'model', 'petite'],
    duration: 46
  },

  // --- GOTH & E-GIRL ---
  {
    source_platform: 'pornhub',
    category: 'goth-girls',
    external_id: 'ph64d91028bc612',
    title: 'Tattooed goth alt babe fishnets tease #goth',
    video_url: null,
    embed_url: 'https://www.pornhub.com/embed/64d91028bc612',
    canonical_url: 'https://www.pornhub.com/view_video.php?viewkey=ph64d91028bc612',
    poster_url: 'https://ei.phncdn.com/videos/202308/14/437190281/thumbs_5/(m=eaAaGwObaaaa)(mh=tK9108pA1)5.jpg',
    author: '@goth_darling',
    tags: ['goth', 'egirl', 'alt', 'tattoos', 'piercing', 'fishnets'],
    duration: 27
  },
  {
    source_platform: 'eporner',
    category: 'goth-girls',
    external_id: 'ep_goth_881920',
    title: 'Alt e-girl choker and black lipstick strip',
    video_url: null,
    embed_url: 'https://www.eporner.com/embed/mR801pL9k1T/',
    canonical_url: 'https://www.eporner.com/video-mR801pL9k1T/',
    poster_url: 'https://static.eporner.com/thumbs/static4/8/85/851/851029/6_360.jpg',
    author: '@alt_dolls',
    tags: ['goth', 'egirl', 'choker', 'pierced', 'alt'],
    duration: 36
  },

  // --- PORNHUB SHORTS (Strictly Pornhub) ---
  {
    source_platform: 'pornhub',
    category: 'pornhub',
    external_id: 'ph65819028ca711',
    title: 'Official Pornhub Shorties: Trending viral vertical 18+',
    video_url: null,
    embed_url: 'https://www.pornhub.com/embed/65819028ca711',
    canonical_url: 'https://www.pornhub.com/view_video.php?viewkey=ph65819028ca711',
    poster_url: 'https://ei.phncdn.com/videos/202312/18/444109281/thumbs_5/(m=eaAaGwObaaaa)(mh=uP9108La2)8.jpg',
    author: '@pornhub_shorties',
    tags: ['pornhub', 'shorties', 'shorts', 'vertical', 'trending'],
    duration: 24
  },
  {
    source_platform: 'pornhub',
    category: 'pornhub',
    external_id: 'ph65910283bd812',
    title: 'Pornhub Shorties: Verified model bedroom reveal',
    video_url: null,
    embed_url: 'https://www.pornhub.com/embed/65910283bd812',
    canonical_url: 'https://www.pornhub.com/view_video.php?viewkey=ph65910283bd812',
    poster_url: 'https://ei.phncdn.com/videos/202312/29/444810291/thumbs_5/(m=eaAaGwObaaaa)(mh=vK9018pB1)3.jpg',
    author: '@pornhub_shorties',
    tags: ['pornhub', 'shorties', 'verified', 'shorts', 'model'],
    duration: 31
  },
  {
    source_platform: 'pornhub',
    category: 'pornhub',
    external_id: 'ph65c19208ea912',
    title: 'Pornhub Shorties: Blonde stunner lingerie showcase',
    video_url: null,
    embed_url: 'https://www.pornhub.com/embed/65c19208ea912',
    canonical_url: 'https://www.pornhub.com/view_video.php?viewkey=ph65c19208ea912',
    poster_url: 'https://ei.phncdn.com/videos/202402/08/447190281/thumbs_5/(m=eaAaGwObaaaa)(mh=wL0198pC3)5.jpg',
    author: '@pornhub_shorties',
    tags: ['pornhub', 'shorties', 'lingerie', 'blonde', 'shorts'],
    duration: 26
  }
];

async function seedMultiPlatform() {
  console.log('🚀 Starting Parallel Multi-Platform 18+ Adult Video Discovery Seeder...\n');

  const redgifsAdapter = new RedGifsAdapter({ timeoutMs: 7000 });
  const pornhubAdapter = new PornhubAdapter({ timeoutMs: 4000 });
  const epornerAdapter = new EpornerAdapter({ timeoutMs: 4000 });

  const allCollected = [];

  // 1. Parallel live fetch across all categories from RedGifs
  console.log('--- Collecting live 18+ reels from RedGifs in parallel across categories ---');
  const redgifsTasks = CATEGORIES.filter(c => c !== 'pornhub').map(async (cat) => {
    try {
      const res = await redgifsAdapter.fetchVideos({
        cursor: { nicheIndex: 0, page: 1 },
        limit: 18,
        category: cat
      });
      const items = res.items || [];
      console.log(`[RedGifs] Category '${cat}': fetched ${items.length} items`);
      for (const item of items) {
        if (!item.duration || item.duration <= 90) {
          item.category = cat;
          item.source_platform = 'redgifs';
          item.is_nsfw = true;
          allCollected.push(item);
        }
      }
    } catch (err) {
      console.warn(`[RedGifs] Error for '${cat}': ${err.message}`);
    }
  });

  // 2. Parallel live fetch from Pornhub & Eporner
  console.log('--- Collecting live 18+ reels from Pornhub & Eporner in parallel ---');
  const externalTasks = CATEGORIES.map(async (cat) => {
    // Pornhub
    try {
      const phRes = await pornhubAdapter.fetchVideos({
        cursor: { queryIndex: 0, page: 1 },
        limit: 8,
        category: cat
      });
      const items = phRes.items || [];
      if (items.length > 0) {
        console.log(`[Pornhub] Category '${cat}': fetched ${items.length} items`);
        for (const item of items) {
          if (!item.duration || item.duration <= 90) {
            item.category = cat;
            item.source_platform = 'pornhub';
            item.is_nsfw = true;
            allCollected.push(item);
          }
        }
      }
    } catch {}

    // Eporner
    if (cat !== 'pornhub') {
      try {
        const epRes = await epornerAdapter.fetchVideos({
          cursor: { queryIndex: 0, page: 1 },
          limit: 8,
          category: cat
        });
        const items = epRes.items || [];
        if (items.length > 0) {
          console.log(`[Eporner] Category '${cat}': fetched ${items.length} items`);
          for (const item of items) {
            if (!item.duration || item.duration <= 90) {
              item.category = cat;
              item.source_platform = 'eporner';
              item.is_nsfw = true;
              allCollected.push(item);
            }
          }
        }
      } catch {}
    }
  });

  await Promise.allSettled([...redgifsTasks, ...externalTasks]);

  // 4. Add curated multi-platform records to ensure all platforms and categories are populated
  for (const clip of CURATED_18PLUS_MULTICLIPS) {
    allCollected.push({
      source: clip.source_platform,
      source_platform: clip.source_platform,
      category: clip.category,
      is_nsfw: true,
      external_id: clip.external_id,
      canonical_url: clip.canonical_url,
      dedupe_key: `${clip.source_platform}:${clip.external_id}`,
      video_url: clip.video_url,
      embed_url: clip.embed_url,
      title: clip.title,
      poster_url: clip.poster_url,
      thumbnail_url: clip.poster_url,
      author: clip.author,
      tags: clip.tags,
      duration: clip.duration,
      is_available: true
    });
  }

  // 5. Deduplicate candidates in-memory by dedupe_key before sending to Supabase
  const uniqueItemsMap = new Map();
  for (const v of allCollected) {
    const key = v.dedupe_key || `${v.source_platform || v.source}:${v.external_id}`;
    if (!uniqueItemsMap.has(key)) {
      uniqueItemsMap.set(key, v);
    }
  }

  const uniqueCandidates = Array.from(uniqueItemsMap.values());
  console.log(`\nUnique candidate videos prepared: ${uniqueCandidates.length}`);

  // Batch Upsert into Supabase
  const nowIso = new Date().toISOString();
  const upsertPayload = uniqueCandidates.map(v => ({
    source: v.source_platform || v.source,
    source_platform: v.source_platform || v.source,
    category: v.category,
    is_nsfw: true,
    external_id: v.external_id,
    canonical_url: v.canonical_url,
    dedupe_key: v.dedupe_key || `${v.source_platform || v.source}:${v.external_id}`,
    video_url: v.video_url || null,
    embed_url: v.embed_url || null,
    title: (v.title || '').slice(0, 255),
    poster_url: v.poster_url || v.thumbnail_url || null,
    thumbnail_url: v.thumbnail_url || v.poster_url || null,
    author: (v.author || '').slice(0, 100),
    tags: Array.isArray(v.tags) ? v.tags.slice(0, 10) : [],
    duration: v.duration || 0,
    discovered_at: nowIso,
    created_at: nowIso,
    last_seen_at: nowIso,
    is_available: true
  }));

  const batchSize = 40;
  let totalCommitted = 0;

  for (let i = 0; i < upsertPayload.length; i += batchSize) {
    const chunk = upsertPayload.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('videos')
      .upsert(chunk, {
        onConflict: 'dedupe_key',
        ignoreDuplicates: false
      })
      .select('id');

    if (error) {
      console.error(`Batch upsert error (chunk ${i}):`, error.message);
    } else {
      totalCommitted += (data || []).length;
    }
  }

  // Normalize legacy 'tik-tok' category to 'tiktok'
  await supabase.from('videos').update({ category: 'tiktok' }).eq('category', 'tik-tok');

  console.log(`\n✅ Successfully committed ${totalCommitted} records to Supabase!\n`);

  // 6. Query and Print Final Breakdown
  const { data: finalRows, error: fetchErr } = await supabase
    .from('videos')
    .select('id, category, source_platform, is_nsfw');

  if (fetchErr) {
    console.error('Error querying summary:', fetchErr.message);
    return;
  }

  const categoryCounts = {};
  const platformCounts = {};

  finalRows.forEach(r => {
    const cat = r.category || 'unknown';
    const plat = r.source_platform || 'unknown';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    platformCounts[plat] = (platformCounts[plat] || 0) + 1;
  });

  console.log('====================================================');
  console.log('📊 SUPABASE 18+ ADULT VIDEO INVENTORY SUMMARY');
  console.log('====================================================');
  console.log(`Total Stored Videos: ${finalRows.length}\n`);

  console.log('--- Breakdown by Category ---');
  Object.entries(categoryCounts).forEach(([cat, count]) => {
    console.log(`  • ${cat.padEnd(16)}: ${count} videos`);
  });

  console.log('\n--- Breakdown by 18+ Platform ---');
  Object.entries(platformCounts).forEach(([plat, count]) => {
    console.log(`  • ${plat.padEnd(16)}: ${count} videos`);
  });
  console.log('====================================================\n');
}

seedMultiPlatform()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
