"""Generate the project's tiny self-owned 5x7 title-screen font."""

from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen


PATTERNS = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    "J": ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    "W": ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
    "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
    "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
    ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
    "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
    "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
    "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
    "'": ["00100", "00100", "00000", "00000", "00000", "00000", "00000"],
}


def rectangle_glyph(pattern):
    pen = TTGlyphPen(None)
    for row, cells in enumerate(pattern):
        for column, filled in enumerate(cells):
            if filled != "1":
                continue
            x0 = column * 100
            y0 = 700 - row * 100
            pen.moveTo((x0, y0))
            pen.lineTo((x0 + 100, y0))
            pen.lineTo((x0 + 100, y0 + 100))
            pen.lineTo((x0, y0 + 100))
            pen.closePath()
    return pen.glyph()


def triangle_glyph():
    pen = TTGlyphPen(None)
    pen.moveTo((50, 150))
    pen.lineTo((500, 450))
    pen.lineTo((50, 750))
    pen.closePath()
    return pen.glyph()


def main():
    output = Path(__file__).resolve().parents[1] / "assets" / "fonts" / "EndlessPixel.ttf"
    output.parent.mkdir(parents=True, exist_ok=True)

    glyph_order = [".notdef", "space", *[f"glyph_{ord(character):04X}" for character in PATTERNS], "triangle"]
    glyphs = {".notdef": rectangle_glyph(["11111", "10001", "10101", "10001", "10101", "10001", "11111"])}
    glyphs["space"] = TTGlyphPen(None).glyph()
    metrics = {".notdef": (600, 0), "space": (400, 0)}
    cmap = {32: "space", 0x25B6: "triangle"}

    for character, pattern in PATTERNS.items():
        name = f"glyph_{ord(character):04X}"
        glyphs[name] = rectangle_glyph(pattern)
        metrics[name] = (600, 0)
        cmap[ord(character)] = name
        if character.isalpha():
            cmap[ord(character.lower())] = name

    glyphs["triangle"] = triangle_glyph()
    metrics["triangle"] = (600, 0)

    builder = FontBuilder(1000, isTTF=True)
    builder.setupGlyphOrder(glyph_order)
    builder.setupCharacterMap(cmap)
    builder.setupGlyf(glyphs)
    builder.setupHorizontalMetrics(metrics)
    builder.setupHorizontalHeader(ascent=850, descent=-150)
    builder.setupNameTable({
        "familyName": "Endless Pixel",
        "styleName": "Regular",
        "uniqueFontIdentifier": "EndlessPixel-Regular-1.0",
        "fullName": "Endless Pixel Regular",
        "psName": "EndlessPixel-Regular",
        "version": "Version 1.0",
    })
    builder.setupOS2(sTypoAscender=850, sTypoDescender=-150, usWinAscent=850, usWinDescent=150)
    builder.setupPost()
    builder.setupMaxp()
    builder.save(output)
    print(output)


if __name__ == "__main__":
    main()
