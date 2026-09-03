"""Narrative Change Analyzer for FinTrust Thesis Update.
Performs constrained LLM semantic comparison across two reporting periods.
Enforces Fail-Closed integrity: If LLM is unavailable or fails, it never fabricates canned findings.
"""

import json
import logging
import os
import time
from typing import List, Optional

logger = logging.getLogger(__name__)

try:
    from agent.showcase_models import NarrativePair, NarrativeChangeOutput, DeltaResult
except ImportError:
    from project.agent.showcase_models import NarrativePair, NarrativeChangeOutput, DeltaResult


class NarrativeChangeAnalyzer:
    """Analyzer responsible for comparing narrative disclosures with Fail-Closed semantics."""

    def __init__(
        self,
        model_name: str = "gemini-2.5-flash",
        api_key: Optional[str] = None,
        use_stub: bool = False,
    ):
        self.model_name = model_name
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self.use_stub = use_stub
        self.call_count = 0
        self.last_latency_ms = 0
        self.retry_count = 0
        self.status = "INITIALIZED"  # "INITIALIZED" | "SUCCESS" | "UNAVAILABLE"
        self.error_message: Optional[str] = None

    def analyze(self, narrative_pairs: List[NarrativePair]) -> List[DeltaResult]:
        """Analyze changes across narrative pairs. Fail-closed on error or missing credentials."""
        start_time = time.time()

        if not narrative_pairs:
            self.status = "SUCCESS"
            return []

        # If explicit deterministic mock is requested (e.g. for offline test execution):
        if self.use_stub:
            self.call_count += 1
            time.sleep(0.01)
            self.last_latency_ms = int((time.time() - start_time) * 1000)
            self.status = "SUCCESS"
            return self._build_deterministic_mock(narrative_pairs)

        # If no API key is provided, fail-closed immediately without fabricating AI analysis
        if not self.api_key:
            self.status = "UNAVAILABLE"
            self.error_message = "GEMINI_API_KEY 未配置，系统遵循 Fail-Closed 原则拒绝生成未经核验的虚假语义结论。"
            self.last_latency_ms = int((time.time() - start_time) * 1000)
            return self._build_unavailable_results(narrative_pairs, self.error_message)

        # Attempt live API call
        try:
            results = self._call_llm(narrative_pairs)
            self.call_count += 1
            self.last_latency_ms = int((time.time() - start_time) * 1000)
            self.status = "SUCCESS"
            return self._format_results(results, narrative_pairs)
        except Exception as exc:
            self.retry_count += 1
            self.call_count += 1
            self.last_latency_ms = int((time.time() - start_time) * 1000)
            self.status = "UNAVAILABLE"
            self.error_message = f"LLM 语义分析调用失败 ({type(exc).__name__}): {str(exc)}"
            logger.warning("NarrativeChangeAnalyzer fail-closed triggered: %s", self.error_message)
            return self._build_unavailable_results(narrative_pairs, self.error_message)

    def _call_llm(self, narrative_pairs: List[NarrativePair]) -> List[NarrativeChangeOutput]:
        """Execute single structured LLM prompt."""
        from google import genai
        client = genai.Client(api_key=self.api_key)
        prompt = self._build_prompt(narrative_pairs)
        response = client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )
        raw_data = json.loads(response.text)
        if isinstance(raw_data, list):
            return [NarrativeChangeOutput(**item) for item in raw_data]
        elif isinstance(raw_data, dict) and "changes" in raw_data:
            return [NarrativeChangeOutput(**item) for item in raw_data["changes"]]
        raise ValueError("Invalid LLM response format: expected list of narrative changes.")

    def _build_prompt(self, narrative_pairs: List[NarrativePair]) -> str:
        items = []
        for pair in narrative_pairs:
            items.append({
                "topic": pair.topic,
                "label": pair.label,
                "base_text": pair.base.text,
                "base_evidence_id": pair.base.evidence_id,
                "current_text": pair.current.text,
                "current_evidence_id": pair.current.evidence_id,
            })
        return (
            "你是一个资深买方基本面研究员。请比较以下各主题在前后两期年报中的叙事表述变化。\n"
            "要求：\n"
            "1. 仅基于提供的两期文本事实进行比较，不可凭空捏造未披露的数字。\n"
            "2. change_type 必须是 strengthened / weakened / unchanged / new 之一。\n"
            "3. change_summary 必须是一句精炼的两期差异提炼。\n"
            "4. thesis_relevance 说明这对公司业务模式或投资逻辑的含义。\n"
            "5. evidence_ids 必须且只能包含对应主题输入的 base_evidence_id 与 current_evidence_id。\n"
            "请严格以 JSON 数组格式返回：\n"
            f"{json.dumps(items, ensure_ascii=False, indent=2)}"
        )

    def _build_deterministic_mock(self, narrative_pairs: List[NarrativePair]) -> List[DeltaResult]:
        """Dynamic text-grounded extractor for offline testing. Strictly derived from input pairs, NO hardcoded entity names."""
        results = []
        for pair in narrative_pairs:
            b_txt = pair.base.text.strip()
            c_txt = pair.current.text.strip()
            # Derive change summary purely from the actual input text
            summary_snippet = f"两期披露对比：基期提及‘{b_txt[:28]}...’；当期披露演进为‘{c_txt[:32]}...’"
            relevance_snippet = f"反映公司在【{pair.label}】维度的业务布局推进与信息披露深化。"

            results.append(
                DeltaResult(
                    category="narrative",
                    topic_or_metric=pair.topic,
                    label=pair.label,
                    source_tag="AI 语义比较",
                    summary=f"[披露对比] {summary_snippet}",
                    detail=c_txt,
                    relevance=relevance_snippet,
                    evidence_ids=[pair.base.evidence_id, pair.current.evidence_id],
                    provenance_type="ai",
                )
            )
        return results

    def _build_unavailable_results(
        self, narrative_pairs: List[NarrativePair], reason: str
    ) -> List[DeltaResult]:
        """Fail-Closed output when AI service is unavailable."""
        results = []
        for pair in narrative_pairs:
            results.append(
                DeltaResult(
                    category="narrative",
                    topic_or_metric=pair.topic,
                    label=pair.label,
                    source_tag="AI 语义比较 (不可用)",
                    summary=f"[语义分析不可用] {reason}",
                    detail=f"原基期引用：{pair.base.text[:40]}...；原当期引用：{pair.current.text[:40]}...",
                    relevance="投资假设评估仅依赖确定性财务指标重算，系统拒绝伪造 AI 归因判断。",
                    evidence_ids=[pair.base.evidence_id, pair.current.evidence_id],
                    provenance_type="source",
                )
            )
        return results

    def _format_results(
        self, raw_outputs: List[NarrativeChangeOutput], narrative_pairs: List[NarrativePair]
    ) -> List[DeltaResult]:
        pair_map = {p.topic: p for p in narrative_pairs}
        delta_results = []
        for output in raw_outputs:
            pair = pair_map.get(output.topic)
            label = pair.label if pair else output.topic
            type_tag = {
                "strengthened": "战略深化 / 加强",
                "weakened": "边际弱化",
                "unchanged": "无实质变化",
                "new": "新增披露",
            }.get(output.change_type, output.change_type)

            delta_results.append(
                DeltaResult(
                    category="narrative",
                    topic_or_metric=output.topic,
                    label=label,
                    source_tag="AI 语义比较",
                    summary=f"[{type_tag}] {output.change_summary}",
                    detail=output.change_summary,
                    relevance=output.thesis_relevance,
                    evidence_ids=output.evidence_ids,
                    provenance_type="ai",
                )
            )
        return delta_results
