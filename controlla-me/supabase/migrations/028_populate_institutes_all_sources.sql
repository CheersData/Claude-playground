-- ═══════════════════════════════════════════════════════════════════════
-- 028: Popola related_institutes per TUTTE le fonti del corpus
--
-- Problema: la migration 012 copre solo il Codice Civile (e parzialmente
-- il Codice del Consumo). Tutte le altre fonti (~80% del corpus) hanno
-- related_institutes = '{}'. Questo impedisce all'institute-based search
-- di trovare articoli pertinenti da CPC, Codice Penale, D.Lgs., ecc.
--
-- Fix: mapping completo per fonte, basato sulla struttura normativa.
-- Stessa tecnica della migration 012: range-based UPDATE con
-- extract_article_number().
--
-- PREREQUISITO: migration 012 (funzione extract_article_number + CC base)
-- ═══════════════════════════════════════════════════════════════════════

-- Assicura che la funzione helper esista
CREATE OR REPLACE FUNCTION extract_article_number(ref text)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(split_part(ref, '-', 1), '[^0-9]', '', 'g'), '')::integer;
$$;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ PARTE A: CODICE CIVILE — Gap fill                                    ║
-- ║ Copre Libri/articoli NON coperti dalla migration 012                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ═══ LIBRO I: Delle persone e della famiglia ═══

-- Art. 79-142: Matrimonio
UPDATE legal_articles
SET related_institutes = ARRAY['matrimonio']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 79 AND 142
  AND related_institutes = '{}';

-- Art. 143-166-bis: Diritti e doveri dei coniugi
UPDATE legal_articles
SET related_institutes = ARRAY['matrimonio', 'obblighi_coniugali', 'separazione']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 143 AND 166
  AND related_institutes = '{}';

-- Art. 167-230: Regime patrimoniale della famiglia
UPDATE legal_articles
SET related_institutes = ARRAY['comunione_legale', 'separazione_beni', 'fondo_patrimoniale']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 167 AND 230
  AND related_institutes = '{}';

-- Art. 231-290: Filiazione
UPDATE legal_articles
SET related_institutes = ARRAY['filiazione']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 231 AND 290
  AND related_institutes = '{}';

-- Art. 315-337: Responsabilità genitoriale
UPDATE legal_articles
SET related_institutes = ARRAY['responsabilita_genitoriale', 'affidamento']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 315 AND 337
  AND related_institutes = '{}';

-- Art. 343-413: Tutela, curatela, amministrazione di sostegno
UPDATE legal_articles
SET related_institutes = ARRAY['tutela', 'amministrazione_sostegno']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 343 AND 413
  AND related_institutes = '{}';

-- Art. 433-455: Alimenti
UPDATE legal_articles
SET related_institutes = ARRAY['alimenti', 'mantenimento']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 433 AND 455
  AND related_institutes = '{}';


-- ═══ LIBRO II: Delle successioni (CRITICO — TC34, TC70) ═══

-- Art. 456-535: Apertura successione, accettazione, rinuncia
UPDATE legal_articles
SET related_institutes = ARRAY['successione', 'eredita', 'accettazione_eredita', 'rinuncia_eredita']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 456 AND 535
  AND related_institutes = '{}';

-- ★ Art. 536-564: Legittimari (TC34!)
UPDATE legal_articles
SET related_institutes = ARRAY['legittimari', 'quota_legittima', 'azione_riduzione', 'successione']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 536 AND 564;

-- Art. 565-586: Successione legittima
UPDATE legal_articles
SET related_institutes = ARRAY['successione_legittima', 'successione']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 565 AND 586
  AND related_institutes = '{}';

-- Art. 587-623: Testamento (TC70!)
UPDATE legal_articles
SET related_institutes = ARRAY['testamento', 'testamento_olografo', 'testamento_pubblico', 'successione']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 587 AND 623;

-- ★ Art. 606 specifico: Nullità del testamento (TC70!)
UPDATE legal_articles
SET related_institutes = ARRAY['testamento', 'testamento_olografo', 'nullita', 'annullabilita', 'successione']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) = 606;

-- Art. 624-632: Capacità, indegnità
UPDATE legal_articles
SET related_institutes = ARRAY['testamento', 'successione']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 624 AND 632
  AND related_institutes = '{}';

-- Art. 649-712: Legati, fedecommesso, sostituzione
UPDATE legal_articles
SET related_institutes = ARRAY['legato', 'successione']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 649 AND 712
  AND related_institutes = '{}';

-- Art. 713-768: Divisione ereditaria, collazione
UPDATE legal_articles
SET related_institutes = ARRAY['divisione_ereditaria', 'collazione', 'successione']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 713 AND 768;

-- Art. 769-809: Donazioni
UPDATE legal_articles
SET related_institutes = ARRAY['donazione', 'successione']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 769 AND 809
  AND related_institutes = '{}';


-- ═══ LIBRO III: Diritti reali — gap fill ═══

-- Art. 952-977: Superficie
UPDATE legal_articles
SET related_institutes = ARRAY['diritto_superficie']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 952 AND 977
  AND related_institutes = '{}';

-- Art. 978-1020: Usufrutto, uso, abitazione
UPDATE legal_articles
SET related_institutes = ARRAY['usufrutto']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 978 AND 1020
  AND related_institutes = '{}';

-- Art. 1027-1099: Servitù prediali
UPDATE legal_articles
SET related_institutes = ARRAY['servitu_prediale']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1027 AND 1099
  AND related_institutes = '{}';

-- ★ Art. 1100-1139: Comunione (TC68!)
UPDATE legal_articles
SET related_institutes = ARRAY['comunione', 'divisione']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1100 AND 1139;

-- ★ Art. 1111 specifico: Scioglimento comunione (TC68!)
UPDATE legal_articles
SET related_institutes = ARRAY['comunione', 'divisione', 'scioglimento_comunione']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) = 1111;

-- Art. 1140-1172: Possesso, usucapione
UPDATE legal_articles
SET related_institutes = ARRAY['possesso', 'usucapione']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1140 AND 1172
  AND related_institutes = '{}';


-- ═══ LIBRO IV: Specifiche override su articoli già coperti da 012 ═══

-- ★ Art. 1176: Diligenza del professionista (TC41, TC45!)
UPDATE legal_articles
SET related_institutes = ARRAY['obbligazione', 'adempimento', 'responsabilita_professionale', 'diligenza']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) = 1176;

-- ★ Art. 1277-1279: Obbligazioni valutarie (TC59!)
UPDATE legal_articles
SET related_institutes = ARRAY['obbligazione', 'obbligazione_valutaria']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1277 AND 1279;

-- ★ Art. 1456: Clausola risolutiva espressa (TC39!)
UPDATE legal_articles
SET related_institutes = ARRAY['risoluzione', 'contratto', 'inadempimento', 'clausola_risolutiva_espressa']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) = 1456;

-- Art. 1958-2042: Transazione, cessio bonorum, anticresi
UPDATE legal_articles
SET related_institutes = ARRAY['transazione']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 1958 AND 2042
  AND related_institutes = '{}';


-- ═══ LIBRO V: Del lavoro — CRITICO (TC33!) ═══

-- Art. 2060-2093: Disciplina del lavoro subordinato nell'impresa
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2060 AND 2093
  AND related_institutes = '{}';

-- Art. 2094-2113: Contratto individuale di lavoro
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'contratto_lavoro']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2094 AND 2113;

-- ★ Art. 2110: Periodo di comporto / malattia (TC33!)
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'contratto_lavoro', 'periodo_di_comporto', 'malattia_lavoro']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) = 2110;

