-- Create news table with 7-day rolling window constraints
CREATE TABLE IF NOT EXISTS public.news (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  source VARCHAR(100) NOT NULL,
  sources JSONB,
  summary TEXT,
  image_url TEXT,
  matched_symbols JSONB NOT NULL DEFAULT '[]'::jsonb,
  published_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Drop duplicate index if created previously
DROP INDEX IF EXISTS public.news_url_idx;

-- Fast descending index for chronological sorting
CREATE INDEX IF NOT EXISTS news_published_idx ON public.news (published_at DESC);

-- Enable RLS and grant read-only permissions to public frontend
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.news FROM anon, authenticated;
GRANT SELECT ON public.news TO anon, authenticated;

-- Create policy for public read access
DROP POLICY IF EXISTS "Public read access to news" ON public.news;
CREATE POLICY "Public read access to news" ON public.news
  FOR SELECT
  TO public
  USING (published_at >= NOW() - INTERVAL '7 days');
