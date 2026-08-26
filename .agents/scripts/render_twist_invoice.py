import fitz

source = "attached_assets/TWIST_INVOICE_1787734260203.pdf"
output = ".agents/outputs/twist_invoice_page_1.png"

doc = fitz.open(source)
page = doc[0]
page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False).save(output)

print(f"pages={doc.page_count}")
print(f"page_size={page.rect}")
print(f"output={output}")
for block in page.get_text("dict")["blocks"]:
    if block["type"] == 1:
        print(f"image_bbox={block['bbox']}")