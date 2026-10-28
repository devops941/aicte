import { specFor, type DocumentSpec } from "./spec";

/**
 * Best-effort field extraction.
 *
 * The platform ships with no external document service, so this reads what it
 * can from the bytes and reports only what it actually found. Anything it
 * cannot read is left absent, and the analyser turns that into a "needs manual
 * review" finding rather than a guess. A richer extractor can replace this
 * behind the same function signature.
 */

/** Pulls readable text from the common formats the platform accepts. */
export function extractText(buffer: Buffer, mimeType: string): string {
  if (mimeType.startsWith("text/") || mimeType === "text/csv") {
    return buffer.toString("utf8");
  }

  if (mimeType === "application/pdf") {
    return extractPdfText(buffer);
  }

  // Office formats are ZIP containers; decoding them is out of scope here, so
  // the analyser will correctly report that the file needs manual review.
  return "";
}

/**
 * Extracts literal strings from a PDF. Compressed streams are skipped, so this
 * works for PDFs written with plain text operators and returns "" otherwise.
 */
function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const pieces: string[] = [];

  // Literal strings inside text objects: ( ... ) with escapes.
  const literal = /\(((?:\\.|[^()\\])*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = literal.exec(raw)) !== null) {
    const decoded = match[1]
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\([()\\])/g, "$1");
    if (decoded.trim()) pieces.push(decoded);
  }

  return pieces.join("\n");
}

const KEY_ALIASES: Record<string, string[]> = {
  registrationnumber: ["registration number", "reg no", "registration no"],
  registrationdate: ["registration date", "date of registration"],
  trustname: ["trust name", "society name", "name of trust"],
  trusteecount: ["trustees", "trustee count", "number of trustees"],
  surveynumber: ["survey number", "survey no", "plot number", "plot no"],
  areasqm: ["area", "land area", "area (sqm)", "area in sqm"],
  ownershiptype: ["ownership", "nature of ownership"],
  district: ["district", "revenue district"],
  approvalnumber: ["approval number", "plan approval no"],
  approvedby: ["approved by", "approving authority", "sanctioned by"],
  builtupareasqm: ["built-up area", "built up area", "builtup area"],
  floors: ["floors", "number of floors", "no of floors"],
  deponentname: ["deponent", "deponent name"],
  notarisedon: ["notarised on", "notarized on", "date of notarisation"],
  courtname: ["notary", "court", "before"],
  facultycount: ["faculty count", "total faculty", "no of faculty"],
  studentfacultyratio: ["student faculty ratio", "student-faculty ratio", "sfr"],
  phdcount: ["phd", "doctorate"],
  auditorname: ["auditor", "chartered accountant", "ca name"],
  financialyear: ["financial year", "fy"],
  networth: ["net worth", "networth"],
  academicyear: ["academic year", "year covered"],
  deficienciesclosed: ["deficiencies closed", "deficiency closed"],
  tuitionperyear: ["tuition fee", "tuition per year", "annual fee"],
  classrooms: ["classrooms", "number of classrooms", "no of classrooms"],
  labcount: ["laboratories", "labs", "lab count", "number of laboratories"],
  libraryvolumecount: ["library volumes", "volumes", "books"],
  totalvalue: ["total value", "equipment value"],
  programname: ["programme name", "program name", "course name"],
  credits: ["credits", "total credits"],
  semesters: ["semesters", "number of semesters"],
  studentcount: ["students", "student count", "number of students"],
  receivinginstitutions: ["receiving institutions", "transfer to"],
  issuedby: ["issued by", "issuing authority"],
  issuedon: ["issued on", "date of issue"],
};

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Finds field values in free text. Two shapes are recognised: a "label: value"
 * line, and a "label value" pair where the value follows on the same line.
 * Numeric fields are coerced to numbers so the analyser's bounds checks apply.
 */
export function extractFields(text: string, spec: DocumentSpec): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!text.trim()) return out;

  const lines = text
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const field of spec.requiredFields) {
    const aliases = KEY_ALIASES[normaliseKey(field.key)] ?? [field.label.toLowerCase(), field.key.toLowerCase()];

    for (const line of lines) {
      const lower = line.toLowerCase();
      const alias = aliases.find((a) => lower.startsWith(a) || lower.includes(`${a}:`));
      if (!alias) continue;

      const rest = line.slice(lower.indexOf(alias) + alias.length);
      const value = rest.replace(/^[\s:=\-–]+/, "").trim();
      if (!value) continue;

      // Only coerce a value that is already a plain number. Stripping the
      // non-digits instead would mangle identifiers such as "145/2A".
      const numeric = /^-?\d+(\.\d+)?$/.test(value.replace(/[,\s]/g, ""))
        ? Number(value.replace(/[,\s]/g, ""))
        : null;
      out[field.key] = numeric !== null ? numeric : value;
      break;
    }
  }

  return out;
}

/** Reads a stored file and returns whatever fields could be recovered. */
export function extractDocument(buffer: Buffer, mimeType: string, kind: string): Record<string, unknown> {
  const spec = specFor(kind);
  if (!spec) return {};
  return extractFields(extractText(buffer, mimeType), spec);
}
