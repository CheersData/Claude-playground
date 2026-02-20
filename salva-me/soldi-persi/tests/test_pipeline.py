"""Test suite per Soldi Persi."""

import json
import sys
from datetime import date, datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Ensure project root is on path
sys.path.insert(0, str(Path(__file__).parent.parent))


# ============================================================
# Test 1: Pydantic Models Validation
# ============================================================

class TestModels:
    """Verifica che i modelli Pydantic validino correttamente."""

    def test_personal_info(self):
        from app.models.profile import PersonalInfo

        info = PersonalInfo(nome="Mario", cognome="Rossi")
        assert info.nome == "Mario"
        assert info.codice_fiscale is None

    def test_personal_info_complete(self):
        from app.models.profile import PersonalInfo

        info = PersonalInfo(
            nome="Mario",
            cognome="Rossi",
            codice_fiscale="RSSMRA89A01G224K",
            data_nascita=date(1989, 1, 1),
            comune_residenza="Padova",
            provincia="PD",
            regione="Veneto",
        )
        assert info.regione == "Veneto"

    def test_family_member(self):
        from app.models.profile import FamilyMember

        member = FamilyMember(relazione="figlio", nome="Sofia")
        assert member.a_carico is True
        assert member.percentuale_carico == 100

    def test_employment_info(self):
        from app.models.profile import EmploymentInfo

        emp = EmploymentInfo(
            tipo="dipendente",
            datore_lavoro="Acme S.r.l.",
            ral_annua=35000.0,
            ccnl="Metalmeccanico",
        )
        assert emp.tipo == "dipendente"

    def test_expense(self):
        from app.models.profile import Expense

        exp = Expense(categoria="mediche", importo_annuo=800.0)
        assert exp.gia_detratta is False

    def test_contract(self):
        from app.models.profile import Contract

        c = Contract(tipo="energia", fornitore="Enel", costo_mensile=85.0)
        assert c.dettagli == {}

    def test_user_financial_profile(self):
        from app.models.profile import PersonalInfo, UserFinancialProfile

        profile = UserFinancialProfile(
            personal_info=PersonalInfo(nome="Mario", cognome="Rossi")
        )
        assert profile.anno_riferimento == 2024
        assert profile.confidence_score == 0.0
        assert profile.famiglia == []

    def test_tax_opportunity(self):
        from app.models.opportunities import TaxOpportunity

        opp = TaxOpportunity(
            id="tax_001",
            titolo="Detrazione sport figli",
            descrizione="Non stai detraendo le spese sportive dei figli",
            riferimento_normativo="Art. 15 TUIR",
            tipo="detrazione",
            risparmio_stimato_annuo=79.80,
            risparmio_minimo=39.90,
            risparmio_massimo=79.80,
            azione_richiesta="Conserva ricevute sport e inserisci in 730",
            difficolta="facile",
            urgenza="prossima_dichiarazione",
            documenti_necessari=["Ricevuta ASD/palestra"],
            confidence=0.9,
        )
        assert opp.risparmio_stimato_annuo == 79.80

    def test_cost_reduction(self):
        from app.models.opportunities import CostReduction

        red = CostReduction(
            id="cost_001",
            titolo="Bolletta energia sovrapprezzata",
            categoria="energia",
            fornitore_attuale="Enel",
            costo_attuale_annuo=1020.0,
            benchmark_mercato=750.0,
            risparmio_stimato_annuo=270.0,
            sforzo_cambio="minimo",
            fonte_benchmark="media mercato 2024",
        )
        assert red.risparmio_stimato_annuo == 270.0

    def test_benefit_opportunity(self):
        from app.models.opportunities import BenefitOpportunity

        ben = BenefitOpportunity(
            id="ben_001",
            titolo="Assegno Unico",
            descrizione="Contributo mensile per figli a carico",
            ente_erogatore="inps",
            nome_ente="INPS",
            valore_stimato=3600.0,
            valore_minimo=1368.0,
            valore_massimo=4788.0,
            tipo="contributo_periodico",
            eligibilita_confidence=0.95,
            requisiti=["Figli a carico < 21 anni"],
            requisiti_mancanti=[],
            come_richiederlo="Domanda su portale INPS o tramite patronato",
        )
        assert ben.ente_erogatore == "inps"

    def test_final_report(self):
        from app.models.report import FinalReport, ReportSection

        report = FinalReport(
            user_id="test-123",
            data_generazione=datetime.now(),
            anno_riferimento=2024,
            profilo_completezza=0.85,
            opportunita_fiscali=ReportSection(
                titolo="Fiscale", items=[], totale_risparmio=0
            ),
            riduzioni_costo=ReportSection(
                titolo="Costi", items=[], totale_risparmio=0
            ),
            benefit_disponibili=ReportSection(
                titolo="Benefit", items=[], totale_risparmio=0
            ),
            risparmio_totale_stimato=0,
            risparmio_minimo=0,
            risparmio_massimo=0,
            azioni_prioritarie=[],
            documenti_analizzati=[],
            limitazioni=[],
            disclaimer="Test disclaimer",
            score_salute_finanziaria=75,
        )
        assert report.score_salute_finanziaria == 75

    def test_document_extraction_result(self):
        from app.models.profile import DocumentExtractionResult

        result = DocumentExtractionResult(
            filename="test.pdf",
            tipo_documento="cu",
            dati_estratti={"redditi_lavoro_dipendente": 35000},
            confidence=0.9,
        )
        assert result.tipo_documento == "cu"


