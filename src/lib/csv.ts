/**
 * CSV serialisation for report exports.
 *
 * Two hazards are handled here. The obvious one is structural: a value holding
 * a comma, quote or newline must be quoted and its quotes doubled, or it shifts
 * the columns. The subtle one is formula injection: Excel, LibreOffice and
 * Google Sheets treat a cell beginning with `=`, `+`, `-`, `@`, or a control
 * character (tab, carriage return) as a formula, so a title such as
 * `=HYPERLINK("http://evil","click")` becomes live content in the reviewer's
 * spreadsheet. Prefixing the cell with a single quote keeps the text literal.
 *
 * Both are applied to every cell, including ones a developer believes are
 * "safe" — a value's origin is not visible at the point of export.
 */

/** Characters that make a spreadsheet treat the cell as a formula. */
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

/** Escapes one value for CSV, neutralising both quoting and formula hazards. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text = String(value);

  if (FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))) {
    // The leading apostrophe is the conventional, non-destructive escape: the
    // spreadsheet shows the original text and never evaluates it.
    text = `'${text}`;
  }

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Joins rows into a CSV document with CRLF line endings, as RFC 4180 prefers. */
export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/**
 * Prefixes the UTF-8 byte-order mark so Excel opens the file as UTF-8 rather
 * than guessing a legacy codepage and mangling non-ASCII names.
 */
export function csvWithBom(body: string): string {
  return `\uFEFF${body}`;
}
