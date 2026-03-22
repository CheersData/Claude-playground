-- ============================================================
-- Migration 042: Deep Search Conversations — Conversazioni multi-turn su clausole
-- ============================================================
-- Rende la deep search (approfondimento clausole rischiose) conversazionale,
-- con memoria dei messaggi precedenti. Stesso pattern di document_conversations
-- (migration 041) ma per clausole specifiche invece che per l'intero documento.
-- ============================================================

-- 1. Conversazione deep search (1 per clausola per analisi)
CREATE TABLE IF NOT EXISTS deep_search_conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_id   uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  clause_title  text NOT NULL,                    -- titolo clausola (es. "Penale eccessiva")
  clause_context text,                            -- contesto clausola + analisi esistente
  message_count integer DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- 2. Messaggi deep search (user + assistant, ordinati cronologicamente)
CREATE TABLE IF NOT EXISTS deep_search_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES deep_search_conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text NOT NULL,
  sources         jsonb,                          -- [{url, title, excerpt}] per risposte assistant
  metadata        jsonb,                          -- {provider, model, durationMs, tokens}
  created_at      timestamptz DEFAULT now()
);

-- Indici per performance
CREATE INDEX idx_ds_conv_user ON deep_search_conversations(user_id);
CREATE INDEX idx_ds_conv_analysis ON deep_search_conversations(analysis_id);
CREATE INDEX idx_ds_conv_clause ON deep_search_conversations(analysis_id, clause_title);
CREATE INDEX idx_ds_msg_conv ON deep_search_messages(conversation_id);
CREATE INDEX idx_ds_msg_created ON deep_search_messages(conversation_id, created_at);

-- 3. RLS — utenti vedono solo le proprie conversazioni
ALTER TABLE deep_search_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE deep_search_messages ENABLE ROW LEVEL SECURITY;

-- Policy per utenti autenticati
CREATE POLICY "Users manage own deep search conversations"
  ON deep_search_conversations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own deep search messages"
  ON deep_search_messages FOR ALL
  USING (
    conversation_id IN (
      SELECT id FROM deep_search_conversations WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM deep_search_conversations WHERE user_id = auth.uid()
    )
  );

-- Service role bypass (per API server-side)
CREATE POLICY "Service role full access deep search conversations"
  ON deep_search_conversations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access deep search messages"
  ON deep_search_messages FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 4. Trigger per aggiornare updated_at e message_count
CREATE OR REPLACE FUNCTION update_deep_search_conversation_on_message()
RETURNS trigger AS $$
BEGIN
  UPDATE deep_search_conversations
  SET updated_at = now(),
      message_count = (
        SELECT count(*) FROM deep_search_messages WHERE conversation_id = NEW.conversation_id
      )
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_deep_search_conversation_on_message
  AFTER INSERT ON deep_search_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_deep_search_conversation_on_message();

-- 5. Cleanup function (TTL 90 giorni per conversazioni inattive)
CREATE OR REPLACE FUNCTION cleanup_old_deep_search_conversations(days_ttl integer DEFAULT 90)
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM deep_search_conversations
  WHERE updated_at < now() - (days_ttl || ' days')::interval;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
