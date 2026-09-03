"""Comprehensive unit & acceptance tests for FinTrust Thesis Update P0 MVP.
Corresponds to product/06_测试与演示验收.md (T01 - T08).
"""

import json
import os
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from agent.showcase_models import CaseInput, ThesisStatus, ClaimStatus
from agent.narrative_change_analyzer import NarrativeChangeAnalyzer
from agent.thesis_update_engine import (
    calculate_metrics,
    evaluate_thesis,
    audit_claims,
    run_analysis,
    build_published_summary,
)


def load_main_case_input() -> CaseInput:
    path = PROJECT_ROOT / "data" / "showcases" / "sbg_fy2025" / "case_input.json"
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return CaseInput(**data)


def load_alternate_case_input() -> CaseInput:
    path = PROJECT_ROOT / "tests" / "fixtures" / "alternate_case_input.json"
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return CaseInput(**data)


def test_t01_input_loading_and_assets():
    """T01: Input file parses correctly and all evidence images exist."""
    case_input = load_main_case_input()
    assert case_input.case.case_id == "sbg_fy2025"
    assert len(case_input.facts) == 10
    assert len(case_input.thesis_pillars) == 4
    assert len(case_input.narrative_pairs) == 3
    assert len(case_input.claims) == 7

    assets_dir = PROJECT_ROOT / "data" / "showcases" / "sbg_fy2025" / "assets"
    for evi in case_input.evidence:
        img_file = Path(evi.image).name
        full_path = assets_dir / img_file
        assert full_path.exists(), f"Missing evidence image: {full_path}"


def test_t02_financial_metrics_recalculation():
    """T02: Strict Decimal mathematical recalculations match gold standards."""
    case_input = load_main_case_input()
    metrics = calculate_metrics(case_input)

    # 1. Revenue YoY: +16.46%
    assert metrics["revenue_yoy"].current_value == "16.46"

    # 2. Operating Cash Flow YoY: -15.11%
    assert metrics["operating_cash_flow_yoy"].current_value == "-15.11"

    # 3. FY2025 Gross Margin: 50.94%
    assert metrics["gross_margin_fy2025"].current_value == "50.94"
    assert metrics["gross_margin_fy2025"].base_value == "51.46"
    assert metrics["gross_margin_fy2025"].delta_value == "-0.52"

    # 4. FY2025 R&D Expense Ratio: 26.81%
    assert metrics["rd_expense_ratio_fy2025"].current_value == "26.81"
    assert metrics["rd_expense_ratio_fy2025"].base_value == "26.02"

    # 5. FY2025 Cash Flow to Net Profit Multiple: 0.85
    assert metrics["cash_flow_to_net_profit_ratio_fy2025"].current_value == "0.85"


def test_t03_narrative_analyzer_structured_output():
    """T03: Narrative analyzer returns structured DeltaResult for 3 topics."""
    case_input = load_main_case_input()
    analyzer = NarrativeChangeAnalyzer(use_stub=True)
    narrative_deltas = analyzer.analyze(case_input.narrative_pairs)

    assert len(narrative_deltas) == 3
    topics = [d.topic_or_metric for d in narrative_deltas]
    assert "business_model" in topics
    assert "rd_investment" in topics
    assert "supply_chain_capacity" in topics

    for d in narrative_deltas:
        assert d.source_tag == "AI 语义比较"
        assert len(d.evidence_ids) >= 2
        assert len(d.summary) > 5
        assert len(d.relevance) > 5


