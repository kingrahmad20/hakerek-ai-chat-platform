// Minimal, dependency-free PDF generator for plain-text chat exports.
//
// Renders with the built-in Helvetica / Helvetica-Bold fonts (no embedding)
// using WinAnsi encoding, with accurate word-wrapping driven by the standard
// AFM advance-width metrics. Intended for simple text documents (chat
// transcripts) — it does not support images, colour, or rich layout.

export interface PdfBlock {
    text: string;
    bold?: boolean;
    size?: number; // points; default 11
    spaceBefore?: number; // extra vertical gap before the block, in points
}

const PAGE_W = 595.28; // A4 width in points
const PAGE_H = 841.89; // A4 height in points
const MARGIN = 56; // ~2cm
const USABLE_W = PAGE_W - MARGIN * 2;

// Helvetica AFM advance widths (per 1000 units) for ASCII 32-126.
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const HELV_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

function charWidth(code: number, bold: boolean): number {
    if (code >= 32 && code <= 126) return (bold ? HELV_BOLD : HELV)[code - 32];
    return bold ? 611 : 556; // fallback average for non-ASCII WinAnsi glyphs
}

function textWidth(s: string, size: number, bold: boolean): number {
    let w = 0;
    for (let i = 0; i < s.length; i++) w += charWidth(s.charCodeAt(i), bold);
    return (w / 1000) * size;
}

// Fold common Unicode punctuation down to WinAnsi-safe characters and drop
// anything still outside the single-byte range so the (...) literals stay valid.
function sanitize(s: string): string {
    return s
        .replace(/\r\n?/g, "\n")
        .replace(/[‘’‚‹›]/g, "'")
        .replace(/[“”„«»]/g, '"')
        .replace(/[–—]/g, "-")
        .replace(/…/g, "...")
        .replace(/[•·]/g, "*")
        .replace(/\t/g, "    ")
        .split("")
        .map((ch) => (ch.charCodeAt(0) > 255 ? "?" : ch))
        .join("");
}

function escapePdf(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

// Greedy word-wrap a single paragraph (no embedded newlines) to USABLE_W.
function wrapParagraph(text: string, size: number, bold: boolean): string[] {
    if (text === "") return [""];
    const lines: string[] = [];
    let cur = "";

    const flush = () => {
        if (cur) {
            lines.push(cur);
            cur = "";
        }
    };

    for (let word of text.split(" ")) {
        // Hard-break words that are wider than a full line.
        while (textWidth(word, size, bold) > USABLE_W) {
            flush();
            let part = "";
            let i = 0;
            for (; i < word.length; i++) {
                if (textWidth(part + word[i], size, bold) > USABLE_W) break;
                part += word[i];
            }
            if (part === "") {
                part = word[0];
                i = 1;
            }
            lines.push(part);
            word = word.slice(part.length);
        }
        const candidate = cur ? `${cur} ${word}` : word;
        if (cur && textWidth(candidate, size, bold) > USABLE_W) {
            flush();
            cur = word;
        } else {
            cur = candidate;
        }
    }
    flush();
    return lines.length ? lines : [""];
}

interface Line {
    text: string;
    y: number;
    size: number;
    bold: boolean;
}

function pdfDate(d = new Date()): string {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function contentStream(lines: Line[]): string {
    let s = "";
    let curFont = "";
    let curSize = 0;
    for (const ln of lines) {
        const font = ln.bold ? "/F2" : "/F1";
        if (font !== curFont || ln.size !== curSize) {
            s += `${font} ${ln.size} Tf\n`;
            curFont = font;
            curSize = ln.size;
        }
        s += `BT 1 0 0 1 ${MARGIN.toFixed(2)} ${ln.y.toFixed(2)} Tm (${escapePdf(ln.text)}) Tj ET\n`;
    }
    return s;
}

/** Render the given text blocks to a single-column A4 PDF. */
export function generatePdf(blocks: PdfBlock[], title = "Chat export"): Buffer {
    // 1. Lay blocks out into pages, tracking a vertical cursor.
    const pages: Line[][] = [];
    let cur: Line[] = [];
    let y = PAGE_H - MARGIN;

    const newPage = () => {
        pages.push(cur);
        cur = [];
        y = PAGE_H - MARGIN;
    };

    for (const block of blocks) {
        const size = block.size ?? 11;
        const bold = block.bold ?? false;
        const lineHeight = size * 1.4;
        if (block.spaceBefore) y -= block.spaceBefore;
        for (const para of sanitize(block.text).split("\n")) {
            for (const ln of wrapParagraph(para, size, bold)) {
                if (y - lineHeight < MARGIN) newPage();
                cur.push({ text: ln, y: y - size, size, bold });
                y -= lineHeight;
            }
        }
    }
    pages.push(cur);

    // 2. Assign object numbers: 1 catalog, 2 pages, 3/4 fonts, then a
    //    page+content pair per page, then the info dictionary last.
    const P = pages.length;
    const infoNum = 5 + P * 2;
    const objects: string[] = [];

    objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
    const kids = Array.from({ length: P }, (_, i) => `${5 + i * 2} 0 R`).join(" ");
    objects[2] = `<< /Type /Pages /Count ${P} /Kids [${kids}] >>`;
    objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
    objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;

    for (let i = 0; i < P; i++) {
        const pageNum = 5 + i * 2;
        const contentNum = 6 + i * 2;
        objects[pageNum] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNum} 0 R >>`;
        const stream = contentStream(pages[i]);
        const len = Buffer.byteLength(stream, "latin1");
        objects[contentNum] = `<< /Length ${len} >>\nstream\n${stream}\nendstream`;
    }
    objects[infoNum] = `<< /Title (${escapePdf(sanitize(title))}) /Producer (hakerek) /CreationDate (D:${pdfDate()}) >>`;

    // 3. Serialise with a cross-reference table.
    const enc = (s: string) => Buffer.from(s, "latin1");
    const chunks: Buffer[] = [];
    let offset = 0;
    const push = (buf: Buffer) => {
        chunks.push(buf);
        offset += buf.length;
    };

    push(enc("%PDF-1.4\n%âãÏÓ\n"));
    const xref: number[] = new Array(infoNum + 1).fill(0);
    for (let n = 1; n <= infoNum; n++) {
        if (!objects[n]) continue;
        xref[n] = offset;
        push(enc(`${n} 0 obj\n${objects[n]}\nendobj\n`));
    }

    const xrefStart = offset;
    let xrefStr = `xref\n0 ${infoNum + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= infoNum; n++) {
        xrefStr += `${String(xref[n]).padStart(10, "0")} 00000 n \n`;
    }
    push(enc(xrefStr));
    push(enc(`trailer\n<< /Size ${infoNum + 1} /Root 1 0 R /Info ${infoNum} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`));

    return Buffer.concat(chunks);
}
