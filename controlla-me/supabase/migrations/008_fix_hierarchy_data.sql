-- Fix: normalizza i valori hierarchy per eliminare duplicati nell'albero di navigazione.
-- Problema: alcuni articoli hanno hierarchy.book = "Libro I" e altri "Libro I — Delle persone e della famiglia"
-- Questo causa nodi duplicati nella navigazione.

-- 1. Normalizza book: assicurati che tutti i Libri abbiano il formato "Libro X — Descrizione"
UPDATE public.legal_articles
SET hierarchy = jsonb_set(
  hierarchy,
  '{book}',
  '"Libro I - Delle persone e della famiglia"'
)
WHERE source_id = 'codice_civile'
  AND hierarchy->>'book' IS NOT NULL
  AND hierarchy->>'book' LIKE 'Libro I%'
  AND hierarchy->>'book' NOT LIKE '%Delle persone%';

UPDATE public.legal_articles
SET hierarchy = jsonb_set(
  hierarchy,
  '{book}',
  '"Libro II - Delle successioni"'
)
WHERE source_id = 'codice_civile'
  AND hierarchy->>'book' IS NOT NULL
  AND hierarchy->>'book' LIKE 'Libro II%'
  AND hierarchy->>'book' NOT LIKE '%successioni%';

UPDATE public.legal_articles
SET hierarchy = jsonb_set(
  hierarchy,
  '{book}',
  '"Libro III - Della proprieta"'
)
WHERE source_id = 'codice_civile'
  AND hierarchy->>'book' IS NOT NULL
  AND hierarchy->>'book' LIKE 'Libro III%'
  AND hierarchy->>'book' NOT LIKE '%proprieta%';

UPDATE public.legal_articles
SET hierarchy = jsonb_set(
  hierarchy,
  '{book}',
  '"Libro IV - Delle obbligazioni"'
)
WHERE source_id = 'codice_civile'
  AND hierarchy->>'book' IS NOT NULL
  AND hierarchy->>'book' LIKE 'Libro IV%'
  AND hierarchy->>'book' NOT LIKE '%obbligazioni%';

UPDATE public.legal_articles
SET hierarchy = jsonb_set(
  hierarchy,
  '{book}',
  '"Libro V - Del lavoro"'
)
WHERE source_id = 'codice_civile'
  AND hierarchy->>'book' IS NOT NULL
  AND hierarchy->>'book' LIKE 'Libro V%'
  AND hierarchy->>'book' NOT LIKE '%lavoro%'
  AND hierarchy->>'book' NOT LIKE 'Libro VI%';

UPDATE public.legal_articles
SET hierarchy = jsonb_set(
  hierarchy,
  '{book}',
  '"Libro VI - Della tutela dei diritti"'
)
WHERE source_id = 'codice_civile'
  AND hierarchy->>'book' IS NOT NULL
  AND hierarchy->>'book' LIKE 'Libro VI%'
  AND hierarchy->>'book' NOT LIKE '%tutela%';

-- 2. Rimuovi eventuali valori hierarchy con chiavi spurie (es. source name come valore)
-- Rimuovi la chiave 'book' se il valore non inizia con "Libro"
UPDATE public.legal_articles
SET hierarchy = hierarchy - 'book'
WHERE source_id = 'codice_civile'
  AND hierarchy->>'book' IS NOT NULL
  AND hierarchy->>'book' NOT LIKE 'Libro%';

-- 3. Assicurati che gli articoli senza gerarchia abbiano almeno hierarchy = '{}'
UPDATE public.legal_articles
SET hierarchy = '{}'::jsonb
WHERE hierarchy IS NULL;

-- Verifica risultato
SELECT hierarchy->>'book' as book, count(*)
FROM public.legal_articles
WHERE source_id = 'codice_civile' AND hierarchy->>'book' IS NOT NULL
GROUP BY hierarchy->>'book'
ORDER BY hierarchy->>'book';
