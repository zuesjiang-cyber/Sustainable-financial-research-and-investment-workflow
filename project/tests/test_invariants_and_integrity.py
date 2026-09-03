"""Adversarial and Invariant Tests for FinTrust Thesis Update.
Validates zero-leakage, fail-closed LLM behavior, dynamic threshold calculations, and strict claim auditing.
"""

import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from decimal import Decimal
import pytest
from agent.showcase_models import (
    CaseInput,
    CaseMeta,
    Fact,
    NarrativePair,
    NarrativeSnippet,
    ThesisPillar,
    DraftClaim,
    Evidence,
    ThesisStatus,
    ClaimStatus,
    MissingRequiredFactError,
)
from agent.thesis_update_engine import calculate_metrics, run_analysis
from agent.narrative_change_analyzer import NarrativeChangeAnalyzer


def make_dummy_case(
    company="未来微电子",
    ticker="688999.SH",
    rev_24="1000000000.00",
    rev_25="1500000000.00",  # +50%
    cost_24="500000000.00",
    cost_25="600000000.00",  # GM 50% -> 60% (+10 pct)
    np_24="200000000.00",
    np_25="350000000.00",
    cf_24="150000000.00",
    cf_25="300000000.00",  # CF to NP = 3.0 / 3.5 = 0.857
    rd_24="100000000.00",
    rd_25="150000000.00",
) -> CaseInput:
    meta = CaseMeta(
        case_id="dummy_01",
        company=company,
        ticker=ticker,
        currency="CNY",
        base_period="FY2024",
        current_period="FY2025",
        accounting_scope="CAS",
    )
    facts = [
        Fact(metric="revenue", period="FY2024", value=rev_24, unit="元", evidence_id="E_REV_24"),
        Fact(metric="revenue", period="FY2025", value=rev_25, unit="元", evidence_id="E_REV_25"),
        Fact(metric="cost", period="FY2024", value=cost_24, unit="元", evidence_id="E_COST_24"),
        Fact(metric="cost", period="FY2025", value=cost_25, unit="元", evidence_id="E_COST_25"),
        Fact(metric="net_profit", period="FY2024", value=np_24, unit="元", evidence_id="E_NP_24"),
        Fact(metric="net_profit", period="FY2025", value=np_25, unit="元", evidence_id="E_NP_25"),
        Fact(metric="operating_cash_flow", period="FY2024", value=cf_24, unit="元", evidence_id="E_CF_24"),
        Fact(metric="operating_cash_flow", period="FY2025", value=cf_25, unit="元", evidence_id="E_CF_25"),
        Fact(metric="rd_expense", period="FY2024", value=rd_24, unit="元", evidence_id="E_RD_24"),
        Fact(metric="rd_expense", period="FY2025", value=rd_25, unit="元", evidence_id="E_RD_25"),
    ]
    pillars = [
        ThesisPillar(
            id="revenue_growth",
            title="收入增长支柱",
            original_view="维持景气高增",
            baseline_threshold=">=15%",
            strengthen_threshold=">20%",
            weaken_threshold="<10%",
            monitor_next="季度环比",
        ),
        ThesisPillar(
            id="profit_quality",
            title="盈利质量支柱",
            original_view="毛利率提升",
            baseline_threshold="50%",
            strengthen_threshold="+1pct",
            weaken_threshold="<0pct",
            monitor_next="料号结构",
        ),
        ThesisPillar(
            id="cash_flow_quality",
            title="现金流质量支柱",
            original_view="造血强劲",
            baseline_threshold=">=1.0x",
            strengthen_threshold="现金流>营收增速",
            weaken_threshold="<0.90x",
            monitor_next="应收周转",
        ),
        ThesisPillar(
            id="rd_intensity",
            title="研发投入支柱",
            original_view="技术护城河",
            baseline_threshold="25%-28%",
            strengthen_threshold=">=10%且率达标",
            weaken_threshold="<23%",
            monitor_next="料号上量",
        ),
    ]
    narratives = [
        NarrativePair(
            topic="test_mode",
            label="业务模式",
            base=NarrativeSnippet(
                period="FY2024",
                source="2024年报",
                page=1,
                section="模式",
                text="公司采用轻资产 Fabless 模式，晶圆代工主要委托合作方。",
                evidence_id="E_TEST_1",
            ),
            current=NarrativeSnippet(
                period="FY2025",
                source="2025年报",
                page=1,
                section="模式",
                text="公司深化虚拟 IDM 战略，关键封测产线实现自主量产掌控。",
                evidence_id="E_TEST_2",
            ),
        )
    ]
    claims = [
        DraftClaim(
            id="CLAIM_REV_MATCH",
            claim_text="2025年营业收入实现 15.00 亿元",
            claim_type="metric_value",
            metric_key="revenue_fy2025",
            target_value="1500000000.00",
            unit="元",
            evidence_id="E_REV_25",
        ),
        DraftClaim(
            id="CLAIM_CF_DIRECTION_ERROR",
            claim_text="2025年经营现金流同比增长 200%",
            claim_type="metric_value",
            metric_key="operating_cash_flow_fy2025",
            target_value="9999999999.00",  # Fake huge number
            unit="元",
            evidence_id="E_CF_25",
        ),
    ]
    evidence = [
        Evidence(
            evidence_id="E_REV_24",
            period="FY2024",
            document="2024.pdf",
            page=1,
            snippet="营业收入 1000000000.00 元",
            image="test.png",
        ),
        Evidence(
            evidence_id="E_REV_25",
            period="FY2025",
            document="2025.pdf",
            page=1,
            snippet="营业收入 1500000000.00 元",
            image="test.png",
        ),
        Evidence(
            evidence_id="E_CF_25",
            period="FY2025",
            document="2025.pdf",
            page=2,
            snippet="经营现金流 300000000.00 元",
            image="test.png",
        ),
    ]
    return CaseInput(
        case=meta,
        facts=facts,
        thesis_pillars=pillars,
        narrative_pairs=narratives,
        claims=claims,
        evidence=evidence,
    )


