"""Extrait les glyphes dessinés de la police Feroniapi en chemins SVG.

Usage : python scripts/extract_glyphs.py
Écrit src/glyphs.js (à relancer seulement si la liste GLYPHS change).
"""

from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "src/assets/fonts/Feroniapi-MediumItalic.otf"
OUT = ROOT / "src/glyphs.js"

GLYPHS = {
    # Catégories
    "feuilleradis": "feuilleradis",
    "myrtilles": "myrtilles",
    "pasteque": "pasteque",
    "fraise": "fraise",
    "petitspois": "petitspois",
    "pommeverreuse": "pommeverreuse",
    "poire": "poire",
    "peche": "peche",
    # Semis décoratif
    "cerise": "cerise",
    "champignon": "champignon",
    "citron": "citron",
    "gland": "gland",
    "mirabelles": "mirabelles",
    "raisin": "raisin",
    "carotte": "carotte",
    "chou": "chou",
    "fleuron2": "fleuron2",
    "fleuron4": "fleuron4",
    "fleuron5": "fleuron5",
    "fleuron6": "fleuron6",
    "fleuron7": "fleuron7",
    "fleuron8": "fleuron8",
    "frise": "travailfrise22",
    "frise2": "travailfrise20",
    "chenille": "u1F41B",
    "coeur": "heart",
}

PAD = 10


def main():
    font = TTFont(FONT)
    glyph_set = font.getGlyphSet()
    lines = [
        "// Généré par scripts/extract_glyphs.py depuis Feroniapi-MediumItalic.otf",
        "export const glyphs = {",
    ]

    for key, name in GLYPHS.items():
        glyph = glyph_set[name]
        bounds = BoundsPen(glyph_set)
        glyph.draw(bounds)
        x_min, y_min, x_max, y_max = bounds.bounds
        width = round(x_max - x_min + PAD * 2)
        height = round(y_max - y_min + PAD * 2)

        path_pen = SVGPathPen(glyph_set, ntos=lambda v: f"{round(v)}")
        # Repère police (y vers le haut) -> repère SVG (y vers le bas).
        glyph.draw(TransformPen(path_pen, (1, 0, 0, -1, PAD - x_min, y_max + PAD)))
        lines.append(f'  {key}: {{ w: {width}, h: {height}, d: "{path_pen.getCommands()}" }},')

    lines.append("};")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)} : {OUT.stat().st_size // 1024} Ko, {len(GLYPHS)} glyphes")


if __name__ == "__main__":
    main()
