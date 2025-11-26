-- Create prompt_patches table for storing AI-suggested prompt improvements
CREATE TABLE IF NOT EXISTS public.prompt_patches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  category text,
  priority text CHECK (priority IN ('high', 'medium', 'low')),
  suggested_text text NOT NULL,
  rationale text,
  affected_tests text[],
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz DEFAULT now(),
  decided_at timestamptz
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_prompt_patches_status ON public.prompt_patches(status);
CREATE INDEX IF NOT EXISTS idx_prompt_patches_created_at ON public.prompt_patches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prompt_patches_priority ON public.prompt_patches(priority) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.prompt_patches ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can read/write prompt patches
CREATE POLICY "Admins can manage prompt patches"
  ON public.prompt_patches
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );



