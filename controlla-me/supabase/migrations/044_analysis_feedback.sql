-- Analysis feedback: user ratings and categorized feedback on completed analyses
-- One feedback per user per analysis (upsert pattern on client side)

CREATE TABLE IF NOT EXISTS analysis_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  category TEXT CHECK (category IN ('helpful', 'too_harsh', 'too_lenient', 'missing_risks', 'inaccurate', 'other')),
  feedback_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(analysis_id, user_id)  -- one feedback per user per analysis
);

-- RLS
ALTER TABLE analysis_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own feedback" ON analysis_feedback FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own feedback" ON analysis_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own feedback" ON analysis_feedback FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access" ON analysis_feedback FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE INDEX idx_analysis_feedback_analysis ON analysis_feedback(analysis_id);
CREATE INDEX idx_analysis_feedback_user ON analysis_feedback(user_id);
