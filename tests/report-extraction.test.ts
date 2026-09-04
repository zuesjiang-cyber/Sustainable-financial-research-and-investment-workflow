import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import crypto from "node:crypto";
import { PdfParserClient } from "../src/server/documents/pdfParser";
import { ThesisExtractor } from "../src/server/documents/thesisExtractor";

test("PdfParserClient parses PDF into valid manifest and spans", async () => {
  const client = new PdfParserClient();
  const inputPdf = path.resolve("tests/fixtures/sample_report.pdf");
  const outputManifest = path.resolve("tests/fixtures/output_manifest.json");
  const docId = crypto.randomUUID();

  const { manifest, spans } = await client.parsePdf(inputPdf, outputManifest, docId);

  assert.equal(manifest.schemaVersion, "1.0");
  assert.equal(manifest.documentId, docId);
  assert.equal(manifest.pages.length, 1);
  assert.equal(spans.length >= 1, true);
  assert.equal(spans[0].documentId, docId);
  assert.equal(spans[0].regions.length, 1);
  assert.equal(spans[0].regions[0].pageNumber, 1);
});

test("ThesisExtractor identifies company, date, and extracts atomic theses with criteria", async () => {
  const extractor = new ThesisExtractor();
  const docId = crypto.randomUUID();
  const parseId = crypto.randomUUID();

  const sampleSpans = [
    {
      id: crypto.randomUUID(),
      documentId: docId,
      parseId,
      regions: [{ pageNumber: 1, bbox: [0, 0, 1, 1] as [number, number, number, number] }],
      quote: "【圣邦股份 300661 2025年6月15日研报深度报告】公司是模拟芯片龙头，预计2025年综合毛利率有望达到35%，营业收入同比增长超过25%，经营活动现金流净额持续改善。",
      textHash: "hash1",
      headingPath: ["深度报告"],
      quality: "NATIVE" as const,
    },
  ];

  const result = await extractor.extractTheses(sampleSpans);

  // 1. Company identification
  assert.equal(result.identification.identifiedCompany?.name, "圣邦股份");
  assert.equal(result.identification.identifiedCompany?.securityCode, "300661");
  assert.equal(result.identification.reportDate, "2025-06-15");

  // 2. Theses extraction
  assert.equal(result.theses.length >= 2, true);

  // Gross margin thesis
  const marginThesis = result.theses.find((t) => t.criterion.kind === "COMPARE" && t.criterion.metric === "gross_margin");
  assert.equal(Boolean(marginThesis), true);
  if (marginThesis && marginThesis.criterion.kind === "COMPARE") {
    assert.equal(marginThesis.criterion.target, "35");
    assert.equal(marginThesis.criterion.op, "GTE");
  }

  // Revenue growth thesis
  const revThesis = result.theses.find((t) => t.criterion.kind === "COMPARE" && t.criterion.metric === "revenue_growth");
  assert.equal(Boolean(revThesis), true);
  if (revThesis && revThesis.criterion.kind === "COMPARE") {
    assert.equal(revThesis.criterion.target, "25");
  }
});
