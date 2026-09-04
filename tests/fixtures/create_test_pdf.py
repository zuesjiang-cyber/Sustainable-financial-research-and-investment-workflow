import os

# Minimal valid PDF with text "圣邦股份 2025 年毛利率有望达到 30%"
def create_minimal_pdf(output_path: str):
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    pdf_content = (
        b"%PDF-1.4\n"
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n"
        b"4 0 obj << /Length 85 >> stream\n"
        b"BT /F1 14 Tf 50 750 Td (Shengbang Co., Ltd. 300661 Research Report: Target Gross Margin 30%) Tj ET\n"
        b"endstream\nendobj\n"
        b"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"
        b"xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000244 00000 n \n0000000380 00000 n \ntrailer << /Size 6 /Root 1 0 R >>\nstartxref\n455\n%%EOF\n"
    )
    with open(output_path, "wb") as f:
        f.write(pdf_content)

if __name__ == "__main__":
    create_minimal_pdf("tests/fixtures/sample_report.pdf")
    print("Created tests/fixtures/sample_report.pdf")