# ============================================================
# Test 2: Base Agent JSON extraction
# ============================================================

class TestBaseAgent:
    """Verifica la logica di estrazione JSON."""

    def test_extract_json_object(self):
        from app.agents.base import BaseAgent

        class DummyAgent(BaseAgent):
            def get_system_prompt(self): return ""
            def get_output_model(self): return dict

        # Mock settings
        with patch("app.agents.base.settings") as mock_settings:
            mock_settings.DEFAULT_MODEL = "test"
            mock_settings.ANTHROPIC_API_KEY = "test-key"

            agent = DummyAgent("test")
            result = agent._extract_json('Here is the JSON:\n{"key": "value"}')
            assert json.loads(result) == {"key": "value"}

    def test_extract_json_array(self):
        from app.agents.base import BaseAgent

        class DummyAgent(BaseAgent):
            def get_system_prompt(self): return ""
            def get_output_model(self): return dict

        with patch("app.agents.base.settings") as mock_settings:
            mock_settings.DEFAULT_MODEL = "test"
            mock_settings.ANTHROPIC_API_KEY = "test-key"

            agent = DummyAgent("test")
            result = agent._extract_json('[{"id": 1}]')
            assert json.loads(result) == [{"id": 1}]

    def test_extract_json_code_block(self):
        from app.agents.base import BaseAgent

        class DummyAgent(BaseAgent):
            def get_system_prompt(self): return ""
            def get_output_model(self): return dict

        with patch("app.agents.base.settings") as mock_settings:
            mock_settings.DEFAULT_MODEL = "test"
            mock_settings.ANTHROPIC_API_KEY = "test-key"

            agent = DummyAgent("test")
            text = '```json\n{"key": "value"}\n```'
            result = agent._extract_json(text)
            assert json.loads(result) == {"key": "value"}

    def test_extract_json_no_json(self):
        from app.agents.base import BaseAgent

        class DummyAgent(BaseAgent):
            def get_system_prompt(self): return ""
            def get_output_model(self): return dict

        with patch("app.agents.base.settings") as mock_settings:
            mock_settings.DEFAULT_MODEL = "test"
            mock_settings.ANTHROPIC_API_KEY = "test-key"

            agent = DummyAgent("test")
            with pytest.raises(ValueError, match="No JSON found"):
                agent._extract_json("No JSON here")


# ============================================================
# Test 3: Merge Profiles
# ============================================================

