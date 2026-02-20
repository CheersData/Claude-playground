"""FastAPI application — risparmia.me API."""

import json
import logging
import time
import uuid
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.staticfiles import StaticFiles

from app.agents.document_ingestion import DocumentIngestionAgent
from app.agents.orchestrator import OrchestratorAgent
from app.config import settings
from app.models.report import FinalReport

logger = logging.getLogger(__name__)

app = FastAPI(title="risparmia.me", description="Scopri quanto puoi risparmiare ogni anno", version="0.2.0")
_reports: dict[str, dict] = {}


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.2.0"}


@app.post("/api/analyze")
async def analyze(files: list[UploadFile] = File(...), info_aggiuntive: str | None = Form(default=None)):
    """Upload documenti e ottieni il report completo."""
    if len(files) > settings.MAX_FILES_PER_REQUEST:
        raise HTTPException(status_code=400, detail=f"Massimo {settings.MAX_FILES_PER_REQUEST} file")
    for f in files:
        if f.size and f.size > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"File '{f.filename}' troppo grande")
    extra_info = json.loads(info_aggiuntive) if info_aggiuntive else None
    start_time = time.time()
    with TemporaryDirectory() as tmpdir:
        file_paths = []
        for f in files:
            p = Path(tmpdir) / (f.filename or f"upload_{uuid.uuid4()}")
            p.write_bytes(await f.read())
            file_paths.append(str(p))
        ingestion = DocumentIngestionAgent()
        profile = await ingestion.process_files(file_paths, extra_info)
        orchestrator = OrchestratorAgent()
        report = await orchestrator.analyze(profile)
    elapsed = time.time() - start_time
    _reports[report.user_id] = report.model_dump(mode="json")
    return {"status": "completed", "report_id": report.user_id, "report": report.model_dump(mode="json"), "processing_time_seconds": round(elapsed, 1)}


@app.post("/api/extract")
async def extract(files: list[UploadFile] = File(...), info_aggiuntive: str | None = Form(default=None)):
    extra_info = json.loads(info_aggiuntive) if info_aggiuntive else None
    with TemporaryDirectory() as tmpdir:
        file_paths = []
        for f in files:
            p = Path(tmpdir) / (f.filename or f"upload_{uuid.uuid4()}")
            p.write_bytes(await f.read())
            file_paths.append(str(p))
        ingestion = DocumentIngestionAgent()
        profile = await ingestion.process_files(file_paths, extra_info)
    return {"status": "completed", "profile": profile.model_dump(mode="json")}


@app.get("/api/report/{report_id}")
async def get_report(report_id: str):
    if report_id not in _reports:
        raise HTTPException(status_code=404, detail="Report non trovato")
    return {"status": "ok", "report": _reports[report_id]}


@app.post("/api/demo")
async def demo_analyze():
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from cli import create_demo_profile
    start_time = time.time()
    try:
        orchestrator = OrchestratorAgent()
        report = await orchestrator.analyze(create_demo_profile())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analisi fallita (controlla API key): {e}")
    elapsed = time.time() - start_time
    _reports[report.user_id] = report.model_dump(mode="json")
    return {"status": "completed", "report_id": report.user_id, "report": report.model_dump(mode="json"), "processing_time_seconds": round(elapsed, 1)}


