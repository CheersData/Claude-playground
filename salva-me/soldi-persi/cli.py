"""
CLI per testare la pipeline Soldi Persi.

Usage:
    python cli.py analyze <file1> [file2] [file3] ... [--info '{"comune": "Padova"}']
    python cli.py demo  # Esegue con dati di esempio

Esempi:
    python cli.py analyze ./documenti/cu_2024.pdf ./documenti/bolletta_enel.pdf
    python cli.py demo
"""

import argparse
import asyncio
import json
import logging
import sys
from datetime import date
from pathlib import Path

# Ensure project root is on path
sys.path.insert(0, str(Path(__file__).parent))

from app.models.profile import (
    Contract,
    EmploymentInfo,
    Expense,
    FamilyMember,
    IncomeSource,
    PersonalInfo,
    PropertyOwned,
    UserFinancialProfile,
)
from app.models.report import FinalReport


def create_demo_profile() -> UserFinancialProfile:
    """Crea un profilo di esempio realistico: Mario Rossi, Padova."""
    return UserFinancialProfile(
        personal_info=PersonalInfo(
            nome="Mario",
            cognome="Rossi",
            codice_fiscale="RSSMRA89A01G224K",
            data_nascita=date(1989, 1, 1),
            comune_residenza="Padova",
            provincia="PD",
            regione="Veneto",
        ),
        famiglia=[
            FamilyMember(
                relazione="coniuge",
                nome="Laura",
                data_nascita=date(1990, 5, 15),
                a_carico=True,
            ),
            FamilyMember(
                relazione="figlio",
                nome="Sofia",
                data_nascita=date(2021, 3, 10),
                a_carico=True,
            ),
            FamilyMember(
                relazione="figlio",
                nome="Luca",
                data_nascita=date(2017, 9, 22),
                a_carico=True,
            ),
        ],
        employment=EmploymentInfo(
            tipo="dipendente",
            datore_lavoro="TechnoSteel S.r.l.",
            ral_annua=35000.0,
            reddito_netto=26000.0,
            ccnl="Metalmeccanico",
            livello="C3",
        ),
        redditi=[
            IncomeSource(
                tipo="lavoro_dipendente",
                importo_annuo_lordo=35000.0,
                ritenute=7500.0,
            ),
        ],
        spese=[
            Expense(
                categoria="interessi_mutuo",
                importo_annuo=3200.0,
                gia_detratta=True,
                descrizione="Interessi mutuo prima casa",
            ),
            Expense(
                categoria="mediche",
                importo_annuo=800.0,
                gia_detratta=False,
                descrizione="Visite specialistiche e farmaci",
            ),
        ],
        contratti=[
            Contract(
                tipo="energia",
                fornitore="Enel Energia",
                costo_mensile=85.0,
                costo_annuo=1020.0,
                dettagli={"consumo_kwh_anno": 2700, "potenza_kw": 3.0, "tipo": "mercato_libero"},
            ),
            Contract(
                tipo="gas",
                fornitore="Enel Energia",
                costo_mensile=120.0,
                costo_annuo=1440.0,
                dettagli={"consumo_smc_anno": 1400},
            ),
            Contract(
                tipo="assicurazione_auto",
                fornitore="UnipolSai",
                costo_annuo=450.0,
                dettagli={"classe_merito": "1", "tipo": "RC Auto base"},
            ),
            Contract(
                tipo="mutuo",
                fornitore="Intesa Sanpaolo",
                costo_mensile=700.0,
                dettagli={
                    "importo_originario": 150000,
                    "debito_residuo": 120000,
                    "tasso_tipo": "fisso",
                    "tasso_attuale": 3.8,
                    "durata_anni": 25,
                    "anno_stipula": 2020,
                },
            ),
        ],
        proprieta=[
            PropertyOwned(
                tipo="abitazione_principale",
                comune="Padova",
                anno_acquisto=2020,
                mutuo_residuo=120000.0,
            ),
        ],
        isee=25000.0,
        anno_riferimento=2024,
        documenti_analizzati=["CU_2024_demo.pdf", "busta_paga_demo.pdf"],
        dati_mancanti=[],
        confidence_score=0.85,
    )


