-- 023: Task Enhancements — Tag, beneficio atteso, outcome tracking, numerazione sequenziale
-- tags: array di stringhe free-form per categorizzare il task (es. ['rag', 'performance'])
-- expected_benefit: beneficio concreto atteso (max 200 char, obbligatorio nelle nuove creazioni)
-- benefit_status: valutato da CME + dipartimento owner dopo il done
-- benefit_notes: annotazione libera sull'esito del beneficio
-- suggested_next: hint testuale per il task successivo (creazione rimane manuale)
-- seq_num: numerazione sequenziale per leggibilità umana (non sostituisce UUID)

CREATE SEQUENCE IF NOT EXISTS company_tasks_seq_num;

ALTER TABLE company_tasks
  ADD COLUMN IF NOT EXISTS seq_num INTEGER DEFAULT nextval('company_tasks_seq_num'),
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS expected_benefit TEXT,
  ADD COLUMN IF NOT EXISTS benefit_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS benefit_notes TEXT,
  ADD COLUMN IF NOT EXISTS suggested_next TEXT;

CREATE INDEX IF NOT EXISTS idx_company_tasks_tags
  ON company_tasks USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_company_tasks_benefit_status
  ON company_tasks(benefit_status)
  WHERE benefit_status != 'pending';

CREATE INDEX IF NOT EXISTS idx_company_tasks_seq_num
  ON company_tasks(seq_num);