-- ★ Art. 2118: Preavviso
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'contratto_lavoro', 'preavviso', 'licenziamento']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) = 2118;

-- ★ Art. 2119: Giusta causa (TC33!)
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'contratto_lavoro', 'giusta_causa', 'licenziamento']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) = 2119;

-- Art. 2120: TFR
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'trattamento_fine_rapporto']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) = 2120;

-- Art. 2121-2134: Disposizioni varie lavoro subordinato
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2121 AND 2134
  AND related_institutes = '{}';

-- Art. 2135-2221: Lavoro agricolo, a domicilio, domestico
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2135 AND 2221
  AND related_institutes = '{}';

-- ★ Art. 2291-2312: SNC — Società in nome collettivo (TC29!)
UPDATE legal_articles
SET related_institutes = ARRAY['snc', 'responsabilita_solidale_socio', 'societa_di_persone']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2291 AND 2312;

-- Art. 2313-2324: SAS — Società in accomandita semplice
UPDATE legal_articles
SET related_institutes = ARRAY['sas', 'societa_di_persone']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2313 AND 2324;

-- Art. 2511-2545: Cooperative
UPDATE legal_articles
SET related_institutes = ARRAY['cooperativa']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2511 AND 2545
  AND related_institutes = '{}';

-- Art. 2555-2574: Azienda, trasferimento, usufrutto
UPDATE legal_articles
SET related_institutes = ARRAY['azienda', 'cessione_azienda']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2555 AND 2574
  AND related_institutes = '{}';

-- Art. 2575-2642: Proprietà intellettuale, marchi, brevetti
UPDATE legal_articles
SET related_institutes = ARRAY['proprieta_intellettuale']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2575 AND 2642
  AND related_institutes = '{}';


-- ═══ LIBRO VI: Prove — CRITICO (TC52!) ═══

-- Art. 2697-2698: Onere della prova
UPDATE legal_articles
SET related_institutes = ARRAY['prova', 'onere_prova']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2697 AND 2698;

-- Art. 2699-2720: Prova documentale (atti pubblici, scrittura privata)
UPDATE legal_articles
SET related_institutes = ARRAY['prova', 'prova_documentale', 'atto_pubblico', 'scrittura_privata']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2699 AND 2720;

-- ★ Art. 2721-2726: Prova testimoniale e suoi limiti (TC52!)
UPDATE legal_articles
SET related_institutes = ARRAY['prova', 'prova_testimoniale']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2721 AND 2726;

-- Art. 2727-2739: Presunzioni, confessione, giuramento
UPDATE legal_articles
SET related_institutes = ARRAY['prova', 'presunzione']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2727 AND 2739
  AND related_institutes = '{}';

-- Art. 2740-2783: Responsabilità patrimoniale, privilegi, cause prelazione
UPDATE legal_articles
SET related_institutes = ARRAY['responsabilita_patrimoniale', 'privilegio']
WHERE law_source = 'Codice Civile'
  AND extract_article_number(article_reference) BETWEEN 2740 AND 2783
  AND related_institutes = '{}';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ PARTE B: CODICE DI PROCEDURA CIVILE (CPC)                           ║
-- ║ 5 test FAIL/BORDERLINE: TC22, TC23, TC24, TC27, TC28                 ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ═══ LIBRO I: Disposizioni generali ═══

-- Art. 1-30: Giurisdizione e competenza
UPDATE legal_articles
SET related_institutes = ARRAY['giurisdizione', 'competenza']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 1 AND 30;

-- Art. 31-44: Competenza per connessione, riunione
UPDATE legal_articles
SET related_institutes = ARRAY['competenza', 'connessione']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 31 AND 44;

-- Art. 75-81: Legittimazione ad agire, capacità processuale
UPDATE legal_articles
SET related_institutes = ARRAY['legittimazione_processuale']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 75 AND 81;

-- Art. 82-98: Difensori, procura alle liti
UPDATE legal_articles
SET related_institutes = ARRAY['difensore', 'procura_alle_liti']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 82 AND 98;

-- ★ Art. 99-112: Principio della domanda, ultrapetita (TC22!)
UPDATE legal_articles
SET related_institutes = ARRAY['domanda_giudiziale', 'ultrapetita', 'principio_dispositivo']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 99 AND 112;

-- Art. 113-120: Pronuncia secondo diritto/equità
UPDATE legal_articles
SET related_institutes = ARRAY['poteri_giudice']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 113 AND 120;

-- Art. 121-162: Atti e termini processuali, comunicazioni, notificazioni
UPDATE legal_articles
SET related_institutes = ARRAY['atti_processuali', 'notificazione', 'termini_processuali']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 121 AND 162;

-- ═══ LIBRO II: Del processo di cognizione ═══

-- ★ Art. 163-183: Atto di citazione, comparsa, udienza, trattazione (TC23!)
UPDATE legal_articles
SET related_institutes = ARRAY['processo_cognizione', 'atto_citazione', 'preclusioni_istruttorie']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 163 AND 183;

-- ★ Art. 171: Deposito documenti (post-Cartabia = 171-ter, TC23!)
UPDATE legal_articles
SET related_institutes = ARRAY['processo_cognizione', 'preclusioni_istruttorie', 'riforma_cartabia', 'deposito_documenti']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) = 171;

-- Art. 184-190: Rimessione in decisione
UPDATE legal_articles
SET related_institutes = ARRAY['processo_cognizione', 'decisione']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 184 AND 190;

-- Art. 191-245: Istruzione probatoria (CTU, testimoni, ispezione)
UPDATE legal_articles
SET related_institutes = ARRAY['prova', 'istruzione_probatoria']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 191 AND 245;

-- Art. 191-201 specifico: CTU
UPDATE legal_articles
SET related_institutes = ARRAY['prova', 'istruzione_probatoria', 'CTU', 'consulente_tecnico']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 191 AND 201;

-- Art. 244-257: Prova testimoniale processuale
UPDATE legal_articles
SET related_institutes = ARRAY['prova', 'istruzione_probatoria', 'prova_testimoniale']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 244 AND 257;

-- Art. 267-274: Intervento di terzi
UPDATE legal_articles
SET related_institutes = ARRAY['intervento_terzo', 'litisconsorzio']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 267 AND 274;

-- Art. 275-310: Decisione, sentenza
UPDATE legal_articles
SET related_institutes = ARRAY['sentenza', 'decisione']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 275 AND 310;

-- Art. 282-285: Provvisoria esecutorietà
UPDATE legal_articles
SET related_institutes = ARRAY['sentenza', 'esecutorieta', 'provvisoria_esecuzione']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 282 AND 285;

-- Art. 295-297: Sospensione del processo
UPDATE legal_articles
SET related_institutes = ARRAY['sospensione_processo']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 295 AND 297;

-- ═══ LIBRO III: Delle impugnazioni ═══

-- Art. 323-350: Appello
UPDATE legal_articles
SET related_institutes = ARRAY['appello', 'impugnazione']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 323 AND 350;

-- Art. 353-359: Regolamento di competenza, giurisdizione
UPDATE legal_articles
SET related_institutes = ARRAY['competenza', 'impugnazione']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 353 AND 359;

-- ★ Art. 360-394: Ricorso per Cassazione (TC24!)
UPDATE legal_articles
SET related_institutes = ARRAY['ricorso_cassazione', 'motivi_impugnazione', 'impugnazione']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 360 AND 394;

