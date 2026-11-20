-- Migration: 2026112102_fast_index_and_platforms.sql
-- Description: Composite index on (category, created_at DESC) and duration_seconds support for fast feed loading.

CREATE INDEX IF NOT EXISTS idx_videos_category_created_at ON videos(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_fast_feed ON videos(category, is_available, is_nsfw, created_at DESC);

ALTER TABLE videos ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
UPDATE videos SET duration_seconds = duration WHERE duration_seconds IS NULL;
