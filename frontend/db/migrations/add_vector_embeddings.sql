-- Add pgvector extension and tables for enhanced RAG

-- Enable pgvector extension (requires superuser privileges)
-- If this fails, you may need to enable it via Supabase dashboard: Database > Extensions > Enable "vector"
CREATE EXTENSION IF NOT EXISTS vector;

-- Create message_embeddings table for semantic search over past messages
CREATE TABLE IF NOT EXISTS message_embeddings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  message_id BIGINT REFERENCES chat_messages(id) ON DELETE CASCADE,
  embedding vector(1536), -- OpenAI text-embedding-3-small dimension
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create chat_embeddings table for thread-level summaries
CREATE TABLE IF NOT EXISTS chat_embeddings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  embedding vector(1536),
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for efficient similarity search
CREATE INDEX IF NOT EXISTS idx_message_embeddings_thread_id ON message_embeddings(thread_id);
CREATE INDEX IF NOT EXISTS idx_message_embeddings_embedding ON message_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_chat_embeddings_thread_id ON chat_embeddings(thread_id);
CREATE INDEX IF NOT EXISTS idx_chat_embeddings_embedding ON chat_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Enable RLS
ALTER TABLE message_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_embeddings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see embeddings for their own threads
CREATE POLICY "Users can view own message embeddings"
  ON message_embeddings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_threads
      WHERE chat_threads.id = message_embeddings.thread_id
      AND chat_threads.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own chat embeddings"
  ON chat_embeddings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_threads
      WHERE chat_threads.id = chat_embeddings.thread_id
      AND chat_threads.user_id = auth.uid()
    )
  );

-- Function to find similar messages (for RAG)
CREATE OR REPLACE FUNCTION match_messages(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  thread_id_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  thread_id uuid,
  message_id bigint,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    me.id,
    me.thread_id,
    me.message_id,
    me.content,
    1 - (me.embedding <=> query_embedding) as similarity
  FROM message_embeddings me
  WHERE 
    (thread_id_filter IS NULL OR me.thread_id = thread_id_filter)
    AND 1 - (me.embedding <=> query_embedding) > match_threshold
  ORDER BY me.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON TABLE message_embeddings IS 'Vector embeddings for semantic search over chat messages';
COMMENT ON TABLE chat_embeddings IS 'Vector embeddings for thread summaries';
COMMENT ON FUNCTION match_messages IS 'Find similar messages using cosine similarity';

