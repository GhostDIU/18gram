-- 18gram Multi-Platform 18+ Adult Video Discovery Migration
-- Migration: 20261121_multi_platform_categories.sql
-- Description: Adds source_platform, category, is_nsfw, thumbnail_url, created_at, unique constraint on (source_platform, external_id), and category indexes.

-- 1. Add new columns to videos table
ALTER TABLE videos ADD COLUMN IF NOT EXISTS source_platform VARCHAR(32);
ALTER TABLE videos ADD COLUMN IF NOT EXISTS category VARCHAR(64);
ALTER TABLE videos ADD COLUMN IF NOT EXISTS is_nsfw BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. Backfill existing rows
UPDATE videos SET source_platform = source WHERE source_platform IS NULL;
UPDATE videos SET thumbnail_url = poster_url WHERE thumbnail_url IS NULL;
UPDATE videos SET created_at = discovered_at WHERE created_at IS NULL;
UPDATE videos SET is_nsfw = true WHERE is_nsfw IS NULL;

-- Backfill categories for existing rows based on tags or source
UPDATE videos SET category = 'pornhub' WHERE (source = 'pornhub' OR source_platform = 'pornhub') AND category IS NULL;
UPDATE videos SET category = 'nsfw-cosplay' WHERE category IS NULL AND ('cosplay' = ANY(tags) OR 'anime' = ANY(tags) OR 'costume' = ANY(tags) OR 'waifu' = ANY(tags));
UPDATE videos SET category = 'goth-girls' WHERE category IS NULL AND ('goth' = ANY(tags) OR 'alt' = ANY(tags) OR 'alternative' = ANY(tags) OR 'tattoo' = ANY(tags) OR 'pierced' = ANY(tags));
UPDATE videos SET category = 'thick-booty' WHERE category IS NULL AND ('booty' = ANY(tags) OR 'ass' = ANY(tags) OR 'bigass' = ANY(tags) OR 'pawg' = ANY(tags) OR 'curvy' = ANY(tags));
UPDATE videos SET category = 'fit-girls' WHERE category IS NULL AND ('fit' = ANY(tags) OR 'gym' = ANY(tags) OR 'athletic' = ANY(tags) OR 'fitness' = ANY(tags) OR 'workout' = ANY(tags));
UPDATE videos SET category = 'latinas' WHERE category IS NULL AND ('latina' = ANY(tags) OR 'latinas' = ANY(tags) OR 'spanish' = ANY(tags));
UPDATE videos SET category = 'busty-asians' WHERE category IS NULL AND ('asian' = ANY(tags) OR 'japanese' = ANY(tags) OR 'korean' = ANY(tags));
UPDATE videos SET category = 'amateur-girls' WHERE category IS NULL AND ('amateur' = ANY(tags) OR 'homemade' = ANY(tags) OR 'verified' = ANY(tags) OR 'real' = ANY(tags));
UPDATE videos SET category = 'tik-tok' WHERE category IS NULL;

-- 3. Unique constraint on (source_platform, external_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_source_platform_external_id ON videos(source_platform, external_id);

-- 4. Indexes for fast category and multi-platform filtering
CREATE INDEX IF NOT EXISTS idx_videos_category_created ON videos(category, is_available, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_source_platform ON videos(source_platform);
CREATE INDEX IF NOT EXISTS idx_videos_is_nsfw ON videos(is_nsfw);

-- 5. Ensure RLS policies allow public read access
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access on videos" ON videos;
CREATE POLICY "Allow public read access on videos" ON videos FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow service_role full access on videos" ON videos;
CREATE POLICY "Allow service_role full access on videos" ON videos FOR ALL USING (true);
