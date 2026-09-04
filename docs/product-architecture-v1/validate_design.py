"""Read-only design checks. Requires jsonschema; does not touch app/data files.

Run: python3 docs/product-architecture-v1/validate_design.py
This is not a running-product acceptance test or PostgreSQL execution test.
"""
from __future__ import annotations

import json
import re
from decimal import Decimal
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
spec = json.loads((ROOT / "contracts/openapi.yaml").read_text())
example = json.loads((ROOT / "examples/two-round-research.json").read_text())
tools = json.loads((ROOT / "contracts/agent-tools.json").read_text())
parser = json.loads((ROOT / "contracts/parser-manifest.schema.json").read_text())
checks = 0


def ensure(condition: bool, message: str) -> None:
    global checks
    assert condition, message
    checks += 1


def walk(value):
    if isinstance(value, dict):
        yield value
        for item in value.values():
            yield from walk(item)
    elif isinstance(value, list):
        for item in value:
            yield from walk(item)


def validate(name: str, value) -> None:
    schema = {"$ref": f"#/components/schemas/{name}", "components": spec["components"]}
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(value)
    ensure(True, name)


# Internal links in canonical docs and CCPM tracking files.
md_files = list(ROOT.rglob("*.md"))
md_files += list((REPO / ".claude/epics/report-first-product").glob("*.md"))
md_files += [REPO / ".claude/prds/report-first-product.md"]
for path in md_files:
    content = path.read_text()
    for target in re.findall(r"\]\(([^)]+)\)", content):
        if target.startswith(("http://", "https://", "#")):
            continue
        target = target.split("#", 1)[0].strip("<>")
        ensure((path.parent / target).exists(), f"Broken link: {path}: {target}")

# OpenAPI references and operation IDs / path params.
operations = []
for item in walk(spec):
    if "$ref" in item:
        ref = item["$ref"]
        ensure(ref.startswith("#/"), f"Unexpected external ref: {ref}")
        resolved = spec
        for part in ref[2:].split("/"):
            ensure(part in resolved, f"Missing ref: {ref}")
            resolved = resolved[part]
for path, methods in spec["paths"].items():
    for method, operation in methods.items():
        operations.append(operation["operationId"])
        param_names = {p["name"] for p in operation.get("parameters", []) if p["in"] == "path"}
        ensure(set(re.findall(r"\{([^}]+)\}", path)) == param_names, f"Path params: {path}")
ensure(len(set(operations)) == len(operations), "Duplicate operation ID")
for schema in spec["components"]["schemas"].values():
    Draft202012Validator.check_schema(schema)
for tool in tools["tools"]:
    Draft202012Validator.check_schema(tool["function"]["parameters"])
Draft202012Validator.check_schema(parser)
ensure(len(tools["tools"]) == 6, "Agent tool count")

# Core TypeScript enums must match HTTP definitions.
ts = (ROOT / "contracts/domain.ts").read_text()
for name in ("Outcome", "RunKind", "RunStatus", "Phase"):
    matched = re.search(rf"export type {name} = (.*?);", ts, re.S)
    ensure(matched is not None, f"Missing TS enum: {name}")
    values = re.findall(r"'([^']+)'", matched.group(1))
    ensure(set(values) == set(spec["components"]["schemas"][name]["enum"]), f"Enum drift: {name}")

# Concrete examples validate against actual API schemas.
for key, name in (("company", "Company"), ("evidenceBundle", "EvidenceBundle"),
                  ("originalThesis", "ThesisRevision"), ("userCorrection", "UserCorrection"),
                  ("state1", "ResearchState"), ("state2", "ResearchState"), ("draft2", "Draft")):
    validate(name, example[key])
bundle = example["evidenceBundle"]
allowed = {
    "documentId": {x["id"] for x in bundle["documents"]},
    "factIds": {x["id"] for x in bundle["facts"]},
    "calculationIds": {x["id"] for x in bundle["calculations"]},
    "evidenceIds": {x["id"] for x in bundle["spans"]},
}
for key, canonical in (("operandFactIds", "factIds"), ("operandCalculationIds", "calculationIds"),
                       ("sourceEvidenceIds", "evidenceIds"), ("supportingEvidenceIds", "evidenceIds")):
    allowed[key] = allowed[canonical]
for item in walk(example):
    for key, values in allowed.items():
        if key in item:
            candidates = item[key] if isinstance(item[key], list) else [item[key]]
            ensure(set(candidates).issubset(values), f"Unknown example references: {key}")
facts = {x["id"]: x for x in bundle["facts"]}
for calc in bundle["calculations"]:
    revenue, cost = [Decimal(facts[i]["value"]) for i in calc["operandFactIds"]]
    ensure((revenue - cost) / revenue == Decimal(calc["result"]), "Example gross margin arithmetic")
first, second = example["state1"], example["state2"]
ensure(first["items"][0]["thesis"]["thesisId"] == second["items"][0]["thesis"]["thesisId"], "Stable thesis ID")
ensure(first["items"][0]["userJudgment"] == second["items"][0]["userJudgment"], "User judgment continuity")
ensure(first["items"][0]["assessment"]["status"] == "UNRESOLVED", "Premature forecast verdict")
ensure(second["questions"][0]["status"] == "ANSWERED", "Question resolution")
for state in (first, second):
    manifest = state["sourceManifest"]
    doc_ids = {d["documentId"] for d in manifest["documents"]}
    for doc in bundle["documents"]:
        if doc["id"] in doc_ids:
            ensure(doc["publishedAt"] <= manifest["asOf"], "Future source in historical state")

# Basic static DDL relationship check. Does NOT prove SQL execution correctness.
sql = (ROOT / "contracts/schema.sql").read_text()
table_names = set(re.findall(r"CREATE TABLE (\w+)\s*\(", sql))
for table in re.findall(r"REFERENCES (\w+)\s*\(", sql):
    ensure(table in table_names, f"Unknown SQL table reference: {table}")
ensure(sql.strip().endswith("COMMIT;"), "DDL transaction not complete")

# CCPM dependency graph is acyclic and every dependency resolves.
task_dir = REPO / ".claude/epics/report-first-product"
tasks = {p.stem: p.read_text() for p in task_dir.glob("[0-9][0-9][0-9].md")}
deps = {key: re.findall(r'"(\d{3})"', re.search(r"depends_on: (\[[^\n]*\])", value).group(1))
        for key, value in tasks.items()}


def visit(task, chain=()):
    ensure(task in tasks, f"Unknown task dependency: {task}")
    ensure(task not in chain, f"Task cycle: {chain} -> {task}")
    for dependency in deps[task]:
        visit(dependency, chain + (task,))


for task in tasks:
    visit(task)
ensure(len(tasks) == 9, "Expected nine execution tasks")
print(json.dumps({"status": "PASS", "checks": checks, "markdown_files": len(md_files),
                  "api_operations": len(operations), "schemas": len(spec["components"]["schemas"]),
                  "ddl_tables": len(table_names), "agent_tools": len(tools["tools"]),
                  "ccpm_tasks": len(tasks), "scope": "design consistency, not product acceptance"},
                 ensure_ascii=False, indent=2))
