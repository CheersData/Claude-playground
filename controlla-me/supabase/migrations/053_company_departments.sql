-- 053_company_departments.sql
-- Tabella company_departments: registry dinamico dei dipartimenti.
-- Prerequisito per creator che creano dipartimenti custom a runtime.
-- I dipartimenti storici (protected=true) vengono seeded qui.
-- Dipende da: auth.users (FK su owner_id, created_by)

-- ─── Tabella ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_departments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,              -- slug: "ufficio-legale", "trading", "my-custom-dept"
  display_name text NOT NULL,                     -- label leggibile: "Ufficio Legale"
  description text,                               -- descrizione breve
  mission     text,                               -- mission statement (da department.md)
  owner_id    uuid REFERENCES auth.users(id),     -- proprietario (boss per i protetti, creator per i custom)
  created_by  uuid REFERENCES auth.users(id),     -- chi lo ha creato
  protected   boolean NOT NULL DEFAULT false,     -- true = non cancellabile/modificabile da creator
  config      jsonb DEFAULT '{}'::jsonb,          -- configurazione flessibile (emoji, type, vision, priorities, kpis)
  agents      jsonb DEFAULT '[]'::jsonb,          -- array di {id, label, filePath}
  runbooks    jsonb DEFAULT '[]'::jsonb,          -- array di {id, label, filePath}
  status      jsonb DEFAULT '{}'::jsonb,          -- stato runtime (mirrors status.json)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Index su name per lookup veloci
CREATE INDEX IF NOT EXISTS idx_company_departments_name ON company_departments(name);

-- Trigger auto-update updated_at
CREATE OR REPLACE FUNCTION update_company_departments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_company_departments_updated_at ON company_departments;
CREATE TRIGGER trg_company_departments_updated_at
  BEFORE UPDATE ON company_departments
  FOR EACH ROW
  EXECUTE FUNCTION update_company_departments_updated_at();

-- ─── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE company_departments ENABLE ROW LEVEL SECURITY;

-- service_role: full access
CREATE POLICY "service_role_full_access" ON company_departments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- authenticated: tutti possono leggere tutti i dipartimenti
CREATE POLICY "authenticated_select" ON company_departments
  FOR SELECT
  TO authenticated
  USING (true);

-- authenticated: possono creare dipartimenti non protetti
CREATE POLICY "authenticated_insert" ON company_departments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT protected
    AND created_by = auth.uid()
  );

-- authenticated: possono aggiornare solo i propri dipartimenti non protetti
CREATE POLICY "authenticated_update" ON company_departments
  FOR UPDATE
  TO authenticated
  USING (
    NOT protected
    AND created_by = auth.uid()
  )
  WITH CHECK (
    NOT protected
    AND created_by = auth.uid()
  );

-- authenticated: possono eliminare solo i propri dipartimenti non protetti
CREATE POLICY "authenticated_delete" ON company_departments
  FOR DELETE
  TO authenticated
  USING (
    NOT protected
    AND created_by = auth.uid()
  );

-- ─── Seed dipartimenti storici (protected = true) ─────────────────────────────
-- owner_id e created_by = NULL per i dipartimenti storici (sono del sistema, non di un utente)

