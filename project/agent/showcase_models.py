"""Pydantic models for FinTrust Thesis Update Showcase MVP."""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ThesisStatus(str, Enum):
    STRENGTHENED = "加强"
    MAINTAINED = "保持"
    WEAKENED = "削弱"


class ClaimStatus(str, Enum):
    VERIFIED = "VERIFIED"
    MISMATCH = "MISMATCH"


class CaseMeta(BaseModel):
    case_id: str
    company: str
    ticker: str
    base_period: str
    current_period: str
    currency: str
    accounting_scope: str


class Fact(BaseModel):
    metric: str
    period: str
    value: str
    unit: str
    evidence_id: str


class NarrativeSnippet(BaseModel):
    text: str
    page: int
    evidence_id: str


class NarrativePair(BaseModel):
    topic: str
    label: str
    base: NarrativeSnippet
    current: NarrativeSnippet


class ThesisPillar(BaseModel):
    id: str
    title: str
    original_view: str
    baseline_threshold: str
    strengthen_threshold: str
    weaken_threshold: str
    monitor_next: str


class DraftClaim(BaseModel):
    id: str
    claim_text: str
    claim_type: str
    metric_key: Optional[str] = None
    target_value: Optional[str] = None
    unit: Optional[str] = None
    topic: Optional[str] = None
    keywords: Optional[List[str]] = None
    draft_error: Optional[str] = None
    evidence_id: Optional[str] = None


class Evidence(BaseModel):
    evidence_id: str
    period: str
    document: str
    page: int
    snippet: str
    image: str


class CaseInput(BaseModel):
    case: CaseMeta
    facts: List[Fact]
    narrative_pairs: List[NarrativePair]
    thesis_pillars: List[ThesisPillar]
    claims: List[DraftClaim]
    evidence: List[Evidence]


class MissingRequiredFactError(Exception):
    """Raised when a required financial fact is missing from CaseInput."""
    pass


# Output Models
class MetricResult(BaseModel):
    metric_key: str
    label: str
    unit: str
    base_value: Optional[str] = None
    current_value: Optional[str] = None
    delta_value: Optional[str] = None
    delta_type: Optional[str] = None  # "percentage", "pct_points", "ratio"
    description: str
    provenance_type: str = "calculated"  # "calculated" | "source" | "inference" | "ai"


class DeltaResult(BaseModel):
    category: str  # "numeric" | "narrative"
    topic_or_metric: str
    label: str
    source_tag: str  # "代码计算" | "AI 语义比较" | "财报原文" | "分析师推断"
    summary: str
    detail: str
    relevance: str
    evidence_ids: List[str] = Field(default_factory=list)
    provenance_type: str = "calculated"  # "calculated" | "source" | "inference" | "ai"


class NarrativeChangeOutput(BaseModel):
    topic: str
    change_type: str  # "strengthened" | "weakened" | "unchanged" | "new"
    change_summary: str
    thesis_relevance: str
    evidence_ids: List[str]


class ThesisResult(BaseModel):
    pillar_id: str
    title: str
    original_view: str
    status: ThesisStatus
    status_tag: str
    trigger_data: str
    reason: str
    monitor_next: str
    evidence_ids: List[str] = Field(default_factory=list)
    provenance_type: str = "calculated"


class ClaimAuditResult(BaseModel):
    claim_id: str
    claim_text: str
    status: ClaimStatus
    draft_claim: str
    recalculated_truth: str
    explanation: str
    evidence_id: Optional[str] = None
    evidence_snippet: Optional[str] = None
    provenance_type: str = "calculated"


class KeyFinding(BaseModel):
    rank: int
    title: str
    impact: str
    related_pillar_id: str
    evidence_id: Optional[str] = None
    provenance_type: str = "calculated"


class AnalysisMeta(BaseModel):
    model_name: str
    llm_calls: int
    latency_ms: int
    retry_count: int = 0


class AnalysisResult(BaseModel):
    case_meta: CaseMeta
    metrics: Dict[str, MetricResult]
    numeric_deltas: List[DeltaResult]
    narrative_deltas: List[DeltaResult]
    thesis_updates: List[ThesisResult]
    claim_audits: List[ClaimAuditResult]
    key_findings: List[KeyFinding]
    published_summary: str
    analysis_meta: AnalysisMeta