@app.post("/api/smart-preview")
async def smart_preview(request: Request):
    """Report personalizzato dal questionario — NO API key."""
    data = await request.json()
    abitazione = data.get("abitazione", "")
    affitto_mensile = float(data.get("affitto_mensile") or 0)
    mutuo_rata = float(data.get("mutuo_rata") or 0)
    mutuo_tasso = float(data.get("mutuo_tasso") or 0)
    mutuo_residuo = float(data.get("mutuo_residuo") or 0)
    mutuo_banca = data.get("mutuo_banca", "")
    ral = float(data.get("ral") or 0)
    tipo_lavoro = data.get("tipo_lavoro", "")
    ccnl = data.get("ccnl", "")
    figli = data.get("figli", [])
    piano_pensione = data.get("piano_pensione", "non_so")
    energia_fornitore = data.get("energia_fornitore", "")
    energia_mensile = float(data.get("energia_mensile") or 0)
    gas_fornitore = data.get("gas_fornitore", "")
    gas_mensile = float(data.get("gas_mensile") or 0)
    internet_fornitore = data.get("internet_fornitore", "")
    internet_mensile = float(data.get("internet_mensile") or 0)
    assicurazione_fornitore = data.get("assicurazione_fornitore", "")
    assicurazione_annua = float(data.get("assicurazione_annua") or 0)
    comune = data.get("comune", "")
    isee = float(data.get("isee") or 0)

    tax_items, cost_items, benefit_items = [], [], []
    tax_total = cost_total = benefit_total = 0.0

    # --- FISCALE ---
    if abitazione == "affitto" and affitto_mensile > 0 and ral and ral < 30987:
        r = 495.80 if ral <= 15493 else 247.90
        tax_items.append({"id":"tax-affitto","titolo":"Detrazione canone di locazione","descrizione":f"Reddito EUR {ral:,.0f}, affitto EUR {affitto_mensile:,.0f}/mese: detrai EUR {r:,.0f}/anno. Con canone concordato sale.","riferimento_normativo":"Art. 16 TUIR","tipo":"detrazione","risparmio_stimato_annuo":r,"risparmio_minimo":r,"risparmio_massimo":round(r*1.4,2),"azione_richiesta":"730 Quadro E Sez V. Conserva contratto registrato.","difficolta":"facile","urgenza":"prossima_dichiarazione","documenti_necessari":["Contratto registrato"],"confidence":0.9,"prerequisiti":[],"note":None})
        tax_total += r

    if abitazione == "proprieta_mutuo" and mutuo_rata > 0:
        interessi = min(mutuo_rata * 12 * 0.55, 4000)
        r = round(interessi * 0.19, 2)
        tax_items.append({"id":"tax-mutuo","titolo":"Detrazione interessi mutuo","descrizione":f"Rata EUR {mutuo_rata:,.0f}/mese, interessi ~EUR {interessi:,.0f}/anno. Detrazione 19% fino a EUR 4.000.","riferimento_normativo":"Art. 15 TUIR","tipo":"detrazione","risparmio_stimato_annuo":r,"risparmio_minimo":round(r*0.8,2),"risparmio_massimo":760.0,"azione_richiesta":"Verifica interessi nel 730. La banca manda certificazione.","difficolta":"facile","urgenza":"prossima_dichiarazione","documenti_necessari":["Certificazione banca"],"confidence":0.85,"prerequisiti":[],"note":None})
        tax_total += r

    if piano_pensione != "si" and tipo_lavoro in ("dipendente", "autonomo"):
        base = min(ral * 0.04, 5164.57) if ral else 1500
        aliq = 0.35 if (ral and ral > 28000) else 0.27
        r = round(base * aliq, 2)
        fondo = ""
        if ccnl:
            for k, v in {"metalmeccanico":"Cometa","commercio":"Fon.Te","chimico":"Fonchim","edil":"Prevedi"}.items():
                if k in ccnl.lower():
                    fondo = f" Fondo categoria: {v}."
                    break
        desc = f"Contributi deducibili fino a EUR 5.164/anno."
        if tipo_lavoro == "dipendente":
            desc += f" Il datore versa contributo aggiuntivo — soldi gratis che perdi.{fondo}"
        tax_items.append({"id":"tax-pensione","titolo":"Previdenza complementare","descrizione":desc,"riferimento_normativo":"Art. 10 TUIR + D.Lgs. 252/2005","tipo":"deduzione","risparmio_stimato_annuo":r,"risparmio_minimo":round(r*0.6,2),"risparmio_massimo":2220.0,"azione_richiesta":"Aderisci a fondo pensione. Dipendente? Chiedi HR.","difficolta":"facile","urgenza":"immediata","documenti_necessari":["Modulo adesione"],"confidence":0.9,"prerequisiti":[],"note":"Contributo datoriale = soldi che perdi se non aderisci"})
        tax_total += r

    tax_items.append({"id":"tax-mediche","titolo":"Spese mediche: deduci tutto?","descrizione":"Visite, farmaci, dentista, occhiali al 19% sopra EUR 129. Media persa: EUR 100-300/anno.","riferimento_normativo":"Art. 15 TUIR","tipo":"detrazione","risparmio_stimato_annuo":150.0,"risparmio_minimo":50.0,"risparmio_massimo":400.0,"azione_richiesta":"Conserva fatture e scontrini parlanti.","difficolta":"facile","urgenza":"prossima_dichiarazione","documenti_necessari":["Fatture","Scontrini"],"confidence":0.7,"prerequisiti":[],"note":"Pagamento tracciabile dal 2020"})
    tax_total += 150.0

    if figli:
        fs = [f for f in figli if 5 <= (f.get("eta") or 0) <= 18]
        if fs:
            r = len(fs) * 40
            tax_items.append({"id":"tax-sport","titolo":"Detrazione sport figli","descrizione":f"Sport figli 5-18: 19% fino a EUR 210/figlio. {len(fs)} in eta'.","riferimento_normativo":"Art. 15 TUIR","tipo":"detrazione","risparmio_stimato_annuo":float(r),"risparmio_minimo":0.0,"risparmio_massimo":float(r),"azione_richiesta":"Conserva ricevute sport.","difficolta":"facile","urgenza":"prossima_dichiarazione","documenti_necessari":["Ricevute sport"],"confidence":0.7,"prerequisiti":[],"note":None})
            tax_total += r

    # --- COSTI ---
    if energia_mensile > 0 and energia_mensile > 63 * 1.1:
        r = round((energia_mensile - 63) * 12, 2)
        cost_items.append({"id":"cost-energia","titolo":"Bolletta luce: stai pagando troppo","categoria":"energia","fornitore_attuale":energia_fornitore or "Attuale","costo_attuale_annuo":round(energia_mensile*12,2),"benchmark_mercato":round(63*12,2),"risparmio_stimato_annuo":r,"alternativa_suggerita":"Migliori offerte da ~EUR 63/mese. Confronta GRATIS: portaleofferte.it, Switcho.it, Segugio.it. Cambio gratuito, 5 min online.","sforzo_cambio":"minimo","rischio_cambio":None,"fonte_benchmark":"ARERA 2024","note":"Cambio gratuito senza interruzioni"})
        cost_total += r

    if gas_mensile > 0 and gas_mensile > 93 * 1.1:
        r = round((gas_mensile - 93) * 12, 2)
        cost_items.append({"id":"cost-gas","titolo":"Bolletta gas: puoi risparmiare","categoria":"gas","fornitore_attuale":gas_fornitore or "Attuale","costo_attuale_annuo":round(gas_mensile*12,2),"benchmark_mercato":round(93*12,2),"risparmio_stimato_annuo":r,"alternativa_suggerita":"Offerte gas da ~EUR 93/mese. Dual-fuel (luce+gas) per sconti extra. Confronta: portaleofferte.it, Switcho.it.","sforzo_cambio":"minimo","rischio_cambio":None,"fonte_benchmark":"ARERA 2024","note":None})
        cost_total += r

    if internet_mensile > 0 and internet_mensile > 25 * 1.15:
        r = round((internet_mensile - 25) * 12, 2)
        cost_items.append({"id":"cost-internet","titolo":"Internet: offerte migliori","categoria":"internet","fornitore_attuale":internet_fornitore or "Attuale","costo_attuale_annuo":round(internet_mensile*12,2),"benchmark_mercato":300.0,"risparmio_stimato_annuo":r,"alternativa_suggerita":"Fibra da EUR 25/mese (Iliad 21.99, Fastweb 24.95). Confronta SOStariffe.it.","sforzo_cambio":"minimo","rischio_cambio":"Verifica penali recesso","fonte_benchmark":"SOStariffe.it 2024","note":None})
        cost_total += r

    if assicurazione_annua > 0 and assicurazione_annua > 350 * 1.15:
        r = round(assicurazione_annua - 350, 2)
        cost_items.append({"id":"cost-auto","titolo":"RC Auto: confronta","categoria":"assicurazione","fornitore_attuale":assicurazione_fornitore or "Attuale","costo_attuale_annuo":assicurazione_annua,"benchmark_mercato":350.0,"risparmio_stimato_annuo":r,"alternativa_suggerita":"RC Auto da ~EUR 350/anno. Confronta: Facile.it, Segugio.it, Prima.it.","sforzo_cambio":"minimo","rischio_cambio":None,"fonte_benchmark":"Facile.it 2024","note":"30gg prima della scadenza"})
        cost_total += r

    if abitazione == "proprieta_mutuo" and mutuo_tasso > 3.2 and mutuo_residuo > 50000:
        d = mutuo_tasso - 2.9
        rm = round(mutuo_residuo * d / 100 / 12 * 0.7, 2)
        r = round(rm * 12, 2)
        cost_items.append({"id":"cost-surroga","titolo":"Surroga mutuo","categoria":"mutuo","fornitore_attuale":mutuo_banca or "Banca","costo_attuale_annuo":round(mutuo_rata*12,2),"benchmark_mercato":round((mutuo_rata-rm)*12,2),"risparmio_stimato_annuo":r,"alternativa_suggerita":f"Tasso {mutuo_tasso}% vs ~2.9%. Su EUR {mutuo_residuo:,.0f} = ~EUR {rm:,.0f}/mese meno. SURROGA GRATUITA. MutuiOnline.it, Facile.it.","sforzo_cambio":"medio","rischio_cambio":"Zero penali, 30-60gg","fonte_benchmark":"MutuiOnline.it 2025","note":"Surroga = diritto, costa ZERO"})
        cost_total += r

    # --- BENEFIT ---
    if figli:
        fu = [f for f in figli if (f.get("eta") or 0) < 21]
        if fu:
            imp = 199 if (isee and isee <= 17090) else (162 if (isee and isee <= 25000) else (100 if (isee and isee <= 40000) else 57))
            magg = 96 if (len(fu) >= 2 and isee and isee <= 17090) else (16 if len(fu) >= 2 else 0)
            mens = imp * len(fu) + magg
            ott = round(mens * 12 * 0.1, 2)
            benefit_items.append({"id":"ben-assegno","titolo":"Assegno Unico","descrizione":f"{len(fu)} figli" + (f", ISEE EUR {isee:,.0f}" if isee else "") + f": ~EUR {mens:,.0f}/mese. Verifica importo e maggiorazioni su MyINPS.","ente_erogatore":"inps","nome_ente":"INPS","valore_stimato":ott,"valore_minimo":round(ott*0.5,2),"valore_massimo":round(ott*2,2),"tipo":"contributo_periodico","eligibilita_confidence":0.9,"requisiti":["ISEE valido"],"requisiti_mancanti":[],"scadenza_domanda":None,"come_richiederlo":"MyINPS > Assegno Unico oppure CAF.","link_ufficiale":None,"note":f"Stima: EUR {mens:,.0f}/mese"})
            benefit_total += ott
        fn = [f for f in figli if (f.get("eta") or 0) <= 3]
        if fn:
            val = 2500 if (isee and isee <= 25000) else (1500 if (isee and isee <= 40000) else 1000)
            benefit_items.append({"id":"ben-nido","titolo":"Bonus Asilo Nido","descrizione":f"Figlio under 3" + (f", ISEE EUR {isee:,.0f}" if isee else "") + f": fino a EUR {val:,.0f}/anno.","ente_erogatore":"inps","nome_ente":"INPS","valore_stimato":float(val),"valore_minimo":1000.0,"valore_massimo":2500.0,"tipo":"contributo_periodico","eligibilita_confidence":0.8,"requisiti":["Figlio al nido"],"requisiti_mancanti":["Conferma iscrizione"],"scadenza_domanda":None,"come_richiederlo":"INPS online > Bonus Nido.","link_ufficiale":None,"note":"Da solo puo' valere piu' di tutto!"})
            benefit_total += val

    if comune:
        benefit_items.append({"id":"ben-locale","titolo":f"Agevolazioni — {comune}","descrizione":"Bonus famiglia, TARI ridotta, contributi affitto, borse studio." + (f" ISEE EUR {isee:,.0f}." if isee else ""),"ente_erogatore":"comune","nome_ente":f"Comune di {comune}","valore_stimato":400.0,"valore_minimo":100.0,"valore_massimo":1500.0,"tipo":"bonus_una_tantum","eligibilita_confidence":0.5,"requisiti":[f"Residenza {comune}"],"requisiti_mancanti":["Bandi da verificare"],"scadenza_domanda":None,"come_richiederlo":f"Sito Comune di {comune} o CAF.","link_ufficiale":None,"note":None})
        benefit_total += 400.0

    totale = round(tax_total + cost_total + benefit_total, 2)
    all_act = []
    for it in tax_items:
        all_act.append({"titolo":it["titolo"],"risparmio":it["risparmio_stimato_annuo"],"azione":it["azione_richiesta"],"urgenza":it.get("urgenza","pianificazione")})
    for it in cost_items:
        all_act.append({"titolo":it["titolo"],"risparmio":it["risparmio_stimato_annuo"],"azione":(it.get("alternativa_suggerita") or "")[:200],"urgenza":"immediata"})
    for it in benefit_items:
        all_act.append({"titolo":it["titolo"],"risparmio":it["valore_stimato"],"azione":it["come_richiederlo"],"urgenza":"immediata"})
    all_act.sort(key=lambda x: x["risparmio"], reverse=True)

    score = 50
    if not cost_items: score += 15
    if piano_pensione == "si": score += 10
    compl = 0.5 + (0.1 if ral else 0) + (0.1 if isee else 0) + (0.05 if comune else 0) + (0.1 if energia_mensile or gas_mensile else 0) + (0.1 if abitazione else 0)

    report = {
        "user_id":"smart-preview","data_generazione":datetime.now().isoformat(),"anno_riferimento":2024,
        "profilo_completezza":min(compl,1.0),
        "opportunita_fiscali":{"titolo":"Opportunita' Fiscali","items":tax_items,"totale_risparmio":round(tax_total,2)},
        "riduzioni_costo":{"titolo":"Riduzioni di Costo","items":cost_items,"totale_risparmio":round(cost_total,2)},
        "benefit_disponibili":{"titolo":"Bonus e Agevolazioni","items":benefit_items,"totale_risparmio":round(benefit_total,2)},
        "risparmio_totale_stimato":totale,"risparmio_minimo":round(totale*0.6,2),"risparmio_massimo":round(totale*1.5,2),
        "azioni_prioritarie":all_act[:3],"documenti_analizzati":[],
        "limitazioni":["Stime dal questionario — carica documenti per piu' precisione","Benchmark costi indicativi 2024","Bonus locali variano"],
        "disclaimer":"Report informativo automatico. Stime indicative. Verifica con commercialista/CAF. risparmia.me non e' un CAF.",
        "score_salute_finanziaria":min(score,100),"confronto_media_nazionale":None,
    }
    return {"status":"completed","report_id":"smart-preview","report":report,"processing_time_seconds":0.1}


_static_dir = Path(__file__).parent / "static"
_static_dir.mkdir(exist_ok=True)
app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="frontend")
