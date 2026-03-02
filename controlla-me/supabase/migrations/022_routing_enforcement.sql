-- 022: Routing Enforcement — Audit trail routing per company_tasks
-- Aggiunge 3 colonne per tracciare il decision-tree routing di ogni task.
-- routing: classificazione usata (es. 'feature-request:medium', 'trading-operations:routine')
-- routing_exempt: true se il task ha bypassato l'obbligo di routing (escape hatch)
-- routing_reason: motivo del bypass (obbligatorio quando routing_exempt = true)

ALTER TABLE company_tasks
  ADD COLUMN IF NOT EXISTS routing TEXT,
  ADD COLUMN IF NOT EXISTS routing_exempt BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS routing_reason TEXT;

-- Indice per analisi audit: quanti task sono stati creati senza routing?
CREATE INDEX IF NOT EXISTS idx_company_tasks_routing ON company_tasks(routing)
  WHERE routing IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_company_tasks_routing_exempt ON company_tasks(routing_exempt)
  WHERE routing_exempt = TRUE;
