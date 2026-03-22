-- ============================================================
-- Migration 041: Document Chat — Conversazioni multi-turn su documenti analizzati
-- ============================================================
-- Permette al notaio (e a qualsiasi utente) di fare più domande sullo stesso
-- documento analizzato, con memoria della conversazione precedente.
-- ============================================================

-- 1. Conversazione (1 per sessione di chat su un'analisi)
CREATE TABLE IF NOT EXISTS document_conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_id   uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  title         text,                          -- auto-generato dalla prima domanda
  message_count integer DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- 2. Messaggi (user + assistant, ordinati cronologicamente)
CREATE TABLE IF NOT EXISTS document_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES document_conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text NOT NULL,
  sources         jsonb,                       -- [{url, title, excerpt}] per risposte assistant
  metadata        jsonb,                       -- {provider, model, durationMs, tokens}
  created_at      timestamptz DEFAULT now()
);

-- Indici per performance
CREATE INDEX idx_doc_conv_user ON document_conversations(user_id);
CREATE INDEX idx_doc_conv_analysis ON document_conversations(analysis_id);
CREATE INDEX idx_doc_msg_conv ON document_messages(conversation_id);
CREATE INDEX idx_doc_msg_created ON document_messages(conversation_id, created_at);

-- 3. RLS — utenti vedono solo le proprie conversazioni
ALTER TABLE document_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_messages ENABLE ROW LEVEL SECURITY;

-- Policy per utenti autenticati
CREATE POLICY "Users manage own conversations"
  ON document_conversations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own messages"
  ON document_messages FOR ALL
  USING (
    conversation_id IN (
      SELECT id FROM document_conversations WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM document_conversations WHERE user_id = auth.uid()
    )
  );

-- Service role bypass (per API server-side)
CREATE POLICY "Service role full access conversations"
  ON document_conversations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access messages"
  ON document_messages FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 4. Trigger per aggiornare updated_at e message_count
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS trigger AS $$
BEGIN
  UPDATE document_conversations
  SET updated_at = now(),
      message_count = (
        SELECT count(*) FROM document_messages WHERE conversation_id = NEW.conversation_id
      )
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_conversation_on_message
  AFTER INSERT ON document_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();

-- 5. Cleanup function (TTL 90 giorni per conversazioni inattive)
CREATE OR REPLACE FUNCTION cleanup_old_conversations(days_ttl integer DEFAULT 90)
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM document_conversations
  WHERE updated_at < now() - (days_ttl || ' days')::interval;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