def test_zero_leakage_on_mutated_case():
    """Verify that analyzing a completely different company never produces ShengBang numbers or names."""
    dummy_input = make_dummy_case(company="未来算力科技", ticker="688888.SH")
    result = run_analysis(dummy_input, NarrativeChangeAnalyzer(use_stub=True))

    summary = result.published_summary

    # Ensure dummy company details are present
    assert "未来算力科技" in summary
    assert "688888.SH" in summary

    # Ensure NO ShengBang facts or stock code are present
    assert "300661" not in summary
    assert "圣邦" not in summary
    assert "3,898,054,583" not in summary
    assert "3,346,983,120" not in summary
    assert "547,059,403" not in summary
    assert "549,337,594" not in summary


def test_missing_required_facts_raises_exception():
    """Verify that omitting a mandatory financial fact raises MissingRequiredFactError immediately."""
    case_input = make_dummy_case()
    # Remove revenue fact
    case_input.facts = [f for f in case_input.facts if f.metric != "revenue"]

    with pytest.raises(MissingRequiredFactError) as exc_info:
        calculate_metrics(case_input)

    assert "missing mandatory financial facts" in str(exc_info.value)


def test_fail_closed_narrative_analyzer_when_api_key_missing():
    """Verify that when no API key is provided and use_stub=False, it fails closed without canned text."""
    analyzer = NarrativeChangeAnalyzer(api_key=None, use_stub=False)
    dummy_input = make_dummy_case()

    results = analyzer.analyze(dummy_input.narrative_pairs)

    assert analyzer.status == "UNAVAILABLE"
    assert analyzer.error_message is not None
    assert len(results) == len(dummy_input.narrative_pairs)
    for r in results:
        assert "不可用" in r.source_tag or "不可用" in r.summary
        assert "Fail-closed" in r.detail or "不可用" in r.summary
        # Must not fabricate fake LLM text
        assert "台积电" not in r.summary


def test_dynamic_claim_audit_detects_mismatches_without_hardcoded_ids():
    """Verify that claim auditing correctly identifies verified vs mismatched claims purely by values."""
    dummy_input = make_dummy_case()
    result = run_analysis(dummy_input, NarrativeChangeAnalyzer(use_stub=True))

    audits = {a.claim_id: a for a in result.claim_audits}

    assert audits["CLAIM_REV_MATCH"].status == ClaimStatus.VERIFIED
    assert audits["CLAIM_CF_DIRECTION_ERROR"].status == ClaimStatus.MISMATCH
    assert "数值不符拦截" in audits["CLAIM_CF_DIRECTION_ERROR"].explanation