-- ★ Art. 360 specifico: I 5 motivi di ricorso (TC24!)
UPDATE legal_articles
SET related_institutes = ARRAY['ricorso_cassazione', 'motivi_impugnazione', 'impugnazione', 'nullita_sentenza']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) = 360;

-- Art. 395-408: Revocazione
UPDATE legal_articles
SET related_institutes = ARRAY['revocazione', 'impugnazione']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 395 AND 408;

-- ═══ LIBRO IV: Procedimenti speciali (prima parte) ═══

-- Art. 409-441: Processo del lavoro
UPDATE legal_articles
SET related_institutes = ARRAY['processo_lavoro', 'lavoro_subordinato']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 409 AND 441;

-- Art. 442-473: Processo locazione, locazioni
UPDATE legal_articles
SET related_institutes = ARRAY['processo_locazione', 'locazione']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 442 AND 473;

-- ═══ LIBRO V: Dell'esecuzione forzata ═══

-- Art. 474-497: Titolo esecutivo, precetto
UPDATE legal_articles
SET related_institutes = ARRAY['esecuzione_forzata', 'titolo_esecutivo', 'precetto']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 474 AND 497;

-- Art. 498-542: Pignoramento
UPDATE legal_articles
SET related_institutes = ARRAY['pignoramento', 'esecuzione_forzata']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 498 AND 542;

-- ★ Art. 545: Pignoramento stipendio/pensione — limiti (TC27!)
UPDATE legal_articles
SET related_institutes = ARRAY['pignoramento', 'pignoramento_stipendio', 'limiti_pignoramento', 'esecuzione_forzata']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) = 545;

-- Art. 543-554: Pignoramento presso terzi
UPDATE legal_articles
SET related_institutes = ARRAY['pignoramento', 'pignoramento_presso_terzi', 'esecuzione_forzata']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 543 AND 554;

-- Art. 555-598: Espropriazione immobiliare
UPDATE legal_articles
SET related_institutes = ARRAY['espropriazione', 'pignoramento_immobiliare', 'vendita_forzata', 'esecuzione_forzata']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 555 AND 598;

-- Art. 599-620: Espropriazione (assegnazione, distribuzione)
UPDATE legal_articles
SET related_institutes = ARRAY['espropriazione', 'esecuzione_forzata']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 599 AND 620;

-- Art. 615-622: Opposizione all'esecuzione
UPDATE legal_articles
SET related_institutes = ARRAY['opposizione_esecuzione', 'esecuzione_forzata']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 615 AND 622;

-- Art. 624-632: Sospensione ed estinzione del processo esecutivo
UPDATE legal_articles
SET related_institutes = ARRAY['sospensione_esecuzione', 'esecuzione_forzata']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 624 AND 632;

-- ═══ LIBRO VI: Procedimenti speciali (seconda parte) ═══

-- Art. 633-656: Procedimento per decreto ingiuntivo
UPDATE legal_articles
SET related_institutes = ARRAY['decreto_ingiuntivo', 'opposizione_decreto_ingiuntivo']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 633 AND 656;

-- ★ Art. 650: Opposizione tardiva (TC28 / TC23!)
UPDATE legal_articles
SET related_institutes = ARRAY['decreto_ingiuntivo', 'opposizione_tardiva', 'opposizione_decreto_ingiuntivo']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) = 650;

-- Art. 657-669: Procedimenti di rilascio di immobili (sfratto)
UPDATE legal_articles
SET related_institutes = ARRAY['sfratto', 'convalida_sfratto', 'locazione']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 657 AND 669;

-- Art. 669-bis-700: Procedimenti cautelari
UPDATE legal_articles
SET related_institutes = ARRAY['procedimento_cautelare', 'sequestro', 'provvedimento_urgente']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 669 AND 700;

-- Art. 702-bis e seguenti: Procedimento sommario
UPDATE legal_articles
SET related_institutes = ARRAY['rito_sommario', 'processo_cognizione']
WHERE law_source = 'Codice di Procedura Civile'
  AND extract_article_number(article_reference) BETWEEN 702 AND 710;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ PARTE C: CODICE PENALE                                               ║
-- ║ 3 test FAIL: TC48, TC55, TC56                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ═══ Parte Generale ═══

-- Art. 1-16: Legge penale, irretroattività
UPDATE legal_articles
SET related_institutes = ARRAY['legge_penale', 'irretroattivita']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 1 AND 16;

-- Art. 17-38: Pene
UPDATE legal_articles
SET related_institutes = ARRAY['pena', 'reclusione', 'multa']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 17 AND 38;

-- Art. 39-49: Reato (nozione), dolo, colpa
UPDATE legal_articles
SET related_institutes = ARRAY['reato', 'dolo', 'colpa']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 39 AND 49;

-- Art. 50-55: Cause di giustificazione
UPDATE legal_articles
SET related_institutes = ARRAY['legittima_difesa', 'stato_necessita', 'causa_giustificazione']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 50 AND 55;

-- Art. 56-58: Tentativo
UPDATE legal_articles
SET related_institutes = ARRAY['tentativo', 'reato']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 56 AND 58;

-- Art. 59-84: Circostanze del reato
UPDATE legal_articles
SET related_institutes = ARRAY['circostanze', 'reato']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 59 AND 84;

-- Art. 85-98: Imputabilità
UPDATE legal_articles
SET related_institutes = ARRAY['imputabilita', 'reato']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 85 AND 98;

-- Art. 110-119: Concorso di persone nel reato
UPDATE legal_articles
SET related_institutes = ARRAY['concorso_persone', 'reato']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 110 AND 119;

-- Art. 120-131: Querela, condizioni di procedibilità
UPDATE legal_articles
SET related_institutes = ARRAY['querela', 'procedibilita']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 120 AND 131;

-- Art. 150-184: Cause di estinzione del reato e della pena
UPDATE legal_articles
SET related_institutes = ARRAY['prescrizione_reato', 'sospensione_condizionale', 'estinzione_reato']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 150 AND 184;

-- Art. 185-198: Sanzioni civili da reato
UPDATE legal_articles
SET related_institutes = ARRAY['risarcimento_danno_reato', 'restituzione']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 185 AND 198;

-- ═══ Parte Speciale — Delitti ═══

-- Art. 314-360: Delitti contro la PA
UPDATE legal_articles
SET related_institutes = ARRAY['corruzione', 'peculato', 'abuso_ufficio', 'delitti_PA']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 314 AND 360;

-- Art. 416: Associazione per delinquere
UPDATE legal_articles
SET related_institutes = ARRAY['associazione_delinquere']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) = 416;

-- Art. 416-bis: Associazione mafiosa
UPDATE legal_articles
SET related_institutes = ARRAY['associazione_mafiosa']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) = 416;

-- Art. 453-498: Falsità in atti e monete
UPDATE legal_articles
SET related_institutes = ARRAY['falso', 'falsita_documento']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 453 AND 498;

-- Art. 515-548: Frodi in commercio
UPDATE legal_articles
SET related_institutes = ARRAY['frode_commerciale', 'truffa_contrattuale']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 515 AND 548;

-- ★ Art. 570-574: Delitti contro la famiglia (TC56!)
UPDATE legal_articles
SET related_institutes = ARRAY['violazione_obblighi_familiari', 'mantenimento', 'delitti_famiglia']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 570 AND 574;

-- Art. 575-593: Omicidio, lesioni personali
UPDATE legal_articles
SET related_institutes = ARRAY['omicidio', 'lesioni_personali', 'delitti_persona']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 575 AND 593;