def format_report(report: FinalReport) -> str:
    """Formatta il report per output CLI."""
    lines: list[str] = []

    lines.append("=" * 70)
    lines.append("         SOLDI PERSI — Report Analisi Finanziaria")
    lines.append("=" * 70)
    lines.append(f"  Data: {report.data_generazione.strftime('%d/%m/%Y %H:%M')}")
    lines.append(f"  Anno riferimento: {report.anno_riferimento}")
    lines.append(f"  Completezza profilo: {report.profilo_completezza:.0%}")
    lines.append(f"  Score salute finanziaria: {report.score_salute_finanziaria}/100")
    lines.append("")

    # Riepilogo
    lines.append("-" * 70)
    lines.append("  RIEPILOGO RISPARMIO POTENZIALE")
    lines.append("-" * 70)
    lines.append(f"  Risparmio stimato totale:  EUR {report.risparmio_totale_stimato:,.2f}")
    lines.append(f"  Range:  EUR {report.risparmio_minimo:,.2f} — EUR {report.risparmio_massimo:,.2f}")
    lines.append("")

    # Top 3 azioni
    if report.azioni_prioritarie:
        lines.append("-" * 70)
        lines.append("  TOP 3 AZIONI PRIORITARIE")
        lines.append("-" * 70)
        for i, azione in enumerate(report.azioni_prioritarie, 1):
            lines.append(f"  {i}. {azione['titolo']}")
            lines.append(f"     Risparmio: EUR {azione['risparmio']:,.2f}")
            lines.append(f"     Azione: {azione['azione']}")
            lines.append(f"     Urgenza: {azione.get('urgenza', 'N/A')}")
            lines.append("")

    # Sezione Fiscale
    if report.opportunita_fiscali.items:
        lines.append("-" * 70)
        lines.append(f"  OPPORTUNITA' FISCALI (Totale: EUR {report.opportunita_fiscali.totale_risparmio:,.2f})")
        lines.append("-" * 70)
        for item in report.opportunita_fiscali.items:
            lines.append(f"  * {item.titolo}")
            lines.append(f"    {item.descrizione}")
            lines.append(f"    Risparmio: EUR {item.risparmio_stimato_annuo:,.2f} | Difficolta: {item.difficolta}")
            lines.append(f"    Azione: {item.azione_richiesta}")
            lines.append("")

    # Sezione Costi
    if report.riduzioni_costo.items:
        lines.append("-" * 70)
        lines.append(f"  RIDUZIONI DI COSTO (Totale: EUR {report.riduzioni_costo.totale_risparmio:,.2f})")
        lines.append("-" * 70)
        for item in report.riduzioni_costo.items:
            lines.append(f"  * {item.titolo}")
            lines.append(f"    Attuale: EUR {item.costo_attuale_annuo:,.2f} | Benchmark: EUR {item.benchmark_mercato:,.2f}")
            lines.append(f"    Risparmio: EUR {item.risparmio_stimato_annuo:,.2f} | Sforzo: {item.sforzo_cambio}")
            if item.alternativa_suggerita:
                lines.append(f"    Alternativa: {item.alternativa_suggerita}")
            lines.append("")

    # Sezione Benefit
    if report.benefit_disponibili.items:
        lines.append("-" * 70)
        lines.append(f"  BONUS E AGEVOLAZIONI (Totale: EUR {report.benefit_disponibili.totale_risparmio:,.2f})")
        lines.append("-" * 70)
        for item in report.benefit_disponibili.items:
            lines.append(f"  * {item.titolo}")
            lines.append(f"    {item.descrizione}")
            lines.append(f"    Valore: EUR {item.valore_stimato:,.2f} | Ente: {item.nome_ente}")
            lines.append(f"    Come richiederlo: {item.come_richiederlo}")
            lines.append("")

    # Limitazioni
    if report.limitazioni:
        lines.append("-" * 70)
        lines.append("  LIMITAZIONI")
        lines.append("-" * 70)
        for lim in report.limitazioni:
            lines.append(f"  - {lim}")
        lines.append("")

    # Disclaimer
    lines.append("-" * 70)
    lines.append("  DISCLAIMER")
    lines.append("-" * 70)
    lines.append(f"  {report.disclaimer}")
    lines.append("")
    lines.append("=" * 70)

    return "\n".join(lines)


