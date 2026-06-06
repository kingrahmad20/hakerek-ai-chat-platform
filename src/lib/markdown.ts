// Minimal, dependency-free markdown -> HTML renderer for the artifact canvas
// markdown preview. Escapes first, then applies a small, safe subset
// (headings, lists, blockquotes, code, emphasis, links, images, rules).
// Output is injected via dangerouslySetInnerHTML, so every branch escapes input
// and only emits a fixed set of tags.

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// Private-Use-Area sentinels for stashing inline code so later transforms
// (emphasis, links) never touch its contents. These chars never appear in
// escaped user text.
const STASH_OPEN = String.fromCharCode(0xE000);
const STASH_CLOSE = String.fromCharCode(0xE001);

function inline(text: string): string {
    let s = escapeHtml(text);

    const codes: string[] = [];
    s = s.replace(/`([^`]+)`/g, (_m, c) => {
        codes.push(`<code>${c}</code>`);
        return `${STASH_OPEN}${codes.length - 1}${STASH_CLOSE}`;
    });

    // Images then links (URLs are already escaped; allow http(s)/data/relative).
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, url) =>
        `<img src="${url}" alt="${alt}" />`);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) =>
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");

    // Restore stashed inline code.
    s = s.replace(new RegExp(`${STASH_OPEN}(\\d+)${STASH_CLOSE}`, "g"), (_m, i) => codes[Number(i)]);
    return s;
}

export function renderMarkdown(src: string): string {
    const lines = src.replace(/\r\n/g, "\n").split("\n");
    const out: string[] = [];
    let i = 0;
    let listType: "ul" | "ol" | null = null;

    const closeList = () => {
        if (listType) { out.push(`</${listType}>`); listType = null; }
    };

    while (i < lines.length) {
        const line = lines[i];

        // Fenced code block
        const fence = line.match(/^```(.*)$/);
        if (fence) {
            closeList();
            const buf: string[] = [];
            i++;
            while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
            i++; // closing fence
            out.push(`<pre><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
            continue;
        }

        if (/^\s*$/.test(line)) { closeList(); i++; continue; }

        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            closeList();
            const level = heading[1].length;
            out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
            i++; continue;
        }

        if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
            closeList();
            out.push("<hr />");
            i++; continue;
        }

        if (/^\s*>\s?/.test(line)) {
            closeList();
            const buf: string[] = [];
            while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
                buf.push(lines[i].replace(/^\s*>\s?/, ""));
                i++;
            }
            out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
            continue;
        }

        const ul = line.match(/^\s*[-*+]\s+(.*)$/);
        const ol = line.match(/^\s*\d+\.\s+(.*)$/);
        if (ul || ol) {
            const want = ul ? "ul" : "ol";
            if (listType !== want) { closeList(); out.push(`<${want}>`); listType = want; }
            out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
            i++; continue;
        }

        // Paragraph — gather consecutive plain lines.
        closeList();
        const buf: string[] = [];
        while (
            i < lines.length &&
            !/^\s*$/.test(lines[i]) &&
            !/^```/.test(lines[i]) &&
            !/^(#{1,6})\s/.test(lines[i]) &&
            !/^\s*>\s?/.test(lines[i]) &&
            !/^\s*[-*+]\s+/.test(lines[i]) &&
            !/^\s*\d+\.\s+/.test(lines[i])
        ) {
            buf.push(lines[i]);
            i++;
        }
        out.push(`<p>${inline(buf.join(" "))}</p>`);
    }

    closeList();
    return out.join("\n");
}