-- Art. 600-604: Delitti contro la libertà individuale (schiavitù, prostituzione)
UPDATE legal_articles
SET related_institutes = ARRAY['sfruttamento', 'delitti_persona']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 600 AND 604;

-- Art. 609-bis-609-octies: Violenza sessuale
UPDATE legal_articles
SET related_institutes = ARRAY['violenza_sessuale', 'delitti_persona']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 609 AND 609;

-- Art. 610-611: Violenza privata, minaccia
UPDATE legal_articles
SET related_institutes = ARRAY['violenza_privata', 'minaccia', 'delitti_persona']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 610 AND 611;

-- Art. 612-bis: Stalking / atti persecutori
UPDATE legal_articles
SET related_institutes = ARRAY['stalking', 'atti_persecutori', 'delitti_persona']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) = 612;

-- ★ Art. 612-ter: Revenge porn / diffusione immagini intime (TC55!)
-- Nota: extract_article_number estrarrà 612 sia per 612-bis che 612-ter
-- Usiamo ILIKE per catturare 612-ter specificamente
UPDATE legal_articles
SET related_institutes = ARRAY['revenge_porn', 'diffusione_immagini_intime', 'delitti_persona', 'codice_rosso']
WHERE law_source = 'Codice Penale'
  AND article_reference ILIKE '%612-ter%';

-- ★ Art. 614-623: Delitti contro inviolabilità domicilio e segreti (TC48!)
UPDATE legal_articles
SET related_institutes = ARRAY['violazione_domicilio', 'intercettazione', 'registrazione_conversazione', 'segreto_comunicazioni']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 614 AND 623;

-- ★ Art. 617 specifico: Intercettazione abusiva (TC48!)
UPDATE legal_articles
SET related_institutes = ARRAY['intercettazione', 'registrazione_conversazione', 'segreto_comunicazioni', 'cognizione_illecita']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) = 617;

-- Art. 624-629: Furto, rapina
UPDATE legal_articles
SET related_institutes = ARRAY['furto', 'rapina', 'delitti_patrimonio']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 624 AND 629;

-- Art. 640-642: Truffa
UPDATE legal_articles
SET related_institutes = ARRAY['truffa', 'delitti_patrimonio']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) BETWEEN 640 AND 642;

-- Art. 646: Appropriazione indebita
UPDATE legal_articles
SET related_institutes = ARRAY['appropriazione_indebita', 'delitti_patrimonio']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) = 646;

-- Art. 648: Ricettazione
UPDATE legal_articles
SET related_institutes = ARRAY['ricettazione', 'delitti_patrimonio']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) = 648;

-- Art. 649: Non punibilità per fatti contro il patrimonio familiare
UPDATE legal_articles
SET related_institutes = ARRAY['delitti_patrimonio', 'non_punibilita']
WHERE law_source = 'Codice Penale'
  AND extract_article_number(article_reference) = 649;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ PARTE D: CODICE DEL CONSUMO — Estensione (oltre Art. 33-38, 45-67,  ║
-- ║          128-135 già coperti da migration 012)                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- Art. 1-5: Disposizioni generali, definizioni
UPDATE legal_articles
SET related_institutes = ARRAY['tutela_consumatore']
WHERE law_source = 'Codice del Consumo'
  AND extract_article_number(article_reference) BETWEEN 1 AND 5
  AND related_institutes = '{}';

-- Art. 6-17: Informazioni ai consumatori, etichettatura
UPDATE legal_articles
SET related_institutes = ARRAY['tutela_consumatore', 'informazione_consumatore']
WHERE law_source = 'Codice del Consumo'
  AND extract_article_number(article_reference) BETWEEN 6 AND 17
  AND related_institutes = '{}';

-- Art. 18-27-quater: Pratiche commerciali scorrette
UPDATE legal_articles
SET related_institutes = ARRAY['tutela_consumatore', 'pratiche_commerciali_scorrette']
WHERE law_source = 'Codice del Consumo'
  AND extract_article_number(article_reference) BETWEEN 18 AND 27
  AND related_institutes = '{}';

-- Art. 33-38: Già coperti da 012 (clausole_abusive, tutela_consumatore, clausole_vessatorie)

-- ★ Art. 33 co.2 specifico: Lista clausole presuntivamente abusive (TC43!)
-- Override per aggiungere istituti più specifici
UPDATE legal_articles
SET related_institutes = ARRAY['clausole_abusive', 'tutela_consumatore', 'clausole_vessatorie', 'nullita', 'varianti_costruttore']
WHERE law_source = 'Codice del Consumo'
  AND extract_article_number(article_reference) = 33;

-- Art. 45-67: Contratti a distanza, diritto di recesso (parzialmente coperto da 012)
UPDATE legal_articles
SET related_institutes = ARRAY['tutela_consumatore', 'diritto_recesso', 'contratto_distanza']
WHERE law_source = 'Codice del Consumo'
  AND extract_article_number(article_reference) BETWEEN 45 AND 67;

-- Art. 52-59 specifico: Diritto di recesso (14 giorni)
UPDATE legal_articles
SET related_institutes = ARRAY['tutela_consumatore', 'diritto_recesso', 'contratto_distanza', 'recesso_consumatore']
WHERE law_source = 'Codice del Consumo'
  AND extract_article_number(article_reference) BETWEEN 52 AND 59;

-- Art. 102-113: Sicurezza dei prodotti
UPDATE legal_articles
SET related_institutes = ARRAY['tutela_consumatore', 'sicurezza_prodotti']
WHERE law_source = 'Codice del Consumo'
  AND extract_article_number(article_reference) BETWEEN 102 AND 113
  AND related_institutes = '{}';

-- Art. 114-127: Responsabilità per difetto
UPDATE legal_articles
SET related_institutes = ARRAY['tutela_consumatore', 'responsabilita_produttore', 'prodotto_difettoso']
WHERE law_source = 'Codice del Consumo'
  AND extract_article_number(article_reference) BETWEEN 114 AND 127
  AND related_institutes = '{}';

-- Art. 128-135: Garanzia legale (già coperti da 012, estensione)
UPDATE legal_articles
SET related_institutes = ARRAY['tutela_consumatore', 'vizi_conformita', 'garanzia_legale', 'vendita']
WHERE law_source = 'Codice del Consumo'
  AND extract_article_number(article_reference) BETWEEN 128 AND 135;

-- Art. 136-141: Garanzia commerciale, azioni inibitorie
UPDATE legal_articles
SET related_institutes = ARRAY['tutela_consumatore', 'garanzia_commerciale']
WHERE law_source = 'Codice del Consumo'
  AND extract_article_number(article_reference) BETWEEN 136 AND 141
  AND related_institutes = '{}';

-- Art. 140-141-bis: Azione di classe / collettiva
UPDATE legal_articles
SET related_institutes = ARRAY['tutela_consumatore', 'azione_classe']
WHERE law_source = 'Codice del Consumo'
  AND extract_article_number(article_reference) BETWEEN 140 AND 141;


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ PARTE E: FONTI SPECIALISTICHE ITALIANE                               ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ═══ D.Lgs. 122/2005 — Tutela acquirenti immobili da costruire ═══

-- Art. 1-3: Definizioni, garanzia fideiussoria
UPDATE legal_articles
SET related_institutes = ARRAY['acquisto_immobile_da_costruire', 'fideiussione_obbligatoria']
WHERE law_source = 'Tutela acquirenti immobili da costruire'
  AND extract_article_number(article_reference) BETWEEN 1 AND 3;