def test_t04_four_thesis_pillars_evaluated_correctly():
    """T04: Four investment thesis pillars result in Maintained, Weakened, Weakened, Strengthened."""
    case_input = load_main_case_input()
    metrics = calculate_metrics(case_input)
    analyzer = NarrativeChangeAnalyzer(use_stub=True)
    narrative_deltas = analyzer.analyze(case_input.narrative_pairs)
    updates = evaluate_thesis(metrics, narrative_deltas, case_input.thesis_pillars)

    status_dict = {u.pillar_id: u.status for u in updates}

    assert status_dict["revenue_growth"] == ThesisStatus.MAINTAINED  # 保持
    assert status_dict["profit_quality"] == ThesisStatus.WEAKENED   # 削弱 (-0.52 pct)
    assert status_dict["cash_flow_quality"] == ThesisStatus.WEAKENED # 削弱 (-15.11% & 0.85x)
    assert status_dict["rd_intensity"] == ThesisStatus.STRENGTHENED  # 加强 (+20.03% & 26.81%)

    for u in updates:
        assert len(u.reason) > 10
        assert len(u.evidence_ids) >= 1


def test_t05_seven_claims_audit_5_verified_2_mismatch():
    """T05: Claims audit correctly identifies 5 VERIFIED and 2 MISMATCH (C04, C05)."""
    case_input = load_main_case_input()
    metrics = calculate_metrics(case_input)
    audits = audit_claims(case_input.claims, metrics, case_input.evidence)

    assert len(audits) == 7
    status_map = {a.claim_id: a.status for a in audits}

    assert status_map["C01"] == ClaimStatus.VERIFIED
    assert status_map["C02"] == ClaimStatus.VERIFIED
    assert status_map["C03"] == ClaimStatus.VERIFIED
    assert status_map["C04"] == ClaimStatus.MISMATCH  # 现金流增长误写
    assert status_map["C05"] == ClaimStatus.MISMATCH  # 毛利率 52% 虚报
    assert status_map["C06"] == ClaimStatus.VERIFIED
    assert status_map["C07"] == ClaimStatus.VERIFIED

    verified_count = sum(1 for a in audits if a.status == ClaimStatus.VERIFIED)
    mismatch_count = sum(1 for a in audits if a.status == ClaimStatus.MISMATCH)
    assert verified_count == 5
    assert mismatch_count == 2


def test_t06_published_summary_excludes_hallucinations():
    """T06: Final publishable summary contains correct truths and strips C04/C05 draft errors."""
    case_input = load_main_case_input()
    result = run_analysis(case_input, NarrativeChangeAnalyzer(use_stub=True))
    summary = result.published_summary

    # Truths present
    assert "同比下降 15.11%" in summary or "下降 15.11%" in summary
    assert "50.94%" in summary
    assert "16.46%" in summary

    # Errors completely absent
    assert "经营现金流同比增长 15.11%" not in summary
    assert "综合毛利率为 52.00%" not in summary
    assert "52.00%" not in summary or "纠正草稿中‘毛利率 52.00%’" in summary


def test_t07_counterfactual_alternate_input_switches_thesis():
    """T07: Counterfactual input proves rules and calculations are not hardcoded."""
    alt_input = load_alternate_case_input()
    result = run_analysis(alt_input, NarrativeChangeAnalyzer(use_stub=True))

    status_dict = {u.pillar_id: u.status for u in result.thesis_updates}

    # Revenue grew +30.0% (>20%), so revenue pillar becomes STRENGTHENED instead of MAINTAINED
    assert status_dict["revenue_growth"] == ThesisStatus.STRENGTHENED
    # Cash flow grew +75% (>0 and 1.16x > 0.90x), so cash flow pillar is not weakened
    assert status_dict["cash_flow_quality"] != ThesisStatus.WEAKENED


def test_t08_export_serialization():
    """T08: Full analysis result is JSON serializable and markdown brief is valid."""
    case_input = load_main_case_input()
    result = run_analysis(case_input, NarrativeChangeAnalyzer(use_stub=True))

    json_str = result.model_dump_json(indent=2)
    assert len(json_str) > 500
    reloaded = json.loads(json_str)
    assert reloaded["case_meta"]["ticker"] == "300661.SZ"
    assert len(reloaded["key_findings"]) <= 3
