import logging
from datetime import date

from app.models.profile import (
    Contract,
    EmploymentInfo,
    Expense,
    FamilyMember,
    IncomeSource,
    PersonalInfo,
    PropertyOwned,
    UserFinancialProfile,
    DocumentExtractionResult,
)

logger = logging.getLogger(__name__)


def merge_extraction_results(
    results: list[DocumentExtractionResult],
    extra_info: dict | None = None,
) -> UserFinancialProfile:
    """Unisce i risultati di estrazione da più documenti in un UserFinancialProfile."""

    personal_info = PersonalInfo(nome="", cognome="")
    employment: EmploymentInfo | None = None
    famiglia: list[FamilyMember] = []
    redditi: list[IncomeSource] = []
    spese: list[Expense] = []
    contratti: list[Contract] = []
    proprieta: list[PropertyOwned] = []
    isee: float | None = None
    documenti_analizzati: list[str] = []
    dati_mancanti: list[str] = []
    confidence_scores: list[float] = []

    for result in results:
        documenti_analizzati.append(result.filename)
        confidence_scores.append(result.confidence)
        data = result.dati_estratti

        if result.tipo_documento == "cu":
            _merge_cu(data, personal_info, redditi, famiglia)

        elif result.tipo_documento == "busta_paga":
            _merge_busta_paga(data, personal_info, employment)
            if not employment and data:
                employment = EmploymentInfo(
                    tipo="dipendente",
                    datore_lavoro=data.get("datore_lavoro"),
                    ral_annua=data.get("ral_annua"),
                    ccnl=data.get("ccnl"),
                    livello=data.get("livello"),
                )

        elif result.tipo_documento in ("bolletta_energia", "bolletta_gas"):
            _merge_bolletta(data, result.tipo_documento, contratti)

        elif result.tipo_documento == "polizza":
            _merge_polizza(data, contratti)

        elif result.tipo_documento == "contratto_mutuo":
            _merge_mutuo(data, contratti, proprieta)

        elif result.tipo_documento == "isee":
            isee = data.get("valore_isee", data.get("isee"))

        elif result.tipo_documento == "contratto_affitto":
            _merge_affitto(data, contratti, spese)

    # Applica info aggiuntive dall'utente
    if extra_info:
        if extra_info.get("comune_residenza"):
            personal_info.comune_residenza = extra_info["comune_residenza"]
        if extra_info.get("regione"):
            personal_info.regione = extra_info["regione"]
        if extra_info.get("provincia"):
            personal_info.provincia = extra_info["provincia"]
        if extra_info.get("isee"):
            isee = extra_info["isee"]
        if extra_info.get("n_figli"):
            existing_figli = sum(1 for f in famiglia if f.relazione == "figlio")
            for i in range(extra_info["n_figli"] - existing_figli):
                famiglia.append(FamilyMember(relazione="figlio"))

    # Calcola confidence complessiva
    avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0.0

    # Identifica dati mancanti
    if not personal_info.nome:
        dati_mancanti.append("Nome del contribuente")
    if not employment:
        dati_mancanti.append("Informazioni occupazionali")
    if isee is None:
        dati_mancanti.append("ISEE")
    if not redditi:
        dati_mancanti.append("Fonti di reddito")

    return UserFinancialProfile(
        personal_info=personal_info,
        famiglia=famiglia,
        employment=employment,
        redditi=redditi,
        spese=spese,
        contratti=contratti,
        proprieta=proprieta,
        isee=isee,
        documenti_analizzati=documenti_analizzati,
        dati_mancanti=dati_mancanti,
        confidence_score=avg_confidence,
    )


