-- 025: Task approval metadata
-- Aggiunge campi per audit trail del routing: livello approvazione e dipartimenti consultati.
-- Auto-populated dal decision tree YAML quando --routing è validato.

ALTER TABLE company_tasks
  ADD COLUMN IF NOT EXISTS approval_level TEXT,
  ADD COLUMN IF NOT EXISTS consult_depts TEXT[] DEFAULT '{}';

COMMENT ON COLUMN company_tasks.approval_level IS 'Livello approvazione dal decision tree: L1, L2, L3, L4, L1_immediate';
COMMENT ON COLUMN company_tasks.consult_depts IS 'Dipartimenti da consultare, estratti dal decision tree YAML';
