-- 18gram Video Discovery Engine Schema Migration
-- Migration: 20261120_discovery_engine.sql
-- Description: Creates videos, source_cursors, collection_runs, bookmarks tables, storage RPCs, and 7-day retention cleanup.

-- Enable pgcrypto / uuid-ossp if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. VIDEOS TABLE: Minimal, compact discovery metadata
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(32) NOT NULL,
  external_id VARCHAR(128) NOT NULL,
  canonical_url TEXT NOT NULL,
  dedupe_key VARCHAR(160) NOT NULL UNIQUE,
  video_url TEXT,
  embed_url TEXT,
  title VARCHAR(255),
  poster_url TEXT,
  author VARCHAR(100),
  tags TEXT[] DEFAULT '{}'::text[],
  duration INTEGER,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_available BOOLEAN NOT NULL DEFAULT TRUE
);

-- Performance & Retention Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_dedupe_key ON videos(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_videos_source_discovered ON videos(source, discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_discovered_at ON videos(discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_last_seen_at ON videos(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_available_discovered ON videos(is_available, discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_tags ON videos USING GIN(tags);

-- 2. SOURCE CURSORS TABLE: Checkpoints for pagination resumption
CREATE TABLE IF NOT EXISTS source_cursors (
  source VARCHAR(32) PRIMARY KEY,
  cursor JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_successful_collection_at TIMESTAMPTZ,
  last_seen_published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. COLLECTION RUNS TABLE: Detailed run metrics and reporting
CREATE TABLE IF NOT EXISTS collection_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  pages_fetched INTEGER DEFAULT 0,
  provider_requests INTEGER DEFAULT 0,
  videos_discovered INTEGER DEFAULT 0,
  unique_new_records INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  failed_provider_count INTEGER DEFAULT 0,
  rate_limit_events INTEGER DEFAULT 0,
  storage_used_bytes BIGINT,
  storage_percentage NUMERIC(5,2),
  status VARCHAR(32) DEFAULT 'running',
  summary_notes TEXT,
  provider_stats JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_collection_runs_started ON collection_runs(started_at DESC);

-- 4. BOOKMARKS TABLE: Cloud sync for user bookmarks (isolated from 7-day video discovery cleanup)
CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  reel_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_created ON bookmarks(created_at DESC);

-- 5. STORAGE HEALTH MONITORING RPC
CREATE OR REPLACE FUNCTION get_storage_health(db_max_size_bytes BIGINT DEFAULT 524288000)
RETURNS TABLE (
  db_size_bytes BIGINT,
  videos_table_bytes BIGINT,
  total_video_count BIGINT,
  avg_bytes_per_video NUMERIC,
  usage_percentage NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_db_size BIGINT := 0;
  v_table_size BIGINT := 0;
  v_video_count BIGINT := 0;
BEGIN
  BEGIN
    SELECT pg_database_size(current_database()) INTO v_db_size;
  EXCEPTION WHEN OTHERS THEN
    v_db_size := 0;
  END;

  BEGIN
    SELECT pg_total_relation_size('videos'::regclass) INTO v_table_size;
  EXCEPTION WHEN OTHERS THEN
    v_table_size := 0;
  END;

  SELECT count(*) INTO v_video_count FROM videos;

  RETURN QUERY SELECT
    v_db_size,
    v_table_size,
    v_video_count,
    ROUND((v_table_size::NUMERIC / GREATEST(v_video_count, 1)), 2),
    ROUND((v_db_size::NUMERIC * 100.0 / NULLIF(db_max_size_bytes, 0)), 2);
END;
$$;

-- 6. AUTOMATIC SEVEN-DAY CLEANUP RPC (Never touches bookmarks)
CREATE OR REPLACE FUNCTION cleanup_old_videos(retention_days INT DEFAULT 7)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_deleted_count INT := 0;
BEGIN
  DELETE FROM videos
  WHERE discovered_at < (NOW() - (retention_days || ' days')::INTERVAL);
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

-- 7. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

-- Videos policies
DROP POLICY IF EXISTS "Allow public read access on videos" ON videos;
CREATE POLICY "Allow public read access on videos" ON videos FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow service_role full access on videos" ON videos;
CREATE POLICY "Allow service_role full access on videos" ON videos FOR ALL USING (true);

-- Source cursors policies
DROP POLICY IF EXISTS "Allow full access on source_cursors" ON source_cursors;
CREATE POLICY "Allow full access on source_cursors" ON source_cursors FOR ALL USING (true);

-- Collection runs policies
DROP POLICY IF EXISTS "Allow full access on collection_runs" ON collection_runs;
CREATE POLICY "Allow full access on collection_runs" ON collection_runs FOR ALL USING (true);

-- Bookmarks policies (public read & write for bookmarks sync)
DROP POLICY IF EXISTS "Allow public read on bookmarks" ON bookmarks;
CREATE POLICY "Allow public read on bookmarks" ON bookmarks FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert on bookmarks" ON bookmarks;
CREATE POLICY "Allow public insert on bookmarks" ON bookmarks FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update on bookmarks" ON bookmarks;
CREATE POLICY "Allow public update on bookmarks" ON bookmarks FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete on bookmarks" ON bookmarks;
CREATE POLICY "Allow public delete on bookmarks" ON bookmarks FOR DELETE USING (true);

-- 8. PG_CRON SCHEDULE (Run in Supabase SQL editor if pg_cron extension is enabled)
-- SELECT cron.schedule('cleanup-7day-discovery-videos', '0 3 * * *', $$SELECT cleanup_old_videos(7);$$);