def _merge_cu(
    data: dict,
    personal_info: PersonalInfo,
    redditi: list[IncomeSource],
    famiglia: list[FamilyMember],
) -> None:
    """Merge dati da Certificazione Unica."""
    percipiente = data.get("percipiente", {})
    if percipiente.get("nome"):
        personal_info.nome = percipiente["nome"]
    if percipiente.get("cognome"):
        personal_info.cognome = percipiente["cognome"]
    if percipiente.get("codice_fiscale"):
        personal_info.codice_fiscale = percipiente["codice_fiscale"]
    if percipiente.get("comune_residenza"):
        personal_info.comune_residenza = percipiente["comune_residenza"]
    if percipiente.get("provincia"):
        personal_info.provincia = percipiente["provincia"]

    reddito_dip = data.get("redditi_lavoro_dipendente", 0)
    if reddito_dip:
        redditi.append(
            IncomeSource(
                tipo="lavoro_dipendente",
                importo_annuo_lordo=reddito_dip,
                ritenute=data.get("ritenute_irpef", 0),
            )
        )

    for fam in data.get("familiari_carico", []):
        if isinstance(fam, dict) and fam.get("relazione"):
            famiglia.append(
                FamilyMember(
                    relazione=fam["relazione"],
                    percentuale_carico=fam.get("percentuale", 100),
                )
            )


def _merge_busta_paga(
    data: dict, personal_info: PersonalInfo, employment: EmploymentInfo | None
) -> None:
    """Merge dati da busta paga."""
    dip = data.get("dipendente", {})
    if dip.get("nome") and not personal_info.nome:
        personal_info.nome = dip["nome"]
    if dip.get("cognome") and not personal_info.cognome:
        personal_info.cognome = dip["cognome"]
    if dip.get("codice_fiscale") and not personal_info.codice_fiscale:
        personal_info.codice_fiscale = dip["codice_fiscale"]


def _merge_bolletta(data: dict, tipo: str, contratti: list[Contract]) -> None:
    """Merge dati da bolletta energia/gas."""
    tipo_contratto = "energia" if tipo == "bolletta_energia" else "gas"
    contratti.append(
        Contract(
            tipo=tipo_contratto,
            fornitore=data.get("fornitore", "Sconosciuto"),
            costo_mensile=data.get("costo_totale"),
            dettagli={
                k: v
                for k, v in data.items()
                if k
                not in ("fornitore", "costo_totale", "tipo_contratto")
            },
        )
    )


def _merge_polizza(data: dict, contratti: list[Contract]) -> None:
    """Merge dati da polizza assicurativa."""
    tipo_map = {
        "auto": "assicurazione_auto",
        "casa": "assicurazione_casa",
        "vita": "assicurazione_vita",
    }
    tipo = tipo_map.get(data.get("tipo", ""), "assicurazione_auto")
    scadenza = None
    if data.get("scadenza"):
        try:
            scadenza = date.fromisoformat(data["scadenza"])
        except (ValueError, TypeError):
            pass

    contratti.append(
        Contract(
            tipo=tipo,
            fornitore=data.get("compagnia", "Sconosciuto"),
            costo_annuo=data.get("premio_annuo"),
            data_scadenza=scadenza,
            dettagli={
                k: v
                for k, v in data.items()
                if k not in ("compagnia", "premio_annuo", "scadenza", "tipo")
            },
        )
    )


def _merge_mutuo(
    data: dict, contratti: list[Contract], proprieta: list[PropertyOwned]
) -> None:
    """Merge dati da contratto mutuo."""
    contratti.append(
        Contract(
            tipo="mutuo",
            fornitore=data.get("istituto", "Sconosciuto"),
            costo_mensile=data.get("rata_mensile"),
            dettagli={
                k: v
                for k, v in data.items()
                if k not in ("istituto", "rata_mensile")
            },
        )
    )

    tipo_map = {
        "prima_casa": "abitazione_principale",
        "seconda_casa": "seconda_casa",
    }
    tipo_prop = tipo_map.get(data.get("tipo", ""), "abitazione_principale")
    proprieta.append(
        PropertyOwned(
            tipo=tipo_prop,
            mutuo_residuo=data.get("debito_residuo"),
        )
    )


def _merge_affitto(data: dict, contratti: list[Contract], spese: list[Expense]) -> None:
    """Merge dati da contratto di affitto."""
    canone = data.get("canone_mensile", data.get("canone"))
    contratti.append(
        Contract(
            tipo="affitto",
            fornitore=data.get("proprietario", "Privato"),
            costo_mensile=canone,
        )
    )
    if canone:
        spese.append(
            Expense(
                categoria="affitto_abitazione",
                importo_annuo=canone * 12,
            )
        )
