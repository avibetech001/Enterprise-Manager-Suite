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

images = page.get_images(full=True)
if len(images) >= 3:
    logo_xref, mask_xref = images[2][0], images[2][1]
    logo_pixmap = fitz.Pixmap(doc, logo_xref)
    if mask_xref:
        mask_pixmap = fitz.Pixmap(doc, mask_xref)
        logo_pixmap = fitz.Pixmap(logo_pixmap, mask_pixmap)
    logo_path = "artifacts/ems/src/assets/twist-logo.png"
    logo_pixmap.save(logo_path)
    print(f"logo={logo_path}")