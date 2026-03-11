/**
 * run-migration-028.ts — Esegue la migration 028 via Supabase JS client.
 *
 * Popola related_institutes per tutte le fonti del corpus.
 * Equivalente a 028_populate_institutes_all_sources.sql ma usa il client JS
 * perché non abbiamo accesso SQL diretto (no Supabase CLI login).
 *
 * Usage: npx tsx scripts/run-migration-028.ts [--dry-run]
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ─── Types ───

interface Rule {
  source: string | string[];  // law_source exact match(es)
  sourcePattern?: string;      // ILIKE pattern (alternative to exact match)
  range?: [number, number];   // article number range [min, max]
  exact?: number;              // exact article number
  ilike?: string;              // article_reference ILIKE pattern (for things like '612-ter')
  institutes: string[];
  onlyIfEmpty?: boolean;       // only update if related_institutes is empty (default false)
}

// ─── Helper: extract article number from reference ───

function extractArticleNumber(ref: string): number | null {
  const part = ref.split("-")[0];
  const digits = part.replace(/[^0-9]/g, "");
  if (!digits) return null;
  return parseInt(digits, 10);
}

// ─── All rules (mirrors 028_populate_institutes_all_sources.sql) ───

const rules: Rule[] = [
  // ╔═══════════════════════════════════════════════════════════════╗
  // ║ PARTE A: CODICE CIVILE — Gap fill                            ║
  // ╚═══════════════════════════════════════════════════════════════╝

  // LIBRO I: Persone e Famiglia
  { source: "Codice Civile", range: [79, 142], institutes: ["matrimonio"], onlyIfEmpty: true },
  { source: "Codice Civile", range: [143, 166], institutes: ["matrimonio", "obblighi_coniugali", "separazione"], onlyIfEmpty: true },
  { source: "Codice Civile", range: [167, 230], institutes: ["comunione_legale", "separazione_beni", "fondo_patrimoniale"], onlyIfEmpty: true },
  { source: "Codice Civile", range: [231, 290], institutes: ["filiazione"], onlyIfEmpty: true },
  { source: "Codice Civile", range: [315, 337], institutes: ["responsabilita_genitoriale", "affidamento"], onlyIfEmpty: true },
  { source: "Codice Civile", range: [343, 413], institutes: ["tutela", "amministrazione_sostegno"], onlyIfEmpty: true },
  { source: "Codice Civile", range: [433, 455], institutes: ["alimenti", "mantenimento"], onlyIfEmpty: true },

  // LIBRO II: Successioni (CRITICO)
  { source: "Codice Civile", range: [456, 535], institutes: ["successione", "eredita", "accettazione_eredita", "rinuncia_eredita"], onlyIfEmpty: true },
  { source: "Codice Civile", range: [536, 564], institutes: ["legittimari", "quota_legittima", "azione_riduzione", "successione"] },
  { source: "Codice Civile", range: [565, 586], institutes: ["successione_legittima", "successione"], onlyIfEmpty: true },
  { source: "Codice Civile", range: [587, 623], institutes: ["testamento", "testamento_olografo", "testamento_pubblico", "successione"] },
  { source: "Codice Civile", exact: 606, institutes: ["testamento", "testamento_olografo", "nullita", "annullabilita", "successione"] },
  { source: "Codice Civile", range: [624, 632], institutes: ["testamento", "successione"], onlyIfEmpty: true },
  { source: "Codice Civile", range: [649, 712], institutes: ["legato", "successione"], onlyIfEmpty: true },
  { source: "Codice Civile", range: [713, 768], institutes: ["divisione_ereditaria", "collazione", "successione"] },
  { source: "Codice Civile", range: [769, 809], institutes: ["donazione", "successione"], onlyIfEmpty: true },

  // LIBRO III: Diritti reali
  { source: "Codice Civile", range: [952, 977], institutes: ["diritto_superficie"], onlyIfEmpty: true },
  { source: "Codice Civile", range: [978, 1020], institutes: ["usufrutto"], onlyIfEmpty: true },
  { source: "Codice Civile", range: [1027, 1099], institutes: ["servitu_prediale"], onlyIfEmpty: true },
  { source: "Codice Civile", range: [1100, 1139], institutes: ["comunione", "divisione"] },
  { source: "Codice Civile", exact: 1111, institutes: ["comunione", "divisione", "scioglimento_comunione"] },
  { source: "Codice Civile", range: [1140, 1172], institutes: ["possesso", "usucapione"], onlyIfEmpty: true },

  // LIBRO IV: Override specifici
  { source: "Codice Civile", exact: 1176, institutes: ["obbligazione", "adempimento", "responsabilita_professionale", "diligenza"] },
  { source: "Codice Civile", range: [1277, 1279], institutes: ["obbligazione", "obbligazione_valutaria"] },
  { source: "Codice Civile", exact: 1456, institutes: ["risoluzione", "contratto", "inadempimento", "clausola_risolutiva_espressa"] },
  { source: "Codice Civile", range: [1958, 2042], institutes: ["transazione"], onlyIfEmpty: true },

  // LIBRO V: Lavoro (CRITICO)
  { source: "Codice Civile", range: [2060, 2093], institutes: ["lavoro_subordinato"], onlyIfEmpty: true },
  { source: "Codice Civile", range: [2094, 2113], institutes: ["lavoro_subordinato", "contratto_lavoro"] },
  { source: "Codice Civile", exact: 2110, institutes: ["lavoro_subordinato", "contratto_lavoro", "periodo_di_comporto", "malattia_lavoro"] },
  { source: "Codice Civile", exact: 2118, institutes: ["lavoro_subordinato", "contratto_lavoro", "preavviso", "licenziamento"] },
  { source: "Codice Civile", exact: 2119, institutes: ["lavoro_subordinato", "contratto_lavoro", "giusta_causa", "licenziamento"] },
  { source: "Codice Civile", exact: 2120, institutes: ["lavoro_subordinato", "trattamento_fine_rapporto"] },
  { source: "Codice Civile", range: [2121, 2134], institutes: ["lavoro_subordinato"], onlyIfEmpty: true },
  { source: "Codice Civile", range: [2135, 2221], institutes: ["lavoro_subordinato"], onlyIfEmpty: true },
  { source: "Codice Civile", range: [2291, 2312], institutes: ["snc", "responsabilita_solidale_socio", "societa_di_persone"] },
  { source: "Codice Civile", range: [2313, 2324], institutes: ["sas", "societa_di_persone"] },
  { source: "Codice Civile", range: [2511, 2545], institutes: ["cooperativa"], onlyIfEmpty: true },
  { source: "Codice Civile", range: [2555, 2574], institutes: ["azienda", "cessione_azienda"], onlyIfEmpty: true },
  { source: "Codice Civile", range: [2575, 2642], institutes: ["proprieta_intellettuale"], onlyIfEmpty: true },

  // LIBRO VI: Prove (CRITICO)
  { source: "Codice Civile", range: [2697, 2698], institutes: ["prova", "onere_prova"] },
  { source: "Codice Civile", range: [2699, 2720], institutes: ["prova", "prova_documentale", "atto_pubblico", "scrittura_privata"] },
  { source: "Codice Civile", range: [2721, 2726], institutes: ["prova", "prova_testimoniale"] },
  { source: "Codice Civile", range: [2727, 2739], institutes: ["prova", "presunzione"], onlyIfEmpty: true },
  { source: "Codice Civile", range: [2740, 2783], institutes: ["responsabilita_patrimoniale", "privilegio"], onlyIfEmpty: true },

  // ╔═══════════════════════════════════════════════════════════════╗
  // ║ PARTE B: CODICE DI PROCEDURA CIVILE                          ║
  // ╚═══════════════════════════════════════════════════════════════╝

  { source: "Codice di Procedura Civile", range: [1, 30], institutes: ["giurisdizione", "competenza"] },
  { source: "Codice di Procedura Civile", range: [31, 44], institutes: ["competenza", "connessione"] },
  { source: "Codice di Procedura Civile", range: [75, 81], institutes: ["legittimazione_processuale"] },
  { source: "Codice di Procedura Civile", range: [82, 98], institutes: ["difensore", "procura_alle_liti"] },
  { source: "Codice di Procedura Civile", range: [99, 112], institutes: ["domanda_giudiziale", "ultrapetita", "principio_dispositivo"] },
  { source: "Codice di Procedura Civile", range: [113, 120], institutes: ["poteri_giudice"] },
  { source: "Codice di Procedura Civile", range: [121, 162], institutes: ["atti_processuali", "notificazione", "termini_processuali"] },
  { source: "Codice di Procedura Civile", range: [163, 183], institutes: ["processo_cognizione", "atto_citazione", "preclusioni_istruttorie"] },
  { source: "Codice di Procedura Civile", exact: 171, institutes: ["processo_cognizione", "preclusioni_istruttorie", "riforma_cartabia", "deposito_documenti"] },
  { source: "Codice di Procedura Civile", range: [184, 190], institutes: ["processo_cognizione", "decisione"] },
  { source: "Codice di Procedura Civile", range: [191, 245], institutes: ["prova", "istruzione_probatoria"] },
  { source: "Codice di Procedura Civile", range: [191, 201], institutes: ["prova", "istruzione_probatoria", "CTU", "consulente_tecnico"] },
  { source: "Codice di Procedura Civile", range: [244, 257], institutes: ["prova", "istruzione_probatoria", "prova_testimoniale"] },
  { source: "Codice di Procedura Civile", range: [267, 274], institutes: ["intervento_terzo", "litisconsorzio"] },
  { source: "Codice di Procedura Civile", range: [275, 310], institutes: ["sentenza", "decisione"] },
  { source: "Codice di Procedura Civile", range: [282, 285], institutes: ["sentenza", "esecutorieta", "provvisoria_esecuzione"] },
  { source: "Codice di Procedura Civile", range: [295, 297], institutes: ["sospensione_processo"] },
  { source: "Codice di Procedura Civile", range: [323, 350], institutes: ["appello", "impugnazione"] },
  { source: "Codice di Procedura Civile", range: [353, 359], institutes: ["competenza", "impugnazione"] },
  { source: "Codice di Procedura Civile", range: [360, 394], institutes: ["ricorso_cassazione", "motivi_impugnazione", "impugnazione"] },
  { source: "Codice di Procedura Civile", exact: 360, institutes: ["ricorso_cassazione", "motivi_impugnazione", "impugnazione", "nullita_sentenza"] },
  { source: "Codice di Procedura Civile", range: [395, 408], institutes: ["revocazione", "impugnazione"] },
  { source: "Codice di Procedura Civile", range: [409, 441], institutes: ["processo_lavoro", "lavoro_subordinato"] },
  { source: "Codice di Procedura Civile", range: [442, 473], institutes: ["processo_locazione", "locazione"] },
  { source: "Codice di Procedura Civile", range: [474, 497], institutes: ["esecuzione_forzata", "titolo_esecutivo", "precetto"] },
  { source: "Codice di Procedura Civile", range: [498, 542], institutes: ["pignoramento", "esecuzione_forzata"] },
  { source: "Codice di Procedura Civile", exact: 545, institutes: ["pignoramento", "pignoramento_stipendio", "limiti_pignoramento", "esecuzione_forzata"] },
  { source: "Codice di Procedura Civile", range: [543, 554], institutes: ["pignoramento", "pignoramento_presso_terzi", "esecuzione_forzata"] },
  { source: "Codice di Procedura Civile", range: [555, 598], institutes: ["espropriazione", "pignoramento_immobiliare", "vendita_forzata", "esecuzione_forzata"] },
  { source: "Codice di Procedura Civile", range: [599, 620], institutes: ["espropriazione", "esecuzione_forzata"] },
  { source: "Codice di Procedura Civile", range: [615, 622], institutes: ["opposizione_esecuzione", "esecuzione_forzata"] },
  { source: "Codice di Procedura Civile", range: [624, 632], institutes: ["sospensione_esecuzione", "esecuzione_forzata"] },
  { source: "Codice di Procedura Civile", range: [633, 656], institutes: ["decreto_ingiuntivo", "opposizione_decreto_ingiuntivo"] },
  { source: "Codice di Procedura Civile", exact: 650, institutes: ["decreto_ingiuntivo", "opposizione_tardiva", "opposizione_decreto_ingiuntivo"] },
  { source: "Codice di Procedura Civile", range: [657, 669], institutes: ["sfratto", "convalida_sfratto", "locazione"] },
  { source: "Codice di Procedura Civile", range: [669, 700], institutes: ["procedimento_cautelare", "sequestro", "provvedimento_urgente"] },
  { source: "Codice di Procedura Civile", range: [702, 710], institutes: ["rito_sommario", "processo_cognizione"] },

  // ╔═══════════════════════════════════════════════════════════════╗
  // ║ PARTE C: CODICE PENALE                                       ║
  // ╚═══════════════════════════════════════════════════════════════╝

  { source: "Codice Penale", range: [1, 16], institutes: ["legge_penale", "irretroattivita"] },
  { source: "Codice Penale", range: [17, 38], institutes: ["pena", "reclusione", "multa"] },
  { source: "Codice Penale", range: [39, 49], institutes: ["reato", "dolo", "colpa"] },
  { source: "Codice Penale", range: [50, 55], institutes: ["legittima_difesa", "stato_necessita", "causa_giustificazione"] },
  { source: "Codice Penale", range: [56, 58], institutes: ["tentativo", "reato"] },
  { source: "Codice Penale", range: [59, 84], institutes: ["circostanze", "reato"] },
  { source: "Codice Penale", range: [85, 98], institutes: ["imputabilita", "reato"] },
  { source: "Codice Penale", range: [110, 119], institutes: ["concorso_persone", "reato"] },
  { source: "Codice Penale", range: [120, 131], institutes: ["querela", "procedibilita"] },
  { source: "Codice Penale", range: [150, 184], institutes: ["prescrizione_reato", "sospensione_condizionale", "estinzione_reato"] },
  { source: "Codice Penale", range: [185, 198], institutes: ["risarcimento_danno_reato", "restituzione"] },
  { source: "Codice Penale", range: [314, 360], institutes: ["corruzione", "peculato", "abuso_ufficio", "delitti_PA"] },
  { source: "Codice Penale", range: [453, 498], institutes: ["falso", "falsita_documento"] },
  { source: "Codice Penale", range: [515, 548], institutes: ["frode_commerciale", "truffa_contrattuale"] },
  { source: "Codice Penale", range: [570, 574], institutes: ["violazione_obblighi_familiari", "mantenimento", "delitti_famiglia"] },
  { source: "Codice Penale", range: [575, 593], institutes: ["omicidio", "lesioni_personali", "delitti_persona"] },
  { source: "Codice Penale", range: [600, 604], institutes: ["sfruttamento", "delitti_persona"] },
  { source: "Codice Penale", range: [610, 611], institutes: ["violenza_privata", "minaccia", "delitti_persona"] },
  // Art. 612-bis (stalking) and 612-ter (revenge porn) — special handling via ilike
  { source: "Codice Penale", ilike: "%612-ter%", institutes: ["revenge_porn", "diffusione_immagini_intime", "delitti_persona", "codice_rosso"] },
  { source: "Codice Penale", ilike: "%612-bis%", institutes: ["stalking", "atti_persecutori", "delitti_persona"] },
  { source: "Codice Penale", range: [614, 623], institutes: ["violazione_domicilio", "intercettazione", "registrazione_conversazione", "segreto_comunicazioni"] },
  { source: "Codice Penale", exact: 617, institutes: ["intercettazione", "registrazione_conversazione", "segreto_comunicazioni", "cognizione_illecita"] },
  { source: "Codice Penale", range: [624, 629], institutes: ["furto", "rapina", "delitti_patrimonio"] },
  { source: "Codice Penale", range: [640, 642], institutes: ["truffa", "delitti_patrimonio"] },
  { source: "Codice Penale", exact: 646, institutes: ["appropriazione_indebita", "delitti_patrimonio"] },
  { source: "Codice Penale", exact: 648, institutes: ["ricettazione", "delitti_patrimonio"] },

  // ╔═══════════════════════════════════════════════════════════════╗
  // ║ PARTE D: CODICE DEL CONSUMO — Estensione                     ║
  // ╚═══════════════════════════════════════════════════════════════╝

  { source: "Codice del Consumo", range: [1, 5], institutes: ["tutela_consumatore"], onlyIfEmpty: true },
  { source: "Codice del Consumo", range: [6, 17], institutes: ["tutela_consumatore", "informazione_consumatore"], onlyIfEmpty: true },
  { source: "Codice del Consumo", range: [18, 27], institutes: ["tutela_consumatore", "pratiche_commerciali_scorrette"], onlyIfEmpty: true },
  { source: "Codice del Consumo", exact: 33, institutes: ["clausole_abusive", "tutela_consumatore", "clausole_vessatorie", "nullita", "varianti_costruttore"] },
  { source: "Codice del Consumo", range: [45, 67], institutes: ["tutela_consumatore", "diritto_recesso", "contratto_distanza"] },
  { source: "Codice del Consumo", range: [52, 59], institutes: ["tutela_consumatore", "diritto_recesso", "contratto_distanza", "recesso_consumatore"] },
  { source: "Codice del Consumo", range: [102, 113], institutes: ["tutela_consumatore", "sicurezza_prodotti"], onlyIfEmpty: true },
  { source: "Codice del Consumo", range: [114, 127], institutes: ["tutela_consumatore", "responsabilita_produttore", "prodotto_difettoso"], onlyIfEmpty: true },
  { source: "Codice del Consumo", range: [128, 135], institutes: ["tutela_consumatore", "vizi_conformita", "garanzia_legale", "vendita"] },
  { source: "Codice del Consumo", range: [136, 141], institutes: ["tutela_consumatore", "garanzia_commerciale"], onlyIfEmpty: true },

  // ╔═══════════════════════════════════════════════════════════════╗
  // ║ PARTE E: FONTI SPECIALISTICHE ITALIANE                       ║
  // ╚═══════════════════════════════════════════════════════════════╝

  // D.Lgs. 122/2005
  { source: "Tutela acquirenti immobili da costruire", range: [1, 3], institutes: ["acquisto_immobile_da_costruire", "fideiussione_obbligatoria"] },
  { source: "Tutela acquirenti immobili da costruire", exact: 4, institutes: ["acquisto_immobile_da_costruire", "fideiussione_obbligatoria", "polizza_assicurativa"] },
  { source: "Tutela acquirenti immobili da costruire", range: [5, 6], institutes: ["acquisto_immobile_da_costruire", "preliminare"] },
  { source: "Tutela acquirenti immobili da costruire", range: [7, 19], institutes: ["acquisto_immobile_da_costruire"], onlyIfEmpty: true },

  // D.Lgs. 28/2010
  { source: "Mediazione civile e commerciale", range: [1, 4], institutes: ["mediazione", "mediazione_obbligatoria"] },
  { source: "Mediazione civile e commerciale", exact: 5, institutes: ["mediazione", "mediazione_obbligatoria", "condizione_procedibilita"] },
  { source: "Mediazione civile e commerciale", range: [6, 7], institutes: ["mediazione", "mediazione_obbligatoria"] },
  { source: "Mediazione civile e commerciale", exact: 8, institutes: ["mediazione", "mediazione_obbligatoria", "mancata_partecipazione_mediazione", "sanzione_mediazione"] },
  { source: "Mediazione civile e commerciale", range: [9, 13], institutes: ["mediazione", "accordo_mediazione"] },
  { source: "Mediazione civile e commerciale", range: [14, 44], institutes: ["mediazione"], onlyIfEmpty: true },

  // DPR 380/2001
  { source: "Testo Unico Edilizia", range: [1, 5], institutes: ["edilizia", "intervento_edilizio"] },
  { source: "Testo Unico Edilizia", range: [6, 23], institutes: ["edilizia", "permesso_costruire", "titolo_abilitativo"] },
  { source: "Testo Unico Edilizia", range: [24, 26], institutes: ["edilizia", "agibilita"] },
  { source: "Testo Unico Edilizia", range: [27, 50], institutes: ["edilizia", "abuso_edilizio", "sanzione_edilizia"] },
  { source: "Testo Unico Edilizia", exact: 46, institutes: ["edilizia", "abuso_edilizio", "nullita_atto_trasferimento", "vendita_immobiliare"] },
  { source: "Testo Unico Edilizia", range: [51, 92], institutes: ["edilizia", "norme_tecniche"], onlyIfEmpty: true },
  { source: "Testo Unico Edilizia", range: [93, 107], institutes: ["edilizia", "zona_sismica"], onlyIfEmpty: true },

  // L. 431/1998
  { source: "Disciplina delle locazioni abitative", range: [1, 2], institutes: ["locazione", "locazione_abitativa"] },
  { source: "Disciplina delle locazioni abitative", range: [3, 4], institutes: ["locazione", "locazione_abitativa", "durata_locazione", "rinnovo_contratto"] },
  { source: "Disciplina delle locazioni abitative", exact: 5, institutes: ["locazione", "locazione_abitativa", "canone_concordato"] },
  { source: "Disciplina delle locazioni abitative", range: [6, 18], institutes: ["locazione", "locazione_abitativa"], onlyIfEmpty: true },

  // TUB
  { source: "Testo Unico Bancario", range: [1, 10], institutes: ["bancario", "credito"] },
  { source: "Testo Unico Bancario", range: [115, 120], institutes: ["bancario", "trasparenza_bancaria"] },
  { source: "Testo Unico Bancario", range: [121, 128], institutes: ["bancario", "credito_consumo", "tutela_consumatore"] },
  { source: "Testo Unico Bancario", range: [129, 143], institutes: ["bancario", "mutuo_fondiario"], onlyIfEmpty: true },

  // D.Lgs. 231/2001
  { source: "Responsabilita amministrativa enti", range: [1, 4], institutes: ["responsabilita_ente", "compliance"] },
  { source: "Responsabilita amministrativa enti", range: [5, 8], institutes: ["responsabilita_ente", "compliance", "modello_231"] },
  { source: "Responsabilita amministrativa enti", range: [9, 23], institutes: ["responsabilita_ente", "sanzione", "modello_231"] },
  { source: "Responsabilita amministrativa enti", range: [24, 26], institutes: ["responsabilita_ente", "reato_presupposto", "modello_231"] },

  // L. 590/1965
  { source: "Prelazione agraria — L. 590/1965", exact: 8, institutes: ["prelazione_agraria", "riscatto_agrario", "affittuario_coltivatore"] },

  // Reg. CE 261/2004
  { source: "Regolamento passeggeri aerei (CE 261/2004)", range: [1, 4], institutes: ["passeggeri_aerei", "trasporto_aereo"] },
  { source: "Regolamento passeggeri aerei (CE 261/2004)", exact: 5, institutes: ["passeggeri_aerei", "cancellazione_volo", "compensazione_pecuniaria"] },
  { source: "Regolamento passeggeri aerei (CE 261/2004)", exact: 6, institutes: ["passeggeri_aerei", "ritardo_volo", "assistenza_passeggero"] },
  { source: "Regolamento passeggeri aerei (CE 261/2004)", exact: 7, institutes: ["passeggeri_aerei", "compensazione_pecuniaria"] },
  { source: "Regolamento passeggeri aerei (CE 261/2004)", range: [8, 9], institutes: ["passeggeri_aerei", "rimborso", "assistenza_passeggero"] },

  // ╔═══════════════════════════════════════════════════════════════╗
  // ║ PARTE F: FONTI HR                                             ║
  // ╚═══════════════════════════════════════════════════════════════╝

  // Statuto dei Lavoratori
  { source: ["Statuto dei Lavoratori", "Statuto dei Lavoratori (L. 300/1970)"], range: [1, 13], institutes: ["lavoro_subordinato", "diritti_lavoratore", "statuto_lavoratori"] },
  { source: ["Statuto dei Lavoratori", "Statuto dei Lavoratori (L. 300/1970)"], exact: 4, institutes: ["lavoro_subordinato", "controllo_distanza", "videosorveglianza", "statuto_lavoratori", "privacy_lavoro"] },
  { source: ["Statuto dei Lavoratori", "Statuto dei Lavoratori (L. 300/1970)"], exact: 7, institutes: ["lavoro_subordinato", "sanzione_disciplinare", "statuto_lavoratori"] },
  { source: ["Statuto dei Lavoratori", "Statuto dei Lavoratori (L. 300/1970)"], range: [14, 17], institutes: ["lavoro_subordinato", "liberta_sindacale", "statuto_lavoratori"] },
  { source: ["Statuto dei Lavoratori", "Statuto dei Lavoratori (L. 300/1970)"], exact: 18, institutes: ["lavoro_subordinato", "licenziamento", "reintegrazione", "statuto_lavoratori", "licenziamento_illegittimo"] },
  { source: ["Statuto dei Lavoratori", "Statuto dei Lavoratori (L. 300/1970)"], range: [19, 27], institutes: ["lavoro_subordinato", "attivita_sindacale", "statuto_lavoratori"] },

  // D.Lgs. 81/2008
  { source: "D.Lgs. 81/2008 — Testo Unico Sicurezza sul Lavoro", range: [1, 4], institutes: ["sicurezza_lavoro", "datore_lavoro"] },
  { source: "D.Lgs. 81/2008 — Testo Unico Sicurezza sul Lavoro", range: [15, 20], institutes: ["sicurezza_lavoro", "datore_lavoro", "valutazione_rischi", "DVR"] },
  { source: "D.Lgs. 81/2008 — Testo Unico Sicurezza sul Lavoro", range: [28, 30], institutes: ["sicurezza_lavoro", "DVR", "valutazione_rischi"] },
  { source: "D.Lgs. 81/2008 — Testo Unico Sicurezza sul Lavoro", range: [31, 35], institutes: ["sicurezza_lavoro", "RSPP"] },
  { source: "D.Lgs. 81/2008 — Testo Unico Sicurezza sul Lavoro", range: [36, 37], institutes: ["sicurezza_lavoro", "formazione_sicurezza"] },
  { source: "D.Lgs. 81/2008 — Testo Unico Sicurezza sul Lavoro", range: [41, 44], institutes: ["sicurezza_lavoro", "sorveglianza_sanitaria", "medico_competente"] },
  { source: "D.Lgs. 81/2008 — Testo Unico Sicurezza sul Lavoro", range: [47, 50], institutes: ["sicurezza_lavoro", "RLS"] },

  // D.Lgs. 81/2015
  { source: "D.Lgs. 81/2015 — Codice dei contratti di lavoro", range: [1, 12], institutes: ["lavoro_subordinato", "contratto_lavoro", "tempo_indeterminato"] },
  { source: "D.Lgs. 81/2015 — Codice dei contratti di lavoro", range: [13, 29], institutes: ["lavoro_subordinato", "contratto_lavoro", "tempo_determinato"] },
  { source: "D.Lgs. 81/2015 — Codice dei contratti di lavoro", range: [30, 40], institutes: ["lavoro_subordinato", "somministrazione_lavoro"] },
  { source: "D.Lgs. 81/2015 — Codice dei contratti di lavoro", range: [41, 47], institutes: ["lavoro_subordinato", "apprendistato"] },
  { source: "D.Lgs. 81/2015 — Codice dei contratti di lavoro", range: [48, 53], institutes: ["lavoro_subordinato", "part_time"] },

  // D.Lgs. 23/2015
  { source: ["Jobs Act — Tutele crescenti", "D.Lgs. 23/2015 — Jobs Act (Tutele Crescenti)"], range: [1, 5], institutes: ["lavoro_subordinato", "licenziamento", "licenziamento_illegittimo", "tutele_crescenti"] },
  { source: ["Jobs Act — Tutele crescenti", "D.Lgs. 23/2015 — Jobs Act (Tutele Crescenti)"], range: [6, 8], institutes: ["lavoro_subordinato", "licenziamento", "conciliazione", "tutele_crescenti"] },

  // D.Lgs. 276/2003
  { source: ["Riforma Biagi — Mercato del lavoro", "D.Lgs. 276/2003 — Riforma Biagi"], range: [1, 90], institutes: ["lavoro_subordinato", "mercato_lavoro", "lavoro_flessibile"], onlyIfEmpty: true },

  // D.Lgs. 148/2015
  { source: "D.Lgs. 148/2015 — Cassa Integrazione Guadagni", range: [1, 50], institutes: ["lavoro_subordinato", "cassa_integrazione", "ammortizzatori_sociali"], onlyIfEmpty: true },

  // ╔═══════════════════════════════════════════════════════════════╗
  // ║ PARTE G: FONTI EU                                             ║
  // ╚═══════════════════════════════════════════════════════════════╝

  // GDPR
  { source: "GDPR (Reg. 2016/679)", range: [1, 4], institutes: ["privacy", "protezione_dati", "GDPR"] },
  { source: "GDPR (Reg. 2016/679)", range: [5, 11], institutes: ["privacy", "protezione_dati", "GDPR", "principi_trattamento"] },
  { source: "GDPR (Reg. 2016/679)", exact: 6, institutes: ["privacy", "protezione_dati", "GDPR", "base_giuridica", "consenso"] },
  { source: "GDPR (Reg. 2016/679)", range: [12, 23], institutes: ["privacy", "protezione_dati", "GDPR", "diritti_interessato"] },
  { source: "GDPR (Reg. 2016/679)", range: [13, 14], institutes: ["privacy", "protezione_dati", "GDPR", "informativa_privacy"] },
  { source: "GDPR (Reg. 2016/679)", exact: 17, institutes: ["privacy", "protezione_dati", "GDPR", "diritto_oblio", "diritti_interessato"] },
  { source: "GDPR (Reg. 2016/679)", range: [24, 43], institutes: ["privacy", "protezione_dati", "GDPR", "titolare_trattamento"] },
  { source: "GDPR (Reg. 2016/679)", range: [33, 34], institutes: ["privacy", "protezione_dati", "GDPR", "data_breach"] },
  { source: "GDPR (Reg. 2016/679)", range: [35, 36], institutes: ["privacy", "protezione_dati", "GDPR", "DPIA"] },
  { source: "GDPR (Reg. 2016/679)", range: [44, 49], institutes: ["privacy", "protezione_dati", "GDPR", "trasferimento_dati"] },
  { source: "GDPR (Reg. 2016/679)", range: [77, 84], institutes: ["privacy", "protezione_dati", "GDPR", "sanzione_GDPR"] },

  // Dir. 93/13
  { source: "Direttiva clausole abusive (93/13/CEE)", range: [1, 20], institutes: ["clausole_abusive", "tutela_consumatore", "clausole_vessatorie"], onlyIfEmpty: true },

  // Dir. 2011/83
  { source: "Direttiva diritti dei consumatori (2011/83/UE)", range: [1, 40], institutes: ["tutela_consumatore", "diritto_recesso", "contratto_distanza"], onlyIfEmpty: true },

  // Dir. 2019/771
  { source: "Direttiva vendita beni (2019/771/UE)", range: [1, 30], institutes: ["tutela_consumatore", "vizi_conformita", "garanzia_legale", "vendita"], onlyIfEmpty: true },

  // Roma I
  { source: "Regolamento Roma I (593/2008)", range: [1, 30], institutes: ["diritto_internazionale_privato", "legge_applicabile", "contratto"], onlyIfEmpty: true },

  // DSA
  { source: "Digital Services Act (Reg. 2022/2065)", range: [1, 100], institutes: ["servizi_digitali", "piattaforme_online", "DSA"], onlyIfEmpty: true },

  // AI Act
  { source: "AI Act — Regolamento (UE) 2024/1689", range: [1, 4], institutes: ["intelligenza_artificiale", "AI_Act"] },
  { source: "AI Act — Regolamento (UE) 2024/1689", exact: 5, institutes: ["intelligenza_artificiale", "AI_Act", "AI_vietata"] },
  { source: "AI Act — Regolamento (UE) 2024/1689", range: [6, 49], institutes: ["intelligenza_artificiale", "AI_Act", "AI_alto_rischio"] },
  { source: "AI Act — Regolamento (UE) 2024/1689", range: [50, 56], institutes: ["intelligenza_artificiale", "AI_Act", "trasparenza_AI"] },

  // NIS2
  { source: "NIS2 — Direttiva (UE) 2022/2555", range: [1, 50], institutes: ["cybersicurezza", "NIS2"], onlyIfEmpty: true },
];

// ─── Execution engine ───

interface Article {
  id: string;
  law_source: string;
  article_reference: string;
  related_institutes: string[];
}

async function fetchArticlesForSource(source: string): Promise<Article[]> {
  const all: Article[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("legal_articles")
      .select("id, law_source, article_reference, related_institutes")
      .eq("law_source", source)
      .range(offset, offset + limit - 1);

    if (error) {
      console.error(`  ❌ Error fetching ${source}: ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...(data as Article[]));
    if (data.length < limit) break;
    offset += limit;
  }
  return all;
}

async function run(dryRun: boolean) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Migration 028: Populate related_institutes`);
  console.log(`  Mode: ${dryRun ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log(`${"═".repeat(60)}\n`);

  // Collect all unique sources from rules
  const allSources = new Set<string>();
  for (const rule of rules) {
    if (Array.isArray(rule.source)) {
      rule.source.forEach(s => allSources.add(s));
    } else {
      allSources.add(rule.source);
    }
  }

  // Fetch articles per source (cached)
  const articlesBySource = new Map<string, Article[]>();
  let totalArticles = 0;

  for (const source of allSources) {
    if (articlesBySource.has(source)) continue;
    const articles = await fetchArticlesForSource(source);
    articlesBySource.set(source, articles);
    totalArticles += articles.length;
    if (articles.length > 0) {
      console.log(`  📥 ${source}: ${articles.length} articles`);
    }
  }

  console.log(`\n  Total articles fetched: ${totalArticles}\n`);

  // Apply rules
  let totalUpdated = 0;
  let totalSkipped = 0;
  const updateBatch: { id: string; institutes: string[] }[] = [];

  for (const rule of rules) {
    const sources = Array.isArray(rule.source) ? rule.source : [rule.source];
    let matchCount = 0;

    for (const source of sources) {
      const articles = articlesBySource.get(source) || [];

      for (const article of articles) {
        // Check if article matches rule
        let matches = false;

        if (rule.ilike) {
          // ILIKE match on article_reference
          const pattern = rule.ilike.replace(/%/g, ".*");
          matches = new RegExp(pattern, "i").test(article.article_reference);
        } else if (rule.exact !== undefined) {
          const num = extractArticleNumber(article.article_reference);
          matches = num === rule.exact;
        } else if (rule.range) {
          const num = extractArticleNumber(article.article_reference);
          matches = num !== null && num >= rule.range[0] && num <= rule.range[1];
        }

        if (!matches) continue;

        // Check onlyIfEmpty
        if (rule.onlyIfEmpty && article.related_institutes && article.related_institutes.length > 0) {
          totalSkipped++;
          continue;
        }

        // Queue update (last rule wins for same article, like SQL)
        const existing = updateBatch.find(u => u.id === article.id);
        if (existing) {
          existing.institutes = rule.institutes;
        } else {
          updateBatch.push({ id: article.id, institutes: rule.institutes });
        }
        matchCount++; // eslint-disable-line @typescript-eslint/no-unused-vars
      }
    }
  }

  console.log(`  📊 Updates queued: ${updateBatch.length}`);
  console.log(`  📊 Skipped (already had institutes): ${totalSkipped}`);

  if (dryRun) {
    console.log(`\n  🔍 DRY RUN — no writes performed.`);
    // Show sample
    const sample = updateBatch.slice(0, 10);
    for (const u of sample) {
      console.log(`    ${u.id.slice(0, 8)}... → [${u.institutes.join(", ")}]`);
    }
    if (updateBatch.length > 10) {
      console.log(`    ... and ${updateBatch.length - 10} more`);
    }
    return;
  }

  // Execute updates in batches of 50
  const BATCH_SIZE = 50;
  for (let i = 0; i < updateBatch.length; i += BATCH_SIZE) {
    const batch = updateBatch.slice(i, i + BATCH_SIZE);

    // Use Promise.all for parallel updates within each batch
    const results = await Promise.all(
      batch.map(u =>
        supabase
          .from("legal_articles")
          .update({ related_institutes: u.institutes })
          .eq("id", u.id)
      )
    );

    const errors = results.filter(r => r.error);
    totalUpdated += batch.length - errors.length;

    if (errors.length > 0) {
      console.error(`  ❌ ${errors.length} errors in batch ${Math.floor(i / BATCH_SIZE) + 1}`);
    }

    // Progress
    const pct = Math.round(((i + batch.length) / updateBatch.length) * 100);
    process.stdout.write(`\r  ✏️  Updated ${i + batch.length}/${updateBatch.length} (${pct}%)`);
  }

  console.log(`\n\n  ✅ Migration complete: ${totalUpdated} articles updated.`);

  // Verification query
  const { data: stats } = await supabase
    .from("legal_articles")
    .select("law_source, related_institutes")
    .neq("related_institutes", "{}");

  const withInstitutes = stats?.length ?? 0;
  const { count: totalCount } = await supabase
    .from("legal_articles")
    .select("*", { count: "exact", head: true });

  console.log(`\n  📊 Coverage: ${withInstitutes}/${totalCount ?? "?"} articles have institutes`);
  console.log(`     (${totalCount ? Math.round((withInstitutes / totalCount) * 100) : "?"}%)\n`);
}

// ─── Main ───

const dryRun = process.argv.includes("--dry-run");
run(dryRun).catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