-- Art. 4: Polizza assicurativa
UPDATE legal_articles
SET related_institutes = ARRAY['acquisto_immobile_da_costruire', 'fideiussione_obbligatoria', 'polizza_assicurativa']
WHERE law_source = 'Tutela acquirenti immobili da costruire'
  AND extract_article_number(article_reference) = 4;

-- Art. 5-6: Contenuto del contratto preliminare
UPDATE legal_articles
SET related_institutes = ARRAY['acquisto_immobile_da_costruire', 'preliminare']
WHERE law_source = 'Tutela acquirenti immobili da costruire'
  AND extract_article_number(article_reference) BETWEEN 5 AND 6;

-- Art. 7-9: Diritto di prelazione, rinuncia
UPDATE legal_articles
SET related_institutes = ARRAY['acquisto_immobile_da_costruire']
WHERE law_source = 'Tutela acquirenti immobili da costruire'
  AND extract_article_number(article_reference) BETWEEN 7 AND 19
  AND related_institutes = '{}';


-- ═══ D.Lgs. 28/2010 — Mediazione civile e commerciale ═══
-- DB law_source: "D.Lgs. 28/2010" (shortName da hr-sources/corpus-sources)

-- Art. 1-4: Definizioni, ambito
UPDATE legal_articles
SET related_institutes = ARRAY['mediazione', 'mediazione_obbligatoria']
WHERE law_source = 'D.Lgs. 28/2010'
  AND extract_article_number(article_reference) BETWEEN 1 AND 4;

-- Art. 5: Condizione di procedibilità (mediazione obbligatoria)
UPDATE legal_articles
SET related_institutes = ARRAY['mediazione', 'mediazione_obbligatoria', 'condizione_procedibilita']
WHERE law_source = 'D.Lgs. 28/2010'
  AND extract_article_number(article_reference) = 5;

-- Art. 6-7: Durata, effetti sulla prescrizione
UPDATE legal_articles
SET related_institutes = ARRAY['mediazione', 'mediazione_obbligatoria']
WHERE law_source = 'D.Lgs. 28/2010'
  AND extract_article_number(article_reference) BETWEEN 6 AND 7;

-- ★ Art. 8: Procedimento, mancata partecipazione (TC28!)
UPDATE legal_articles
SET related_institutes = ARRAY['mediazione', 'mediazione_obbligatoria', 'mancata_partecipazione_mediazione', 'sanzione_mediazione']
WHERE law_source = 'D.Lgs. 28/2010'
  AND extract_article_number(article_reference) = 8;

-- Art. 9-13: Doveri del mediatore, accordo, verbale
UPDATE legal_articles
SET related_institutes = ARRAY['mediazione', 'accordo_mediazione']
WHERE law_source = 'D.Lgs. 28/2010'
  AND extract_article_number(article_reference) BETWEEN 9 AND 13;

-- Art. 14-20: Organismi, indennità, disposizioni finali
UPDATE legal_articles
SET related_institutes = ARRAY['mediazione']
WHERE law_source = 'D.Lgs. 28/2010'
  AND extract_article_number(article_reference) BETWEEN 14 AND 44
  AND related_institutes = '{}';


-- ═══ DPR 380/2001 — Testo Unico Edilizia ═══

-- Art. 1-5: Disposizioni generali, definizione interventi
UPDATE legal_articles
SET related_institutes = ARRAY['edilizia', 'intervento_edilizio']
WHERE law_source = 'Testo Unico Edilizia'
  AND extract_article_number(article_reference) BETWEEN 1 AND 5;

-- Art. 6-23: Titoli abilitativi (permesso di costruire, SCIA, DIA)
UPDATE legal_articles
SET related_institutes = ARRAY['edilizia', 'permesso_costruire', 'titolo_abilitativo']
WHERE law_source = 'Testo Unico Edilizia'
  AND extract_article_number(article_reference) BETWEEN 6 AND 23;

-- Art. 24-26: Agibilità
UPDATE legal_articles
SET related_institutes = ARRAY['edilizia', 'agibilita']
WHERE law_source = 'Testo Unico Edilizia'
  AND extract_article_number(article_reference) BETWEEN 24 AND 26;

-- Art. 27-50: Vigilanza, sanzioni, abuso edilizio
UPDATE legal_articles
SET related_institutes = ARRAY['edilizia', 'abuso_edilizio', 'sanzione_edilizia']
WHERE law_source = 'Testo Unico Edilizia'
  AND extract_article_number(article_reference) BETWEEN 27 AND 50;

-- ★ Art. 46: Nullità atti di trasferimento (vendita immobile abusivo!)
UPDATE legal_articles
SET related_institutes = ARRAY['edilizia', 'abuso_edilizio', 'nullita_atto_trasferimento', 'vendita_immobiliare']
WHERE law_source = 'Testo Unico Edilizia'
  AND extract_article_number(article_reference) = 46;

-- Art. 51-92: Norme tecniche
UPDATE legal_articles
SET related_institutes = ARRAY['edilizia', 'norme_tecniche']
WHERE law_source = 'Testo Unico Edilizia'
  AND extract_article_number(article_reference) BETWEEN 51 AND 92
  AND related_institutes = '{}';

-- Art. 93-107: Costruzioni in zone sismiche
UPDATE legal_articles
SET related_institutes = ARRAY['edilizia', 'zona_sismica']
WHERE law_source = 'Testo Unico Edilizia'
  AND extract_article_number(article_reference) BETWEEN 93 AND 107
  AND related_institutes = '{}';

-- Articoli rimanenti
UPDATE legal_articles
SET related_institutes = ARRAY['edilizia']
WHERE law_source = 'Testo Unico Edilizia'
  AND related_institutes = '{}';


-- ═══ L. 431/1998 — Disciplina locazioni abitative ═══
-- DB law_source: "L. 431/1998" (shortName)

-- Art. 1-2: Ambito applicazione
UPDATE legal_articles
SET related_institutes = ARRAY['locazione', 'locazione_abitativa']
WHERE law_source = 'L. 431/1998'
  AND extract_article_number(article_reference) BETWEEN 1 AND 2;

-- Art. 3-4: Durata, rinnovo (4+4, 3+2)
UPDATE legal_articles
SET related_institutes = ARRAY['locazione', 'locazione_abitativa', 'durata_locazione', 'rinnovo_contratto']
WHERE law_source = 'L. 431/1998'
  AND extract_article_number(article_reference) BETWEEN 3 AND 4;

-- Art. 5: Canone concordato
UPDATE legal_articles
SET related_institutes = ARRAY['locazione', 'locazione_abitativa', 'canone_concordato']
WHERE law_source = 'L. 431/1998'
  AND extract_article_number(article_reference) = 5;

-- Art. 6-18: Disposizioni varie, sanzioni
UPDATE legal_articles
SET related_institutes = ARRAY['locazione', 'locazione_abitativa']
WHERE law_source = 'L. 431/1998'
  AND extract_article_number(article_reference) BETWEEN 6 AND 18
  AND related_institutes = '{}';


-- ═══ TUB D.Lgs. 385/1993 — Testo Unico Bancario ═══
-- DB law_source: "TUB D.Lgs. 385/1993" (shortName)

-- Art. 1-10: Definizioni, ambito
UPDATE legal_articles
SET related_institutes = ARRAY['bancario', 'credito']
WHERE law_source = 'TUB D.Lgs. 385/1993'
  AND extract_article_number(article_reference) BETWEEN 1 AND 10;