async def run_demo():
    """Esegue la pipeline con il profilo demo."""
    print("\nCreazione profilo demo (Mario Rossi, Padova)...")
    profile = create_demo_profile()

    print(f"Profilo: {profile.personal_info.nome} {profile.personal_info.cognome}")
    print(f"RAL: EUR {profile.employment.ral_annua:,.0f}")
    print(f"ISEE: EUR {profile.isee:,.0f}")
    print(f"Famiglia: {len(profile.famiglia)} componenti")
    print(f"Contratti: {len(profile.contratti)}")
    print()

    print("Avvio analisi multi-agente...")
    print("  - Tax Optimizer (analisi detrazioni/deduzioni)")
    print("  - Cost Benchmarker (confronto costi mercato)")
    print("  - Benefit Scout (ricerca bonus/agevolazioni)")
    print()

    from app.agents.orchestrator import OrchestratorAgent

    orchestrator = OrchestratorAgent()
    report = await orchestrator.analyze(profile)

    print(format_report(report))

    # Salva anche il JSON
    report_path = Path(__file__).parent / "report_demo.json"
    report_path.write_text(
        report.model_dump_json(indent=2),
        encoding="utf-8",
    )
    print(f"\nReport JSON salvato in: {report_path}")


async def run_analyze(file_paths: list[str], extra_info: dict | None = None):
    """Analizza i file forniti."""
    from app.agents.document_ingestion import DocumentIngestionAgent
    from app.agents.orchestrator import OrchestratorAgent

    # Verifica che i file esistano
    for fp in file_paths:
        if not Path(fp).exists():
            print(f"ERRORE: File non trovato: {fp}")
            sys.exit(1)

    print(f"\nAnalisi di {len(file_paths)} documenti...")

    # Step 1: Estrazione
    ingestion = DocumentIngestionAgent()
    profile = await ingestion.process_files(file_paths, extra_info)

    print(f"Profilo estratto: {profile.personal_info.nome} {profile.personal_info.cognome}")
    print(f"Completezza: {profile.confidence_score:.0%}")

    if profile.dati_mancanti:
        print(f"Dati mancanti: {', '.join(profile.dati_mancanti)}")

    print()

    # Step 2: Analisi
    orchestrator = OrchestratorAgent()
    report = await orchestrator.analyze(profile)

    print(format_report(report))

    # Salva JSON
    report_path = Path(__file__).parent / "report_output.json"
    report_path.write_text(
        report.model_dump_json(indent=2),
        encoding="utf-8",
    )
    print(f"\nReport JSON salvato in: {report_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Soldi Persi — Analisi finanziaria intelligente",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    subparsers = parser.add_subparsers(dest="command")

    # Comando demo
    subparsers.add_parser("demo", help="Esegui con dati di esempio (Mario Rossi)")

    # Comando analyze
    analyze_parser = subparsers.add_parser("analyze", help="Analizza documenti")
    analyze_parser.add_argument("files", nargs="+", help="File da analizzare")
    analyze_parser.add_argument(
        "--info",
        type=str,
        default=None,
        help='Info aggiuntive in JSON (es. \'{"comune": "Padova", "isee": 25000}\')',
    )

    args = parser.parse_args()

    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    if args.command == "demo":
        asyncio.run(run_demo())
    elif args.command == "analyze":
        extra_info = json.loads(args.info) if args.info else None
        asyncio.run(run_analyze(args.files, extra_info))
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