INSERT INTO company_departments (name, display_name, description, mission, protected, config) VALUES
  ('ufficio-legale', 'Ufficio Legale', 'Analisi legale AI con 7 agenti specializzati',
    'Gestione e ottimizzazione dei 7 agenti runtime che analizzano documenti legali per i cittadini.',
    true, '{"emoji":"⚖️","type":"revenue","vision":"Analisi legale best-in-class Italia con almeno 2 verticali."}'),

  ('trading', 'Ufficio Trading', 'Trading automatizzato su azioni US e ETF',
    'Trading automatizzato su azioni US e ETF via Alpaca Markets per sostenibilità finanziaria.',
    true, '{"emoji":"📈","type":"revenue","vision":"Trading live profittevole con Sharpe > 1.0."}'),

  ('integration', 'Ufficio Integrazione', 'Connettori OAuth2 per PMI italiane',
    'Integrazione dati business per PMI italiane: connettori OAuth2 verso piattaforme esterne.',
    true, '{"emoji":"🔗","type":"revenue","vision":"Hub di integrazione per PMI italiane con almeno 3 connettori attivi."}'),

  ('music', 'Ufficio Musica', 'Label virtuale AI-powered per artisti emergenti',
    'Label virtuale AI-powered: analisi audio, trend scouting, direzione artistica per artisti emergenti.',
    true, '{"emoji":"🎵","type":"revenue","vision":"Pipeline completa dall''upload del demo al piano di release."}'),

  ('architecture', 'Architecture', 'Progettazione soluzioni tecniche scalabili',
    'Progettazione soluzioni tecniche scalabili e cost-aware.',
    true, '{"emoji":"🏛️","type":"staff","vision":"Config-driven infrastruttura che supporta N verticali."}'),

  ('data-engineering', 'Data Engineering', 'Pipeline dati legislativi e corpus',
    'Gestione pipeline dati legislativi: connessione a fonti esterne, parsing, validazione e caricamento.',
    true, '{"emoji":"🔌","type":"staff","vision":"Corpus legislativo completo per ogni verticale attivo."}'),

  ('quality-assurance', 'Quality Assurance', 'Test e validazione continua',
    'Validazione continua del sistema: type check, lint, test manuali e testbook.',
    true, '{"emoji":"🧪","type":"staff","vision":"Coverage 100% su infrastruttura core."}'),

  ('finance', 'Finance', 'Monitoraggio costi API e P&L',
    'Monitoraggio costi API in tempo reale. Alert quando i costi superano le soglie.',
    true, '{"emoji":"💰","type":"staff","vision":"Costo per analisi < $0.02. Dashboard P&L completa."}'),

  ('operations', 'Operations', 'Monitoring e dashboard della virtual company',
    'Monitoring e dashboard della virtual company. Punto di controllo: /ops.',
    true, '{"emoji":"📡","type":"staff","vision":"Ops completamente autonoma: alerting automatico."}'),

  ('security', 'Security', 'Audit e protezione dati',
    'Proteggere Poimandres e i suoi utenti. Piattaforma AI = dati sensibili.',
    true, '{"emoji":"🛡️","type":"staff","vision":"Compliance automatizzata: audit security schedulati."}'),

  ('strategy', 'Strategy', 'Vision e opportunità di business',
    'Scansiona mercato, competitor e tecnologie AI emergenti per identificare opportunità.',
    true, '{"emoji":"🎯","type":"staff","vision":"Piattaforma madre con almeno 2 verticali attivi."}'),

  ('marketing', 'Marketing', 'Market intelligence e acquisizione',
    'Radar del mercato. Ascolta la domanda reale, valida opportunità.',
    true, '{"emoji":"📣","type":"staff","vision":"Traffico organico >5.000 sessioni/mese."}'),

  ('protocols', 'Protocols', 'Governance e decision trees',
    'Governance aziendale: decision trees, routing richieste, audit decisioni.',
    true, '{"emoji":"📋","type":"staff","vision":"Processo decisionale completamente tracciabile."}'),

  ('ux-ui', 'UX/UI', 'Design system e accessibilità',
    'Design, implementazione e mantenimento dell''esperienza utente. Accessibilità WCAG 2.1 AA.',
    true, '{"emoji":"🎨","type":"staff","vision":"Design system completo e riusabile per N verticali."}'),

  ('acceleration', 'Acceleration', 'Performance e pulizia codebase',
    'Velocità: performance dipartimenti e pulizia codebase.',
    true, '{"emoji":"🚀","type":"staff","vision":"Ogni dipartimento opera al massimo della velocità."}')

ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  mission = EXCLUDED.mission,
  protected = EXCLUDED.protected,
  config = EXCLUDED.config,
  updated_at = now();