class TestMergeProfiles:
    """Test merge dei risultati di estrazione."""

    def test_merge_empty(self):
        from app.utils.merge_profiles import merge_extraction_results

        profile = merge_extraction_results([])
        assert profile.personal_info.nome == ""
        assert profile.confidence_score == 0.0

    def test_merge_with_extra_info(self):
        from app.utils.merge_profiles import merge_extraction_results

        profile = merge_extraction_results(
            [],
            extra_info={
                "comune_residenza": "Padova",
                "regione": "Veneto",
                "isee": 25000,
                "n_figli": 2,
            },
        )
        assert profile.personal_info.comune_residenza == "Padova"
        assert profile.isee == 25000
        assert len(profile.famiglia) == 2

    def test_merge_cu_extraction(self):
        from app.models.profile import DocumentExtractionResult
        from app.utils.merge_profiles import merge_extraction_results

        cu_result = DocumentExtractionResult(
            filename="cu_2024.pdf",
            tipo_documento="cu",
            dati_estratti={
                "percipiente": {
                    "nome": "Mario",
                    "cognome": "Rossi",
                    "codice_fiscale": "RSSMRA89A01G224K",
                    "comune_residenza": "Padova",
                    "provincia": "PD",
                },
                "redditi_lavoro_dipendente": 35000.0,
                "ritenute_irpef": 7500.0,
                "familiari_carico": [
                    {"relazione": "coniuge", "percentuale": 100},
                ],
            },
            confidence=0.9,
        )

        profile = merge_extraction_results([cu_result])
        assert profile.personal_info.nome == "Mario"
        assert profile.personal_info.cognome == "Rossi"
        assert len(profile.redditi) == 1
        assert profile.redditi[0].importo_annuo_lordo == 35000.0
        assert len(profile.famiglia) == 1


# ============================================================
# Test 4: Demo profile creation
# ============================================================

class TestDemoProfile:
    """Test che il profilo demo si crei correttamente."""

    def test_demo_profile(self):
        # Import inline to avoid config loading
        sys.path.insert(0, str(Path(__file__).parent.parent))
        from cli import create_demo_profile

        profile = create_demo_profile()
        assert profile.personal_info.nome == "Mario"
        assert profile.personal_info.cognome == "Rossi"
        assert profile.employment.ral_annua == 35000.0
        assert profile.isee == 25000.0
        assert len(profile.famiglia) == 3
        assert len(profile.contratti) == 4
        assert profile.confidence_score == 0.85


# ============================================================
# Test 5: Error handling (agent failure produces partial report)
# ============================================================

class TestErrorHandling:
    """Test che il sistema gestisca errori gracefully."""

    @pytest.mark.asyncio
    async def test_orchestrator_handles_agent_failure(self):
        """Se un agente fallisce, il report viene comunque generato."""
        from app.models.profile import PersonalInfo, UserFinancialProfile

        profile = UserFinancialProfile(
            personal_info=PersonalInfo(nome="Test", cognome="User"),
        )

        with patch("app.agents.orchestrator.TaxOptimizerAgent") as MockTax, \
             patch("app.agents.orchestrator.CostBenchmarkerAgent") as MockCost, \
             patch("app.agents.orchestrator.BenefitScoutAgent") as MockBenefit, \
             patch("app.agents.base.settings") as mock_settings:

            mock_settings.DEFAULT_MODEL = "test"
            mock_settings.ANTHROPIC_API_KEY = "test-key"

            # Tax agent fails
            mock_tax = MockTax.return_value
            mock_tax.analyze = AsyncMock(side_effect=Exception("API Error"))

            # Cost agent returns empty
            mock_cost = MockCost.return_value
            mock_cost.analyze = AsyncMock(return_value=[])

            # Benefit agent returns empty
            mock_benefit = MockBenefit.return_value
            mock_benefit.analyze = AsyncMock(return_value=[])

            from app.agents.orchestrator import OrchestratorAgent

            orchestrator = OrchestratorAgent()
            orchestrator.tax_agent = mock_tax
            orchestrator.cost_agent = mock_cost
            orchestrator.benefit_agent = mock_benefit

            report = await orchestrator.analyze(profile)

            # Il report deve essere generato comunque
            assert report is not None
            assert report.risparmio_totale_stimato == 0
            assert len(report.limitazioni) > 0  # L'errore è segnalato
