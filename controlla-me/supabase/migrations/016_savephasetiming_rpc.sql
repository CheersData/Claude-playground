-- Migration 016: update_phase_timing — jsonb_set atomico (ADR-005 / TD-1)
--
-- Sostituisce il doppio roundtrip SELECT + UPDATE in savePhaseTiming()
-- con un singolo UPDATE atomico via jsonb_set.
-- Risparmio: 4 roundtrip per analisi, -400-800ms latenza, race condition eliminata.
--
-- Caller: lib/analysis-cache.ts → supabase.rpc('update_phase_timing', {...})

CREATE OR REPLACE FUNCTION update_phase_timing(
  p_session_id TEXT,
  p_phase      TEXT,
  p_timing     JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE analysis_sessions
  SET
    phase_timing = jsonb_set(
      COALESCE(phase_timing, '{}'::jsonb),
      ARRAY[p_phase],
      p_timing,
      true  -- create key if not exists
    ),
    updated_at = NOW()
  WHERE session_id = p_session_id;
END;
$$;

-- Grant: solo service_role (come le altre RPC della sessione)
REVOKE ALL ON FUNCTION update_phase_timing(TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_phase_timing(TEXT, TEXT, JSONB) TO service_role;