-- Art. 10-27: Attività bancaria, autorizzazione
UPDATE legal_articles
SET related_institutes = ARRAY['bancario', 'attivita_bancaria']
WHERE law_source = 'TUB D.Lgs. 385/1993'
  AND extract_article_number(article_reference) BETWEEN 10 AND 27
  AND related_institutes = '{}';

-- Art. 115-120: Trasparenza
UPDATE legal_articles
SET related_institutes = ARRAY['bancario', 'trasparenza_bancaria']
WHERE law_source = 'TUB D.Lgs. 385/1993'
  AND extract_article_number(article_reference) BETWEEN 115 AND 120;

-- Art. 120-bis-120-quater: Mutuo, rimborso anticipato
UPDATE legal_articles
SET related_institutes = ARRAY['bancario', 'mutuo_bancario', 'rimborso_anticipato']
WHERE law_source = 'TUB D.Lgs. 385/1993'
  AND extract_article_number(article_reference) = 120;

-- Art. 121-128: Credito al consumo
UPDATE legal_articles
SET related_institutes = ARRAY['bancario', 'credito_consumo', 'tutela_consumatore']
WHERE law_source = 'TUB D.Lgs. 385/1993'
  AND extract_article_number(article_reference) BETWEEN 121 AND 128;

-- Art. 128-bis-128-quater: ABF (Arbitro Bancario Finanziario)
UPDATE legal_articles
SET related_institutes = ARRAY['bancario', 'ABF', 'risoluzione_controversie']
WHERE law_source = 'TUB D.Lgs. 385/1993'
  AND extract_article_number(article_reference) = 128;

-- Art. 129-143: Mutuo fondiario, credito edilizio
UPDATE legal_articles
SET related_institutes = ARRAY['bancario', 'mutuo_fondiario']
WHERE law_source = 'TUB D.Lgs. 385/1993'
  AND extract_article_number(article_reference) BETWEEN 129 AND 143
  AND related_institutes = '{}';

-- Articoli rimanenti
UPDATE legal_articles
SET related_institutes = ARRAY['bancario']
WHERE law_source = 'TUB D.Lgs. 385/1993'
  AND related_institutes = '{}';


-- ═══ D.Lgs. 231/2001 — Responsabilità amministrativa degli enti ═══
-- DB law_source: "Responsabilita amministrativa enti" (name)
-- NOTA: esiste anche "D.Lgs. 231/2002" come shortName separata nel DB (antiriciclaggio)

-- Art. 1-4: Principi generali
UPDATE legal_articles
SET related_institutes = ARRAY['responsabilita_ente', 'compliance']
WHERE law_source = 'Responsabilita amministrativa enti'
  AND extract_article_number(article_reference) BETWEEN 1 AND 4;

-- Art. 5-8: Criteri di imputazione, modello organizzativo
UPDATE legal_articles
SET related_institutes = ARRAY['responsabilita_ente', 'compliance', 'modello_231']
WHERE law_source = 'Responsabilita amministrativa enti'
  AND extract_article_number(article_reference) BETWEEN 5 AND 8;

-- Art. 9-23: Sanzioni
UPDATE legal_articles
SET related_institutes = ARRAY['responsabilita_ente', 'sanzione', 'modello_231']
WHERE law_source = 'Responsabilita amministrativa enti'
  AND extract_article_number(article_reference) BETWEEN 9 AND 23;

-- Art. 24-26: Reati presupposto
UPDATE legal_articles
SET related_institutes = ARRAY['responsabilita_ente', 'reato_presupposto', 'modello_231']
WHERE law_source = 'Responsabilita amministrativa enti'
  AND extract_article_number(article_reference) BETWEEN 24 AND 26;

-- Articoli rimanenti
UPDATE legal_articles
SET related_institutes = ARRAY['responsabilita_ente', 'modello_231']
WHERE law_source = 'Responsabilita amministrativa enti'
  AND related_institutes = '{}';


-- ═══ L. 590/1965 — Prelazione agraria ═══
-- DB law_source: "L. 590/1965" (shortName)

UPDATE legal_articles
SET related_institutes = ARRAY['prelazione_agraria', 'riscatto_agrario']
WHERE law_source = 'L. 590/1965'
  AND related_institutes = '{}';

-- Art. 8: Diritto di prelazione dell'affittuario
UPDATE legal_articles
SET related_institutes = ARRAY['prelazione_agraria', 'riscatto_agrario', 'affittuario_coltivatore']
WHERE law_source = 'L. 590/1965'
  AND extract_article_number(article_reference) = 8;


-- ═══ Reg. CE 261/2004 — Passeggeri aerei ═══
-- DB law_source: "Reg. CE 261/2004" (shortName)

-- Art. 1-4: Ambito, definizioni
UPDATE legal_articles
SET related_institutes = ARRAY['passeggeri_aerei', 'trasporto_aereo']
WHERE law_source = 'Reg. CE 261/2004'
  AND extract_article_number(article_reference) BETWEEN 1 AND 4;

-- Art. 5: Cancellazione volo
UPDATE legal_articles
SET related_institutes = ARRAY['passeggeri_aerei', 'cancellazione_volo', 'compensazione_pecuniaria']
WHERE law_source = 'Reg. CE 261/2004'
  AND extract_article_number(article_reference) = 5;

-- Art. 6: Ritardo volo
UPDATE legal_articles
SET related_institutes = ARRAY['passeggeri_aerei', 'ritardo_volo', 'assistenza_passeggero']
WHERE law_source = 'Reg. CE 261/2004'
  AND extract_article_number(article_reference) = 6;

-- Art. 7: Compensazione pecuniaria (250/400/600 euro)
UPDATE legal_articles
SET related_institutes = ARRAY['passeggeri_aerei', 'compensazione_pecuniaria']
WHERE law_source = 'Reg. CE 261/2004'
  AND extract_article_number(article_reference) = 7;

-- Art. 8-9: Rimborso, assistenza
UPDATE legal_articles
SET related_institutes = ARRAY['passeggeri_aerei', 'rimborso', 'assistenza_passeggero']
WHERE law_source = 'Reg. CE 261/2004'
  AND extract_article_number(article_reference) BETWEEN 8 AND 9;

-- Articoli rimanenti
UPDATE legal_articles
SET related_institutes = ARRAY['passeggeri_aerei']
WHERE law_source = 'Reg. CE 261/2004'
  AND related_institutes = '{}';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ PARTE F: FONTI HR (Lavoro)                                           ║
-- ║ DB law_source usa shortName da hr-sources.ts:                        ║
-- ║   "L. 300/1970", "T.U. Sicurezza", "Jobs Act Contratti",           ║
-- ║   "Biagi" / "D.Lgs. 276/2003", "Jobs Act" / "D.Lgs. 23/2015",    ║
-- ║   "CIG"                                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ═══ Statuto dei Lavoratori (L. 300/1970) ═══
-- DB law_source: "L. 300/1970" (shortName) oppure "Statuto dei Lavoratori" (name)

-- Art. 1-13: Libertà e dignità del lavoratore
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'diritti_lavoratore', 'statuto_lavoratori']
WHERE law_source IN ('L. 300/1970', 'Statuto dei Lavoratori')
  AND extract_article_number(article_reference) BETWEEN 1 AND 13;

-- Art. 4: Videosorveglianza, controllo a distanza
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'controllo_distanza', 'videosorveglianza', 'statuto_lavoratori', 'privacy_lavoro']
WHERE law_source IN ('L. 300/1970', 'Statuto dei Lavoratori')
  AND extract_article_number(article_reference) = 4;

