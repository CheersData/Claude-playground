"""FastAPI application — Soldi Persi API."""

import json
import logging
import time
import uuid
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.agents.document_ingestion import DocumentIngestionAgent
from app.agents.orchestrator import OrchestratorAgent
from app.config import settings
from app.models.report import FinalReport

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Soldi Persi",
    description="Analisi finanziaria intelligente per contribuenti italiani",
    version="0.1.0",
)

# In-memory store per i report (MVP — in produzione usare un DB)
_reports: dict[str, dict] = {}


@app.get("/api/health")
async def health():
    """Health check."""
    return {"status": "ok", "version": "0.1.0"}


@app.post("/api/analyze")
async def analyze(
    files: list[UploadFile] = File(...),
    info_aggiuntive: str | None = Form(default=None),
):
    """Upload documenti e ottieni il report completo."""
    # Validazione
    if len(files) > settings.MAX_FILES_PER_REQUEST:
        raise HTTPException(
            status_code=400,
            detail=f"Massimo {settings.MAX_FILES_PER_REQUEST} file per richiesta",
        )

    for f in files:
        if f.size and f.size > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail=f"File '{f.filename}' supera il limite di {settings.MAX_FILE_SIZE_MB}MB",
            )

    extra_info = None
    if info_aggiuntive:
        try:
            extra_info = json.loads(info_aggiuntive)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=400,
                detail="info_aggiuntive deve essere un JSON valido",
            )

    start_time = time.time()

    # Salva file temporanei
    with TemporaryDirectory() as tmpdir:
        file_paths: list[str] = []
        for f in files:
            tmp_path = Path(tmpdir) / (f.filename or f"upload_{uuid.uuid4()}")
            content = await f.read()
            tmp_path.write_bytes(content)
            file_paths.append(str(tmp_path))

        # Step 1: Document Ingestion
        ingestion = DocumentIngestionAgent()
        profile = await ingestion.process_files(file_paths, extra_info)

        # Step 2: Orchestrator analysis
        orchestrator = OrchestratorAgent()
        report = await orchestrator.analyze(profile)

    elapsed = time.time() - start_time

    # Salva report in memory
    report_id = report.user_id
    _reports[report_id] = report.model_dump(mode="json")

    return {
        "status": "completed",
        "report_id": report_id,
        "report": report.model_dump(mode="json"),
        "processing_time_seconds": round(elapsed, 1),
    }


@app.post("/api/extract")
async def extract(
    files: list[UploadFile] = File(...),
    info_aggiuntive: str | None = Form(default=None),
):
    """Solo estrazione documenti (senza analisi)."""
    if len(files) > settings.MAX_FILES_PER_REQUEST:
        raise HTTPException(
            status_code=400,
            detail=f"Massimo {settings.MAX_FILES_PER_REQUEST} file per richiesta",
        )

    extra_info = None
    if info_aggiuntive:
        try:
            extra_info = json.loads(info_aggiuntive)
        except json.JSONDecodeError:
            raise HTTPException(
                status_code=400,
                detail="info_aggiuntive deve essere un JSON valido",
            )

    with TemporaryDirectory() as tmpdir:
        file_paths: list[str] = []
        for f in files:
            tmp_path = Path(tmpdir) / (f.filename or f"upload_{uuid.uuid4()}")
            content = await f.read()
            tmp_path.write_bytes(content)
            file_paths.append(str(tmp_path))

        ingestion = DocumentIngestionAgent()
        profile = await ingestion.process_files(file_paths, extra_info)

    return {
        "status": "completed",
        "profile": profile.model_dump(mode="json"),
    }


@app.get("/api/report/{report_id}")
async def get_report(report_id: str):
    """Recupera un report già generato."""
    if report_id not in _reports:
        raise HTTPException(status_code=404, detail="Report non trovato")
    return {"status": "ok", "report": _reports[report_id]}


