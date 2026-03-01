-- ═══════════════════════════════════════════════════════════════════════
-- 007: Popola related_institutes per il Codice Civile
--
-- Problema: il pipeline di load salva related_institutes = '{}' per tutti
-- gli articoli. Questo impedisce a getArticlesByInstitute() di trovare
-- qualsiasi articolo. Fix: mapping manuale per range di articoli.
--
-- Logica: estrae il numero dall'article_reference ("Art. 1341" → 1341)
-- e assegna istituti per range noti del Codice Civile Libro IV.
-- ═══════════════════════════════════════════════════════════════════════

-- Helper: estrae il numero dall'article_reference
-- Gestisce "Art. 1341", "Art. 1341-bis", etc.
CREATE OR REPLACE FUNCTION extract_article_number(ref text)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(split_part(ref, '-', 1), '[^0-9]', '', 'g'), '')::integer;
$$;

-- ═══ LIBRO IV, TITOLO I: Delle obbligazioni in generale ═══

-- Art. 1173-1217: Obbligazioni, adempimento
UPDATE legal_articles
SET related_institutes = ARRAY['obbligazione', 'adempimento']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1173 AND 1217;

-- Art. 1218-1229: Inadempimento, mora, risarcimento, esonero responsabilità
UPDATE legal_articles
SET related_institutes = ARRAY['inadempimento', 'mora', 'risarcimento']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1218 AND 1229;

-- Art. 1229 specifico: patto di esonero responsabilità (anche clausole_vessatorie)
UPDATE legal_articles
SET related_institutes = ARRAY['inadempimento', 'clausole_vessatorie', 'nullità']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) = 1229;

-- Art. 1230-1320: Modi di estinzione, cessione crediti
UPDATE legal_articles
SET related_institutes = ARRAY['obbligazione']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1230 AND 1320;

-- ═══ LIBRO IV, TITOLO II: Dei contratti in generale ═══

-- Art. 1321-1324: Requisiti del contratto
UPDATE legal_articles
SET related_institutes = ARRAY['contratto', 'requisiti_contratto']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1321 AND 1324;

-- Art. 1325-1335: Consenso, proposta, accettazione
UPDATE legal_articles
SET related_institutes = ARRAY['contratto', 'consenso', 'proposta', 'accettazione', 'conclusione_contratto']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1325 AND 1335;

-- Art. 1336-1340: Condizioni generali di contratto
UPDATE legal_articles
SET related_institutes = ARRAY['contratto', 'clausole_vessatorie']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1336 AND 1340;

-- ★ Art. 1341-1342: CLAUSOLE VESSATORIE (doppia firma)
UPDATE legal_articles
SET related_institutes = ARRAY['clausole_vessatorie', 'contratto', 'nullità']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1341 AND 1342;

-- Art. 1343-1352: Causa, oggetto del contratto
UPDATE legal_articles
SET related_institutes = ARRAY['contratto', 'causa', 'oggetto_contratto']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1343 AND 1352;

-- Art. 1353-1361: Condizione, termine
UPDATE legal_articles
SET related_institutes = ARRAY['contratto', 'condizione', 'termine']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1353 AND 1361;

-- ★ Art. 1362-1371: INTERPRETAZIONE DEL CONTRATTO
UPDATE legal_articles
SET related_institutes = ARRAY['interpretazione_contratto', 'contratto', 'buona_fede']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1362 AND 1371;

-- Art. 1372-1381: Effetti del contratto
UPDATE legal_articles
SET related_institutes = ARRAY['effetti_contratto', 'contratto']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1372 AND 1381;

-- Art. 1382-1384: Clausola penale
UPDATE legal_articles
SET related_institutes = ARRAY['clausola_penale', 'contratto']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1382 AND 1384;

-- Art. 1385-1386: Caparra
UPDATE legal_articles
SET related_institutes = ARRAY['caparra_confirmatoria', 'caparra_penitenziale', 'contratto']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1385 AND 1386;

-- Art. 1387-1405: Rappresentanza
UPDATE legal_articles
SET related_institutes = ARRAY['rappresentanza', 'mandato', 'procura']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1387 AND 1405;

-- Art. 1406-1413: Cessione del contratto
UPDATE legal_articles
SET related_institutes = ARRAY['contratto', 'effetti_contratto']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1406 AND 1413;