-- Art. 7: Sanzioni disciplinari
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'sanzione_disciplinare', 'statuto_lavoratori']
WHERE law_source IN ('L. 300/1970', 'Statuto dei Lavoratori')
  AND extract_article_number(article_reference) = 7;

-- Art. 14-17: Libertà sindacale
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'liberta_sindacale', 'statuto_lavoratori']
WHERE law_source IN ('L. 300/1970', 'Statuto dei Lavoratori')
  AND extract_article_number(article_reference) BETWEEN 14 AND 17;

-- ★ Art. 18: Reintegrazione (licenziamento illegittimo)
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'licenziamento', 'reintegrazione', 'statuto_lavoratori', 'licenziamento_illegittimo']
WHERE law_source IN ('L. 300/1970', 'Statuto dei Lavoratori')
  AND extract_article_number(article_reference) = 18;

-- Art. 19-27: RSU, assemblea, permessi sindacali
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'attivita_sindacale', 'statuto_lavoratori']
WHERE law_source IN ('L. 300/1970', 'Statuto dei Lavoratori')
  AND extract_article_number(article_reference) BETWEEN 19 AND 27;

-- Art. 28-40: Repressione condotta antisindacale, disposizioni varie
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'statuto_lavoratori']
WHERE law_source IN ('L. 300/1970', 'Statuto dei Lavoratori')
  AND extract_article_number(article_reference) BETWEEN 28 AND 40
  AND related_institutes = '{}';


-- ═══ D.Lgs. 81/2008 — Testo Unico Sicurezza sul Lavoro ═══
-- DB law_source: "T.U. Sicurezza" (shortName)

-- Art. 1-4: Disposizioni generali, definizioni
UPDATE legal_articles
SET related_institutes = ARRAY['sicurezza_lavoro', 'datore_lavoro']
WHERE law_source = 'T.U. Sicurezza'
  AND extract_article_number(article_reference) BETWEEN 1 AND 4;

-- Art. 15-20: Obblighi del datore di lavoro, valutazione rischi
UPDATE legal_articles
SET related_institutes = ARRAY['sicurezza_lavoro', 'datore_lavoro', 'valutazione_rischi', 'DVR']
WHERE law_source = 'T.U. Sicurezza'
  AND extract_article_number(article_reference) BETWEEN 15 AND 20;

-- Art. 28-30: DVR, modelli organizzativi
UPDATE legal_articles
SET related_institutes = ARRAY['sicurezza_lavoro', 'DVR', 'valutazione_rischi']
WHERE law_source = 'T.U. Sicurezza'
  AND extract_article_number(article_reference) BETWEEN 28 AND 30;

-- Art. 31-35: RSPP, SPP
UPDATE legal_articles
SET related_institutes = ARRAY['sicurezza_lavoro', 'RSPP']
WHERE law_source = 'T.U. Sicurezza'
  AND extract_article_number(article_reference) BETWEEN 31 AND 35;

-- Art. 36-37: Informazione e formazione
UPDATE legal_articles
SET related_institutes = ARRAY['sicurezza_lavoro', 'formazione_sicurezza']
WHERE law_source = 'T.U. Sicurezza'
  AND extract_article_number(article_reference) BETWEEN 36 AND 37;

-- Art. 41-44: Medico competente, sorveglianza sanitaria
UPDATE legal_articles
SET related_institutes = ARRAY['sicurezza_lavoro', 'sorveglianza_sanitaria', 'medico_competente']
WHERE law_source = 'T.U. Sicurezza'
  AND extract_article_number(article_reference) BETWEEN 41 AND 44;

-- Art. 47-50: RLS
UPDATE legal_articles
SET related_institutes = ARRAY['sicurezza_lavoro', 'RLS']
WHERE law_source = 'T.U. Sicurezza'
  AND extract_article_number(article_reference) BETWEEN 47 AND 50;

-- Articoli rimanenti (tanti — norme tecniche specifiche)
UPDATE legal_articles
SET related_institutes = ARRAY['sicurezza_lavoro']
WHERE law_source = 'T.U. Sicurezza'
  AND related_institutes = '{}';


-- ═══ D.Lgs. 81/2015 — Codice dei contratti di lavoro ═══
-- DB law_source: "Jobs Act Contratti" (shortName)

-- Art. 1-12: Contratto a tempo indeterminato
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'contratto_lavoro', 'tempo_indeterminato']
WHERE law_source = 'Jobs Act Contratti'
  AND extract_article_number(article_reference) BETWEEN 1 AND 12;

-- Art. 13-29: Contratto a tempo determinato
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'contratto_lavoro', 'tempo_determinato']
WHERE law_source = 'Jobs Act Contratti'
  AND extract_article_number(article_reference) BETWEEN 13 AND 29;

-- Art. 30-40: Somministrazione di lavoro
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'somministrazione_lavoro']
WHERE law_source = 'Jobs Act Contratti'
  AND extract_article_number(article_reference) BETWEEN 30 AND 40;

-- Art. 41-47: Apprendistato
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'apprendistato']
WHERE law_source = 'Jobs Act Contratti'
  AND extract_article_number(article_reference) BETWEEN 41 AND 47;

-- Art. 48-53: Part-time
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'part_time']
WHERE law_source = 'Jobs Act Contratti'
  AND extract_article_number(article_reference) BETWEEN 48 AND 53;

-- Articoli rimanenti
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'contratto_lavoro']
WHERE law_source = 'Jobs Act Contratti'
  AND related_institutes = '{}';


-- ═══ D.Lgs. 276/2003 — Riforma Biagi ═══
-- DB law_source: "Biagi" (shortName) oppure "D.Lgs. 276/2003"

UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'mercato_lavoro', 'lavoro_flessibile']
WHERE law_source IN ('Biagi', 'D.Lgs. 276/2003')
  AND related_institutes = '{}';


-- ═══ D.Lgs. 23/2015 — Jobs Act Tutele crescenti ═══
-- DB law_source: "Jobs Act" (shortName) oppure "D.Lgs. 23/2015"

-- Art. 1-5: Licenziamento illegittimo, indennità risarcitoria
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'licenziamento', 'licenziamento_illegittimo', 'tutele_crescenti']
WHERE law_source IN ('Jobs Act', 'D.Lgs. 23/2015')
  AND extract_article_number(article_reference) BETWEEN 1 AND 5;

-- Art. 6-8: Conciliazione, revoca licenziamento
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'licenziamento', 'conciliazione', 'tutele_crescenti']
WHERE law_source IN ('Jobs Act', 'D.Lgs. 23/2015')
  AND extract_article_number(article_reference) BETWEEN 6 AND 8;

-- Articoli rimanenti
UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'licenziamento', 'tutele_crescenti']
WHERE law_source IN ('Jobs Act', 'D.Lgs. 23/2015')
  AND related_institutes = '{}';


-- ═══ D.Lgs. 148/2015 — CIG (Cassa Integrazione Guadagni) ═══
-- DB law_source: "CIG" (shortName)

UPDATE legal_articles
SET related_institutes = ARRAY['lavoro_subordinato', 'cassa_integrazione', 'ammortizzatori_sociali']
WHERE law_source = 'CIG'
  AND related_institutes = '{}';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ PARTE G: FONTI EU                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ═══ GDPR (Reg. 2016/679) ═══

-- Art. 1-4: Ambito, definizioni
UPDATE legal_articles
SET related_institutes = ARRAY['privacy', 'protezione_dati', 'GDPR']
WHERE law_source ILIKE '%2016/679%'
  AND extract_article_number(article_reference) BETWEEN 1 AND 4;

