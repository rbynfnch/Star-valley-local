// A small, safe Markdown renderer for article bodies. No dependency, and safe by construction: ALL text is HTML-escaped first, and the
// only markup produced is the fixed set of tags below. Links are limited to http(s) and mailto. Supported: # ## ### headings (all
// rendered one level down, since the page title is the h1), paragraphs, - * lists, 1. lists, > quotes, --- rules, **bold**, *italic*,
// `code`, [text](url). Anything else is shown as plain text.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** A link target we allow, or null. Checked on the raw text; the result is escaped when written into the attribute. */
export function safeHref(raw: string): string | null {
  const u = raw.trim();
  if (u.length === 0 || u.length > 500 || /[\u0000-\u001f\u007f\s<>"']/.test(u)) return null;
  if (/^https?:\/\/[^\s/?#]+/i.test(u)) return u;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(u)) return u;
  if (/^\/(?!\/)[A-Za-z0-9\-._~/%?=&#]*$/.test(u)) return u;                // a path on this site
  return null;
}

function inline(text: string): string {
  let s = esc(text);
  const codes: string[] = [];
  s = s.replace(/`([^`\n]+)`/g, (_m, c: string) => { codes.push(`<code>${c}</code>`); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/g, (m, label: string, url: string) => {
    // the url was escaped with the rest; undo only for the safety check, then escape again when writing
    const raw = url.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const href = safeHref(raw);
    if (!href) return m;
    const external = /^https?:/i.test(href);
    return `<a href="${esc(href)}"${external ? ' rel="noopener noreferrer" target="_blank"' : ""}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?!\*)/g, "$1<em>$2</em>").replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)] ?? "");
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") { i++; continue; }
    const h = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) { const level = Math.min(4, h[1].length + 1); out.push(`<h${level}>${inline(h[2])}</h${level}>`); i++; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
    if (/^>\s?/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote><p>${q.map(inline).join("<br>")}</p></blockquote>`); continue;
    }
    const ul = /^\s*[-*]\s+/.test(line), ol = /^\s*\d{1,3}[.)]\s+/.test(line);
    if (ul || ol) {
      const items: string[] = [];
      const re = ul ? /^\s*[-*]\s+(.*)$/ : /^\s*\d{1,3}[.)]\s+(.*)$/;
      while (i < lines.length && re.test(lines[i])) items.push(re.exec(lines[i++])![1]);
      out.push(`<${ul ? "ul" : "ol"}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${ul ? "ul" : "ol"}>`); continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,4}\s|>\s?|\s*[-*]\s+|\s*\d{1,3}[.)]\s+|-{3,}\s*$)/.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${para.map(inline).join("<br>")}</p>`);
  }
  return out.join("\n");
}

/** Plain text of the first words, for descriptions: markup characters removed, cut at a word boundary. */
export function plainExcerpt(md: string, max = 160): string {
  const t = md.replace(/```[\s\S]*?```/g, " ").replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#>*_`~-]+/g, " ").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), Math.floor(max / 2))).trimEnd() + "…";
}
export const readMinutes = (md: string): number => Math.max(1, Math.round(md.trim().split(/\s+/).filter(Boolean).length / 200));
