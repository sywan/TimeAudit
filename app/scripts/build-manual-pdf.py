"""Build printable manuals with an embedded Unicode font for Chinese text."""

from html import escape
from pathlib import Path
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer


PUBLIC = Path(__file__).resolve().parent.parent / "public"
FONT_PATH = Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf")
pdfmetrics.registerFont(TTFont("TimeAuditUnicode", str(FONT_PATH)))
pdfmetrics.registerFontFamily("TimeAuditUnicode", normal="TimeAuditUnicode", bold="TimeAuditUnicode", italic="TimeAuditUnicode", boldItalic="TimeAuditUnicode")


def inline(text: str) -> str:
    parts = re.split(r"(\*\*[^*]+\*\*|\[[^]]+\]\([^)]+\))", text)
    rendered = []
    for part in parts:
        if part.startswith("**") and part.endswith("**"):
            rendered.append(f"<b>{escape(part[2:-2])}</b>")
        elif part.startswith("[") and "](" in part:
            label, url = part[1:-1].split("](", 1)
            rendered.append(f'<link href="{escape(url, quote=True)}" color="#467c9c">{escape(label)}</link>')
        else:
            rendered.append(escape(part))
    return "".join(rendered)


def build(lang: str) -> None:
    name = "USER-MANUAL.md" if lang == "zh-TW" else "USER-MANUAL.en.md"
    target = PUBLIC / ("USER-MANUAL.zh-TW.pdf" if lang == "zh-TW" else "USER-MANUAL.en.pdf")
    base = dict(fontName="TimeAuditUnicode", wordWrap="CJK", textColor=colors.HexColor("#253f52"), alignment=TA_LEFT)
    styles = {
        "title": ParagraphStyle("title", fontSize=19, leading=28, spaceAfter=15, **base),
        "meta": ParagraphStyle("meta", fontSize=8, leading=13, textColor=colors.HexColor("#718a9a"), fontName="TimeAuditUnicode", wordWrap="CJK"),
        "heading": ParagraphStyle("heading", fontSize=12.5, leading=19, spaceBefore=14, spaceAfter=6, keepWithNext=True, **base),
        "body": ParagraphStyle("body", fontSize=9.5, leading=16.5, spaceAfter=5, **base),
        "list": ParagraphStyle("list", fontSize=9.5, leading=16.5, leftIndent=15, firstLineIndent=-12, spaceAfter=5, **base),
    }
    story = []
    for raw in (PUBLIC / name).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("# "):
            story.append(Paragraph(inline(line[2:]), styles["title"]))
        elif line.startswith("## "):
            story.append(Paragraph(inline(line[3:]), styles["heading"]))
        elif line.startswith("- "):
            story.append(Paragraph("• &nbsp;" + inline(line[2:]), styles["list"]))
        elif re.match(r"\d+\. ", line):
            number, body = line.split(". ", 1)
            story.append(Paragraph(f"{number}.&nbsp;&nbsp;" + inline(body), styles["list"]))
        else:
            style = styles["meta"] if line.startswith(("©", "線上互動版", "Interactive version")) else styles["body"]
            story.append(Paragraph(inline(line), style))
            if style is styles["meta"]:
                story.append(Spacer(1, 2 * mm))
    doc = SimpleDocTemplate(str(target), pagesize=A4, rightMargin=21 * mm, leftMargin=21 * mm, topMargin=19 * mm, bottomMargin=19 * mm, title="Time Audit User Guide", author="Shu-Yen Wan")
    doc.build(story)
    print(target)


if __name__ == "__main__":
    build("zh-TW")
    build("en")