-- Art. 1414-1417: Simulazione
UPDATE legal_articles
SET related_institutes = ARRAY['simulazione', 'contratto', 'nullità']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1414 AND 1417;

-- ★ Art. 1418-1424: NULLITÀ
UPDATE legal_articles
SET related_institutes = ARRAY['nullità', 'contratto', 'annullabilità']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1418 AND 1424;

-- Art. 1425-1446: Annullabilità (errore, dolo, violenza)
UPDATE legal_articles
SET related_institutes = ARRAY['annullabilità', 'contratto', 'consenso']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1425 AND 1446;

-- Art. 1447-1452: Rescissione
UPDATE legal_articles
SET related_institutes = ARRAY['rescissione', 'contratto']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1447 AND 1452;

-- Art. 1453-1462: Risoluzione per inadempimento
UPDATE legal_articles
SET related_institutes = ARRAY['risoluzione', 'contratto', 'inadempimento']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1453 AND 1462;

-- Art. 1463-1466: Impossibilità sopravvenuta
UPDATE legal_articles
SET related_institutes = ARRAY['risoluzione', 'contratto']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1463 AND 1466;

-- Art. 1467-1469: Eccessiva onerosità
UPDATE legal_articles
SET related_institutes = ARRAY['risoluzione', 'contratto']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1467 AND 1469;

-- ═══ LIBRO IV, TITOLO III: Dei singoli contratti ═══

-- Art. 1470-1536: Vendita (generale)
UPDATE legal_articles
SET related_institutes = ARRAY['vendita', 'compravendita']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1470 AND 1536;

-- Art. 1490-1497: Garanzia per vizi
UPDATE legal_articles
SET related_institutes = ARRAY['vendita', 'vizi_cosa_venduta', 'garanzia_evizione']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1490 AND 1497;

-- ★ Art. 1537-1541: Vendita a corpo / a misura
UPDATE legal_articles
SET related_institutes = ARRAY['vendita_a_corpo', 'vendita_a_misura', 'rettifica_prezzo', 'vendita']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1537 AND 1541;

-- Art. 1542-1547: Vendita di eredità
UPDATE legal_articles
SET related_institutes = ARRAY['vendita']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1542 AND 1547;

-- Art. 1548-1570: Permuta, estimatorio, somministrazione
UPDATE legal_articles
SET related_institutes = ARRAY['contratto']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1548 AND 1570;

-- Art. 1571-1606: Locazione
UPDATE legal_articles
SET related_institutes = ARRAY['locazione', 'obblighi_locatore', 'obblighi_conduttore']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1571 AND 1606;

-- Art. 1607-1614: Sublocazione
UPDATE legal_articles
SET related_institutes = ARRAY['locazione', 'sublocazione']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1607 AND 1614;

-- Art. 1615-1654: Affitto
UPDATE legal_articles
SET related_institutes = ARRAY['locazione']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1615 AND 1654;

-- Art. 1655-1677: Appalto
UPDATE legal_articles
SET related_institutes = ARRAY['appalto']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1655 AND 1677;

-- ★ Art. 1667-1668: Difformità e vizi dell'opera
UPDATE legal_articles
SET related_institutes = ARRAY['appalto', 'difformità_vizi', 'collaudo']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1667 AND 1668;

-- Art. 1669: Rovina e difetti di edifici
UPDATE legal_articles
SET related_institutes = ARRAY['appalto', 'difformità_vizi', 'responsabilità_extracontrattuale']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) = 1669;

-- Art. 1703-1741: Mandato
UPDATE legal_articles
SET related_institutes = ARRAY['mandato', 'procura', 'rappresentanza']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1703 AND 1741;

-- Art. 1803-1812: Comodato
UPDATE legal_articles
SET related_institutes = ARRAY['comodato']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1803 AND 1812;

-- Art. 1813-1822: Mutuo
UPDATE legal_articles
SET related_institutes = ARRAY['mutuo', 'interessi']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1813 AND 1822;

-- Art. 1815: Usura
UPDATE legal_articles
SET related_institutes = ARRAY['mutuo', 'interessi', 'usura']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) = 1815;

-- Art. 1882-1932: Assicurazione
UPDATE legal_articles
SET related_institutes = ARRAY['assicurazione', 'polizza']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1882 AND 1932;