-- Art. 5-11: Principi del trattamento
UPDATE legal_articles
SET related_institutes = ARRAY['privacy', 'protezione_dati', 'GDPR', 'principi_trattamento']
WHERE law_source ILIKE '%2016/679%'
  AND extract_article_number(article_reference) BETWEEN 5 AND 11;

-- Art. 6: Base giuridica (consenso, legittimo interesse, etc.)
UPDATE legal_articles
SET related_institutes = ARRAY['privacy', 'protezione_dati', 'GDPR', 'base_giuridica', 'consenso']
WHERE law_source ILIKE '%2016/679%'
  AND extract_article_number(article_reference) = 6;

-- Art. 12-23: Diritti dell'interessato
UPDATE legal_articles
SET related_institutes = ARRAY['privacy', 'protezione_dati', 'GDPR', 'diritti_interessato']
WHERE law_source ILIKE '%2016/679%'
  AND extract_article_number(article_reference) BETWEEN 12 AND 23;

-- Art. 13-14: Informativa
UPDATE legal_articles
SET related_institutes = ARRAY['privacy', 'protezione_dati', 'GDPR', 'informativa_privacy']
WHERE law_source ILIKE '%2016/679%'
  AND extract_article_number(article_reference) BETWEEN 13 AND 14;

-- Art. 17: Diritto alla cancellazione (oblio)
UPDATE legal_articles
SET related_institutes = ARRAY['privacy', 'protezione_dati', 'GDPR', 'diritto_oblio', 'diritti_interessato']
WHERE law_source ILIKE '%2016/679%'
  AND extract_article_number(article_reference) = 17;

-- Art. 24-43: Titolare, responsabile, DPO
UPDATE legal_articles
SET related_institutes = ARRAY['privacy', 'protezione_dati', 'GDPR', 'titolare_trattamento']
WHERE law_source ILIKE '%2016/679%'
  AND extract_article_number(article_reference) BETWEEN 24 AND 43;

-- Art. 33-34: Data breach
UPDATE legal_articles
SET related_institutes = ARRAY['privacy', 'protezione_dati', 'GDPR', 'data_breach']
WHERE law_source ILIKE '%2016/679%'
  AND extract_article_number(article_reference) BETWEEN 33 AND 34;

-- Art. 35-36: DPIA
UPDATE legal_articles
SET related_institutes = ARRAY['privacy', 'protezione_dati', 'GDPR', 'DPIA']
WHERE law_source ILIKE '%2016/679%'
  AND extract_article_number(article_reference) BETWEEN 35 AND 36;

-- Art. 44-49: Trasferimenti extra-UE
UPDATE legal_articles
SET related_institutes = ARRAY['privacy', 'protezione_dati', 'GDPR', 'trasferimento_dati']
WHERE law_source ILIKE '%2016/679%'
  AND extract_article_number(article_reference) BETWEEN 44 AND 49;

-- Art. 77-84: Ricorsi, responsabilità, sanzioni
UPDATE legal_articles
SET related_institutes = ARRAY['privacy', 'protezione_dati', 'GDPR', 'sanzione_GDPR']
WHERE law_source ILIKE '%2016/679%'
  AND extract_article_number(article_reference) BETWEEN 77 AND 84;

-- Articoli rimanenti
UPDATE legal_articles
SET related_institutes = ARRAY['privacy', 'protezione_dati', 'GDPR']
WHERE law_source ILIKE '%2016/679%'
  AND related_institutes = '{}';


-- ═══ Direttiva clausole abusive (93/13/CEE) ═══

UPDATE legal_articles
SET related_institutes = ARRAY['clausole_abusive', 'tutela_consumatore', 'clausole_vessatorie']
WHERE law_source ILIKE '%93/13%'
  AND related_institutes = '{}';


-- ═══ Direttiva diritti consumatori (2011/83/UE) ═══

UPDATE legal_articles
SET related_institutes = ARRAY['tutela_consumatore', 'diritto_recesso', 'contratto_distanza']
WHERE law_source ILIKE '%2011/83%'
  AND related_institutes = '{}';


-- ═══ Direttiva vendita beni (2019/771/UE) ═══

UPDATE legal_articles
SET related_institutes = ARRAY['tutela_consumatore', 'vizi_conformita', 'garanzia_legale', 'vendita']
WHERE law_source ILIKE '%2019/771%'
  AND related_institutes = '{}';


-- ═══ Regolamento Roma I (593/2008) ═══

UPDATE legal_articles
SET related_institutes = ARRAY['diritto_internazionale_privato', 'legge_applicabile', 'contratto']
WHERE law_source ILIKE '%593/2008%'
  AND related_institutes = '{}';


-- ═══ Digital Services Act (2022/2065) ═══

UPDATE legal_articles
SET related_institutes = ARRAY['servizi_digitali', 'piattaforme_online', 'DSA']
WHERE law_source ILIKE '%2022/2065%'
  AND related_institutes = '{}';


-- ═══ AI Act (2024/1689) ═══
-- DB law_source: "AI Act" (shortName)

-- Art. 1-4: Ambito, definizioni
UPDATE legal_articles
SET related_institutes = ARRAY['intelligenza_artificiale', 'AI_Act']
WHERE law_source = 'AI Act'
  AND extract_article_number(article_reference) BETWEEN 1 AND 4;

-- Art. 5: Pratiche AI vietate
UPDATE legal_articles
SET related_institutes = ARRAY['intelligenza_artificiale', 'AI_Act', 'AI_vietata']
WHERE law_source = 'AI Act'
  AND extract_article_number(article_reference) = 5;

-- Art. 6-49: Sistemi ad alto rischio
UPDATE legal_articles
SET related_institutes = ARRAY['intelligenza_artificiale', 'AI_Act', 'AI_alto_rischio']
WHERE law_source = 'AI Act'
  AND extract_article_number(article_reference) BETWEEN 6 AND 49;

-- Art. 50-56: Trasparenza, deepfake
UPDATE legal_articles
SET related_institutes = ARRAY['intelligenza_artificiale', 'AI_Act', 'trasparenza_AI']
WHERE law_source = 'AI Act'
  AND extract_article_number(article_reference) BETWEEN 50 AND 56;

-- Articoli rimanenti
UPDATE legal_articles
SET related_institutes = ARRAY['intelligenza_artificiale', 'AI_Act']
WHERE law_source = 'AI Act'
  AND related_institutes = '{}';


-- ═══ NIS2 (2022/2555) ═══
-- DB law_source: "NIS2" (shortName)

UPDATE legal_articles
SET related_institutes = ARRAY['cybersicurezza', 'NIS2']
WHERE law_source = 'NIS2'
  AND related_institutes = '{}';


-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ VERIFICA FINALE                                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- Conta articoli con almeno un istituto per fonte
-- SELECT law_source,
--        COUNT(*) as total,
--        COUNT(*) FILTER (WHERE related_institutes != '{}') as with_institutes,
--        ROUND(100.0 * COUNT(*) FILTER (WHERE related_institutes != '{}') / COUNT(*), 1) as pct
-- FROM legal_articles
-- GROUP BY law_source
-- ORDER BY pct;

-- Conta totali
-- SELECT
--   COUNT(*) as total_articles,
--   COUNT(*) FILTER (WHERE related_institutes != '{}') as with_institutes,
--   COUNT(*) FILTER (WHERE related_institutes = '{}') as without_institutes,
--   ROUND(100.0 * COUNT(*) FILTER (WHERE related_institutes != '{}') / COUNT(*), 1) as coverage_pct
-- FROM legal_articles;
