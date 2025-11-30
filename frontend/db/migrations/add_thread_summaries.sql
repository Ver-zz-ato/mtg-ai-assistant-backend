-- Add summary column to chat_threads for conversation memory
ALTER TABLE chat_threads 
ADD COLUMN IF NOT EXISTS summary TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_chat_threads_summary ON chat_threads(summary) WHERE summary IS NOT NULL;

COMMENT ON COLUMN chat_threads.summary IS 'AI-generated summary of conversation key facts (format, budget, colors, playstyle, deck goals)';

