// Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF/LF, embedded newlines, BOM). No dependency.
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let sawAny = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === '') { inQuotes = true; sawAny = true; }
    else if (c === ',') { row.push(field); field = ''; sawAny = true; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (sawAny || field !== '') { row.push(field); rows.push(row); }
      row = []; field = ''; sawAny = false;
    } else { field += c; sawAny = true; }
  }
  if (inQuotes) throw new Error('CSV has an unterminated quoted field');
  if (sawAny || field !== '') { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}
