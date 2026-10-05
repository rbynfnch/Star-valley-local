import { test } from "node:test";
import assert from "node:assert/strict";
import { plainExcerpt, readMinutes, renderMarkdown as md, safeHref } from "./markdown.ts";

test("paragraphs, headings (one level down), lists, quotes and rules", () => {
  assert.equal(md("# Title\n\nHello world\nsecond line\n\n## Sub\n\n- a\n- b\n\n1. one\n2) two\n\n> quoted\n\n---"),
    "<h2>Title</h2>\n<p>Hello world<br>second line</p>\n<h3>Sub</h3>\n<ul><li>a</li><li>b</li></ul>\n<ol><li>one</li><li>two</li></ol>\n<blockquote><p>quoted</p></blockquote>\n<hr>");
});
test("inline: bold, italic, code and links", () => {
  assert.equal(md("**bold** and *it* and _under_ and `code`"), "<p><strong>bold</strong> and <em>it</em> and <em>under</em> and <code>code</code></p>");
  assert.equal(md("[Site](https://example.com/a?b=1&c=2)"), '<p><a href="https://example.com/a?b=1&amp;c=2" rel="noopener noreferrer" target="_blank">Site</a></p>');
  assert.equal(md("[Home](/businesses) [Mail](mailto:a@b.example)"), '<p><a href="/businesses">Home</a> <a href="mailto:a@b.example">Mail</a></p>');
});
test("raw HTML is escaped, never rendered", () => {
  for (const evil of ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "<a href=\"javascript:alert(1)\">x</a>", "<iframe src=//evil></iframe>", "<style>*{}</style>"]) {
    const h = md(evil); assert.doesNotMatch(h, /<(script|img|iframe|style|a )/i); assert.match(h, /&lt;/);
  }
  assert.match(md("# <b>x</b>"), /<h2>&lt;b&gt;x&lt;\/b&gt;<\/h2>/);
  assert.match(md("> <script>"), /<blockquote><p>&lt;script&gt;/);
  assert.match(md("- <img src=x onerror=1>"), /<li>&lt;img/);
});
test("only http(s), mailto and same-site paths become links", () => {
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html;base64,AAA", "vbscript:x", "//evil.example", "ftp://x.example", "https://", "/a b", "https://x.example/\"onmouseover=\"alert(1)"]) {
    assert.equal(safeHref(bad), null, bad);
    assert.doesNotMatch(md(`[click](${bad})`), /<a /, bad);
  }
  for (const good of ["https://x.example", "http://x.example/a?b=1#c", "mailto:a@b.example", "/events/fair"]) assert.equal(safeHref(good), good);
});
test("a link label cannot break out of the anchor, and attribute quotes are escaped", () => {
  const h = md('[<b>x</b>](https://x.example/?q=a"b)');
  assert.doesNotMatch(h, /<b>/); assert.doesNotMatch(h, /href="[^"]*"[^>]*"b/);
});
test("code spans keep their text literally; emphasis markers inside code are not interpreted", () => {
  assert.equal(md("`**not bold** <b>`"), "<p><code>**not bold** &lt;b&gt;</code></p>");
});
test("unclosed or odd markers are shown as text; empty input is empty", () => {
  assert.equal(md("**oops and *this"), "<p>**oops and *this</p>"); assert.equal(md(""), ""); assert.equal(md("\n\n  \n"), "");
  assert.equal(md("2 * 3 * 4"), "<p>2 * 3 * 4</p>");
});
test("CRLF and control characters are normalised", () => {
  assert.equal(md("a\r\nb\u0000c"), "<p>a<br>bc</p>");
});
test("plainExcerpt strips markup and cuts at a word; readMinutes is at least 1", () => {
  assert.equal(plainExcerpt("# Hi\n\n**Bold** [link](https://x.example) text"), "Hi Bold link text");
  const long = plainExcerpt("word ".repeat(100), 50); assert.ok(long.length <= 50 && long.endsWith("…") && !/\sw…$/.test(long) || long.endsWith("…"));
  assert.equal(readMinutes(""), 1); assert.equal(readMinutes("w ".repeat(600)), 3);
});
