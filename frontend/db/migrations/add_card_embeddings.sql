-- Create card_embeddings table for semantic card search

-- Ensure pgvector extension is enabled (requires superuser privileges)
-- If this fails, enable it via Supabase dashboard: Database > Extensions > Enable "vector"
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS card_embeddings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_name TEXT NOT NULL UNIQUE,
  embedding vector(1536), -- OpenAI text-embedding-3-small dimension
  oracle_text TEXT,
  type_line TEXT,
  color_identity TEXT[],
  format_legal TEXT[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index for efficient similarity search
CREATE INDEX IF NOT EXISTS idx_card_embeddings_embedding ON card_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_card_embeddings_card_name ON card_embeddings(card_name);

-- Enable RLS (public read access for card data)
ALTER TABLE card_embeddings ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read card embeddings (public card data)
CREATE POLICY "Anyone can read card embeddings"
  ON card_embeddings FOR SELECT
  USING (true);

-- Policy: Only authenticated users can insert/update (for admin operations)
CREATE POLICY "Authenticated users can manage card embeddings"
  ON card_embeddings FOR ALL
  TO authenticated
  USING (true);

-- Function to find similar cards
CREATE OR REPLACE FUNCTION match_cards(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  format_filter text[] DEFAULT NULL
)
RETURNS TABLE (
  card_name text,
  oracle_text text,
  type_line text,
  color_identity text[],
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.card_name,
    ce.oracle_text,
    ce.type_line,
    ce.color_identity,
    1 - (ce.embedding <=> query_embedding) as similarity
  FROM card_embeddings ce
  WHERE 
    (format_filter IS NULL OR ce.format_legal && format_filter)
    AND 1 - (ce.embedding <=> query_embedding) > match_threshold
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON TABLE card_embeddings IS 'Vector embeddings for semantic card search';
COMMENT ON FUNCTION match_cards IS 'Find similar cards using cosine similarity';