-- Art. 1936-1957: Fideiussione
UPDATE legal_articles
SET related_institutes = ARRAY['fideiussione', 'garanzia_personale']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1936 AND 1957;

-- ═══ LIBRO IV, TITOLO IX: Dei fatti illeciti ═══

-- Art. 2043-2059: Responsabilità extracontrattuale
UPDATE legal_articles
SET related_institutes = ARRAY['responsabilità_extracontrattuale', 'fatto_illecito', 'danno', 'risarcimento']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2043 AND 2059;

-- ═══ LIBRO VI: Della tutela dei diritti ═══

-- Art. 2643-2696: Trascrizione
UPDATE legal_articles
SET related_institutes = ARRAY['trascrizione', 'vendita_immobiliare']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2643 AND 2696;

-- Art. 2808-2899: Ipoteca
UPDATE legal_articles
SET related_institutes = ARRAY['ipoteca', 'garanzia_reale']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2808 AND 2899;

-- Art. 2784-2807: Pegno
UPDATE legal_articles
SET related_institutes = ARRAY['pegno', 'garanzia_reale']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2784 AND 2807;

-- Art. 2934-2969: Prescrizione e decadenza
UPDATE legal_articles
SET related_institutes = ARRAY['prescrizione', 'decadenza', 'termini']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2934 AND 2969;

-- ═══ LIBRO I: Persone e famiglia (primi articoli fondamentali) ═══

-- Art. 1-10: Persone fisiche
UPDATE legal_articles
SET related_institutes = ARRAY['contratto']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1 AND 10
  AND related_institutes = '{}';

-- ═══ LIBRO III: Proprietà ═══

-- Art. 832-951: Proprietà
UPDATE legal_articles
SET related_institutes = ARRAY['vendita_immobiliare']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 832 AND 951
  AND related_institutes = '{}';

-- ═══ LIBRO V: Società ═══

-- Art. 2247-2510: Società
UPDATE legal_articles
SET related_institutes = ARRAY['srl', 'spa', 'società_semplice']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2247 AND 2510
  AND related_institutes = '{}';

-- Art. 2462-2483: SRL specifico
UPDATE legal_articles
SET related_institutes = ARRAY['srl']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2462 AND 2483;

-- Art. 2325-2461: SPA specifico
UPDATE legal_articles
SET related_institutes = ARRAY['spa']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2325 AND 2461;

-- Art. 2222-2238: Contratto d'opera
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_autonomo', 'contratto_opera']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2222 AND 2238;

-- ═══ CODICE DEL CONSUMO (D.Lgs. 206/2005) ═══

-- Art. 33-38: Clausole vessatorie B2C
UPDATE legal_articles
SET related_institutes = ARRAY['clausole_abusive', 'tutela_consumatore', 'clausole_vessatorie', 'nullità']
WHERE law_source ILIKE '%206/2005%'
  AND extract_article_number(article_reference) BETWEEN 33 AND 38;

-- Art. 45-67: Contratti a distanza, diritto di recesso
UPDATE legal_articles
SET related_institutes = ARRAY['tutela_consumatore']
WHERE law_source ILIKE '%206/2005%'
  AND extract_article_number(article_reference) BETWEEN 45 AND 67
  AND related_institutes = '{}';

-- Art. 128-135: Garanzia legale di conformità
UPDATE legal_articles
SET related_institutes = ARRAY['tutela_consumatore', 'vizi_cosa_venduta', 'vendita']
WHERE law_source ILIKE '%206/2005%'
  AND extract_article_number(article_reference) BETWEEN 128 AND 135;

-- ═══ VERIFICA FINALE ═══

-- Conta articoli con almeno un istituto
-- SELECT COUNT(*) as with_institutes FROM legal_articles WHERE related_institutes != '{}';
-- SELECT COUNT(*) as total FROM legal_articles;

-- Verifica articoli critici
-- SELECT article_reference, related_institutes
-- FROM legal_articles
-- WHERE law_source = 'Codice Civile'
--   AND extract_article_number(article_reference) IN (1229, 1341, 1342, 1362, 1367, 1371, 1418, 1419)
-- ORDER BY extract_article_number(article_reference);

-- Cleanup: drop helper function (optional, lasciala per future migrazioni)
-- DROP FUNCTION IF EXISTS extract_article_number;