@app.post("/api/demo")
async def demo_analyze():
    """Esegue l'analisi con il profilo demo (Mario Rossi). Richiede API key."""
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from cli import create_demo_profile

    start_time = time.time()
    profile = create_demo_profile()

    try:
        orchestrator = OrchestratorAgent()
        report = await orchestrator.analyze(profile)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Analisi fallita (controlla la API key nel .env): {str(e)}",
        )

    elapsed = time.time() - start_time

    report_id = report.user_id
    _reports[report_id] = report.model_dump(mode="json")

    return {
        "status": "completed",
        "report_id": report_id,
        "report": report.model_dump(mode="json"),
        "processing_time_seconds": round(elapsed, 1),
    }


@app.post("/api/demo/preview")
async def demo_preview():
    """Report finto ma realistico — funziona SENZA API key."""
    from datetime import datetime

    report = {
        "user_id": "preview-demo",
        "data_generazione": datetime.now().isoformat(),
        "anno_riferimento": 2024,
        "profilo_completezza": 0.85,
        "opportunita_fiscali": {
            "titolo": "Opportunità Fiscali",
            "items": [
                {
                    "id": "tax-1",
                    "titolo": "Spese mediche non detratte",
                    "descrizione": "Hai EUR 800 di spese mediche (visite specialistiche e farmaci) che non risultano in dichiarazione. Puoi recuperare il 19% sopra la franchigia di EUR 129.",
                    "riferimento_normativo": "Art. 15 TUIR, comma 1, lett. c",
                    "tipo": "detrazione",
                    "risparmio_stimato_annuo": 127.49,
                    "risparmio_minimo": 100.0,
                    "risparmio_massimo": 155.0,
                    "azione_richiesta": "Inserire le spese mediche nella prossima dichiarazione dei redditi (730). Conservare fatture e scontrini parlanti.",
                    "difficolta": "facile",
                    "urgenza": "prossima_dichiarazione",
                    "documenti_necessari": ["Fatture mediche", "Scontrini parlanti farmacia"],
                    "confidence": 0.95,
                    "prerequisiti": [],
                    "note": "Verifica che le spese siano tracciate (pagamento elettronico obbligatorio dal 2020)"
                },
                {
                    "id": "tax-2",
                    "titolo": "Previdenza complementare non attivata",
                    "descrizione": "Con il CCNL Metalmeccanico hai diritto a Cometa (fondo pensione di categoria). I contributi sono deducibili fino a EUR 5.164,57/anno, con contributo aggiuntivo del datore di lavoro.",
                    "riferimento_normativo": "Art. 10 TUIR + D.Lgs. 252/2005",
                    "tipo": "deduzione",
                    "risparmio_stimato_annuo": 890.0,
                    "risparmio_minimo": 600.0,
                    "risparmio_massimo": 1200.0,
                    "azione_richiesta": "Aderire al fondo Cometa tramite il datore di lavoro. Destinare il TFR e versare contributo minimo per ottenere il contributo aziendale.",
                    "difficolta": "facile",
                    "urgenza": "immediata",
                    "documenti_necessari": ["Modulo adesione Cometa", "Busta paga"],
                    "confidence": 0.9,
                    "prerequisiti": ["CCNL Metalmeccanico attivo"],
                    "note": "Il contributo datoriale del 2% sulla RAL e' 'soldi gratis' che stai perdendo"
                },
                {
                    "id": "tax-3",
                    "titolo": "Assicurazione vita/infortuni detraibile",
                    "descrizione": "Con famiglia e mutuo, un'assicurazione sulla vita e' consigliata ed e' detraibile al 19% fino a EUR 530/anno. Se non ne hai una, stai perdendo sia la copertura che il beneficio fiscale.",
                    "riferimento_normativo": "Art. 15 TUIR, comma 1, lett. f",
                    "tipo": "detrazione",
                    "risparmio_stimato_annuo": 100.7,
                    "risparmio_minimo": 80.0,
                    "risparmio_massimo": 130.0,
                    "azione_richiesta": "Valutare polizza vita con premio fino a EUR 530/anno. La detrazione copre il 19% del premio.",
                    "difficolta": "media",
                    "urgenza": "pianificazione",
                    "documenti_necessari": ["Polizza assicurativa"],
                    "confidence": 0.7,
                    "prerequisiti": [],
                    "note": None
                }
            ],
            "totale_risparmio": 1118.19
        },
        "riduzioni_costo": {
            "titolo": "Riduzioni di Costo",
            "items": [
                {
                    "id": "cost-1",
                    "titolo": "Bolletta energia sovrapprezzata",
                    "categoria": "energia",
                    "fornitore_attuale": "Enel Energia",
                    "costo_attuale_annuo": 1020.0,
                    "benchmark_mercato": 756.0,
                    "risparmio_stimato_annuo": 264.0,
                    "alternativa_suggerita": "Confronta offerte su ARERA Portale Offerte o Switcho. Per 2700 kWh/anno le migliori offerte mercato libero partono da EUR 63/mese.",
                    "sforzo_cambio": "minimo",
                    "rischio_cambio": None,
                    "fonte_benchmark": "Portale Offerte ARERA - medie mercato libero Q4 2024",
                    "note": "Il cambio fornitore e' gratuito e senza interruzione di servizio"
                },
                {
                    "id": "cost-2",
                    "titolo": "Fornitura gas sopra la media",
                    "categoria": "gas",
                    "fornitore_attuale": "Enel Energia",
                    "costo_attuale_annuo": 1440.0,
                    "benchmark_mercato": 1120.0,
                    "risparmio_stimato_annuo": 320.0,
                    "alternativa_suggerita": "Per 1400 smc/anno a Padova, le offerte migliori stanno intorno a EUR 93/mese. Valuta anche dual-fuel (luce+gas stesso fornitore) per sconto aggiuntivo.",
                    "sforzo_cambio": "minimo",
                    "rischio_cambio": None,
                    "fonte_benchmark": "Portale Offerte ARERA - medie mercato libero Q4 2024",
                    "note": None
                },
                {
                    "id": "cost-3",
                    "titolo": "Mutuo con tasso rinegoziabile",
                    "categoria": "mutuo",
                    "fornitore_attuale": "Intesa Sanpaolo",
                    "costo_attuale_annuo": 8400.0,
                    "benchmark_mercato": 7440.0,
                    "risparmio_stimato_annuo": 960.0,
                    "alternativa_suggerita": "Il tuo tasso fisso al 3.8% (stipulato 2020) e' sopra le offerte attuali (~2.9-3.2% per surroga). Con EUR 120k residui su 20 anni, una surroga puo' farti risparmiare EUR 80/mese. Chiedi preventivo a MutuiOnline.",
                    "sforzo_cambio": "medio",
                    "rischio_cambio": "Nessuna penale per surroga (legge Bersani). Tempi: 30-60 giorni.",
                    "fonte_benchmark": "MutuiOnline.it / Facile.it — medie tassi fissi surroga Feb 2025",
                    "note": "La surroga e' GRATUITA per il cliente. Tutte le spese sono a carico della nuova banca."
                }
            ],
            "totale_risparmio": 1544.0
        },
        "benefit_disponibili": {
            "titolo": "Bonus e Agevolazioni Disponibili",
            "items": [
                {
                    "id": "ben-1",
                    "titolo": "Assegno Unico potenzialmente non ottimizzato",
                    "descrizione": "Con ISEE EUR 25.000 e 2 figli (eta' 3 e 7), hai diritto all'Assegno Unico di circa EUR 162/mese per figlio. Verifica che l'importo sia corretto e che tu stia ricevendo le maggiorazioni per nucleo con 2+ figli.",
                    "ente_erogatore": "inps",
                    "nome_ente": "INPS",
                    "valore_stimato": 350.0,
                    "valore_minimo": 200.0,
                    "valore_massimo": 500.0,
                    "tipo": "contributo_periodico",
                    "eligibilita_confidence": 0.8,
                    "requisiti": ["ISEE in corso di validita'", "Figli a carico under 21"],
                    "requisiti_mancanti": ["Importo attuale Assegno Unico non verificabile"],
                    "scadenza_domanda": None,
                    "come_richiederlo": "Verificare importo su MyINPS > Assegno Unico. Se non lo percepisci, fare domanda su INPS online o tramite CAF/Patronato.",
                    "link_ufficiale": None,
                    "note": "L'importo dipende dall'ISEE: con EUR 25k dovresti ricevere circa EUR 162/figlio/mese"
                },
                {
                    "id": "ben-2",
                    "titolo": "Bonus asilo nido",
                    "descrizione": "Sofia (3 anni) potrebbe avere diritto al bonus asilo nido fino a EUR 2.500/anno con ISEE sotto EUR 25.000. Il bonus copre le rette dell'asilo nido.",
                    "ente_erogatore": "inps",
                    "nome_ente": "INPS",
                    "valore_stimato": 2500.0,
                    "valore_minimo": 1500.0,
                    "valore_massimo": 2500.0,
                    "tipo": "contributo_periodico",
                    "eligibilita_confidence": 0.75,
                    "requisiti": ["Figlio under 3 iscritto ad asilo nido", "ISEE sotto EUR 25.000"],
                    "requisiti_mancanti": ["Non sappiamo se Sofia frequenta un asilo nido"],
                    "scadenza_domanda": None,
                    "come_richiederlo": "Domanda su INPS online > Bonus Nido. Servono ricevute di pagamento rette asilo.",
                    "link_ufficiale": None,
                    "note": "Se Sofia va al nido, questo bonus da solo vale piu' di tutto il resto"
                },
                {
                    "id": "ben-3",
                    "titolo": "Contributo regionale famiglia Veneto",
                    "descrizione": "La Regione Veneto prevede contributi per famiglie con figli. Con ISEE EUR 25.000 e residenza a Padova, potresti accedere al bando regionale.",
                    "ente_erogatore": "regione",
                    "nome_ente": "Regione Veneto",
                    "valore_stimato": 600.0,
                    "valore_minimo": 300.0,
                    "valore_massimo": 1000.0,
                    "tipo": "bonus_una_tantum",
                    "eligibilita_confidence": 0.6,
                    "requisiti": ["Residenza in Veneto", "ISEE sotto soglia regionale", "Figli a carico"],
                    "requisiti_mancanti": ["Bando attuale da verificare sul sito della Regione"],
                    "scadenza_domanda": None,
                    "come_richiederlo": "Consultare il sito della Regione Veneto > Bandi Famiglia oppure rivolgersi a un CAF.",
                    "link_ufficiale": None,
                    "note": None
                }
            ],
            "totale_risparmio": 3450.0
        },
        "risparmio_totale_stimato": 6112.19,
        "risparmio_minimo": 4280.0,
        "risparmio_massimo": 8485.0,
        "azioni_prioritarie": [
            {
                "titolo": "Bonus asilo nido per Sofia",
                "risparmio": 2500.0,
                "azione": "Verificare se Sofia frequenta un asilo nido e fare domanda su INPS online",
                "urgenza": "immediata"
            },
            {
                "titolo": "Surroga mutuo (da 3.8% a ~3.0%)",
                "risparmio": 960.0,
                "azione": "Richiedere preventivi di surroga su MutuiOnline.it — la surroga e' GRATUITA",
                "urgenza": "immediata"
            },
            {
                "titolo": "Fondo pensione Cometa — contributo datoriale perso",
                "risparmio": 890.0,
                "azione": "Aderire al fondo Cometa tramite HR per ottenere il contributo aziendale del 2%",
                "urgenza": "immediata"
            }
        ],
        "documenti_analizzati": ["CU_2024_demo.pdf", "busta_paga_demo.pdf"],
        "limitazioni": [
            "Dati basati su profilo demo — i valori reali dipendono dalla tua situazione specifica",
            "Benchmark costi aggiornati a Q4 2024",
            "Bonus regionali soggetti a bandi periodici"
        ],
        "disclaimer": "Questo report e' generato automaticamente e ha valore puramente informativo. Le stime di risparmio sono indicative e basate su dati di mercato generali. Si consiglia di verificare le opportunita' identificate con un professionista abilitato (commercialista, consulente finanziario) prima di intraprendere azioni. Soldi Persi non e' un CAF ne' un intermediario finanziario.",
        "score_salute_finanziaria": 72,
        "confronto_media_nazionale": None,
    }

    return {
        "status": "completed",
        "report_id": "preview-demo",
        "report": report,
        "processing_time_seconds": 0.1,
    }


# ---- Static files (MUST be last — catches all non-API routes) ----
# html=True serves index.html for "/" and any directory request
_static_dir = Path(__file__).parent / "static"
_static_dir.mkdir(exist_ok=True)
app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="frontend")
