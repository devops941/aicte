import { specFor, type DocumentSpec, type SpecField } from "./spec";

/**
 * Document analysis engine.
 *
 * It compares a stored document against the AICTE specification for its kind
 * and returns findings the officer can act on. Every finding cites the clause
 * it comes from and carries a severity, so the UI can rank what matters. The
 * engine never changes a status or a deadline: it reports, the officer decides.
 */

export type Severity = "BLOCKER" | "WARNING" | "INFO";

export type Finding = {
  code: string;
  severity: Severity;
  message: string;
  /** Specification clause the finding is derived from. */
  clause: string;
  /** Field the finding concerns, when it is field-specific. */
  field?: string;
};

export type DocumentAnalysis = {
  kind: string;
  title: string;
  clause: string;
  findings: Finding[];
  checks: { code: string; label: string; passed: boolean }[];
  score: number;
  verdict: "COMPLIANT" | "NEEDS_ATTENTION" | "INCOMPLETE" | "UNKNOWN_KIND";
  extracted: Record<string, unknown>;
  /** Advisory only, as with every other capability in this layer. */
  isSuggestion: true;
  source: "rules";
};

export type AnalyseInput = {
  kind: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Values an extractor produced. Empty when no text was machine-readable. */
  extracted?: Record<string, unknown> | null;
  expiresAt?: Date | null;
  now?: Date;
};

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function checkField(field: SpecField, value: unknown, spec: DocumentSpec, findings: Finding[]): boolean {
  if (isBlank(value)) {
    if (field.required) {
      findings.push({
        code: `MISSING_${field.key.toUpperCase()}`,
        severity: "BLOCKER",
        message: `${field.label} is required but was not found in the document.`,
        clause: spec.clause,
        field: field.key,
      });
      return false;
    }
    return true;
  }

  if (field.oneOf && typeof value === "string" && !field.oneOf.includes(value)) {
    findings.push({
      code: `INVALID_${field.key.toUpperCase()}`,
      severity: "BLOCKER",
      message: `${field.label} is "${value}", which is outside the accepted values (${field.oneOf.join(", ")}).`,
      clause: spec.clause,
      field: field.key,
    });
    return false;
  }

  if (field.min !== undefined) {
    const numeric = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(numeric) && numeric < field.min) {
      findings.push({
        code: `BELOW_MIN_${field.key.toUpperCase()}`,
        severity: "BLOCKER",
        message: `${field.label} is ${numeric}, below the minimum of ${field.min}.`,
        clause: spec.clause,
        field: field.key,
      });
      return false;
    }
  }

  return true;
}

/**
 * Analyses one document. Findings are ordered by severity so the first item in
 * the list is always the one that most needs attention.
 */
export function analyseDocument(input: AnalyseInput): DocumentAnalysis {
  const spec = specFor(input.kind);
  const now = input.now ?? new Date();
  const extracted = input.extracted ?? {};

  if (!spec) {
    return {
      kind: input.kind,
      title: input.kind,
      clause: "No specification is registered for this document kind.",
      findings: [
        {
          code: "UNKNOWN_KIND",
          severity: "WARNING",
          message: `No AICTE specification is registered for "${input.kind}", so it could not be checked automatically.`,
          clause: "No specification registered",
        },
      ],
      checks: [{ code: "SPEC_AVAILABLE", label: "Specification available", passed: false }],
      score: 0,
      verdict: "UNKNOWN_KIND",
      extracted,
      isSuggestion: true,
      source: "rules",
    };
  }

  const findings: Finding[] = [];
  const checks: { code: string; label: string; passed: boolean }[] = [];

  // Format checks come first: a wrong file type makes field checks moot.
  const formatOk = spec.acceptedMime.includes(input.mimeType);
  checks.push({ code: "FORMAT", label: "Accepted file format", passed: formatOk });
  if (!formatOk) {
    findings.push({
      code: "WRONG_FORMAT",
      severity: "BLOCKER",
      message: `${input.mimeType} is not an accepted format for this document. Accepted: ${spec.acceptedMime.join(", ")}.`,
      clause: spec.clause,
    });
  }

  const sizeOk = input.sizeBytes > 0 && input.sizeBytes <= 10 * 1024 * 1024;
  checks.push({ code: "SIZE", label: "Within the size limit", passed: sizeOk });
  if (!sizeOk) {
    findings.push({
      code: "BAD_SIZE",
      severity: "BLOCKER",
      message: input.sizeBytes === 0 ? "The file is empty." : "The file exceeds the 10MB upload limit.",
      clause: spec.clause,
    });
  }

  const hasText = Object.keys(extracted).length > 0;
  checks.push({ code: "READABLE", label: "Machine-readable fields found", passed: hasText });
  if (!hasText) {
    findings.push({
      code: "NOT_READABLE",
      severity: "WARNING",
      message: "No machine-readable fields were found; this is likely a scan and needs manual review.",
      clause: spec.clause,
    });
  }

  // Field checks against the specification.
  let passedFields = 0;
  for (const field of spec.requiredFields) {
    if (checkField(field, extracted[field.key], spec, findings)) passedFields += 1;
  }
  const allFieldsOk = findings.every((f) => f.field === undefined);
  checks.push({ code: "FIELDS", label: "Required fields present and valid", passed: allFieldsOk });

  // Validity window, when the specification defines one.
  if (spec.validityMonths !== undefined) {
    if (!input.expiresAt) {
      findings.push({
        code: "NO_EXPIRY",
        severity: "WARNING",
        message: `This document type is valid for ${spec.validityMonths} months, but no expiry date is recorded.`,
        clause: spec.clause,
      });
      checks.push({ code: "VALIDITY", label: "Validity window recorded", passed: false });
    } else if (input.expiresAt.getTime() < now.getTime()) {
      findings.push({
        code: "EXPIRED",
        severity: "BLOCKER",
        message: `The document expired on ${input.expiresAt.toISOString().slice(0, 10)}.`,
        clause: spec.clause,
      });
      checks.push({ code: "VALIDITY", label: "Document still valid", passed: false });
    } else {
      checks.push({ code: "VALIDITY", label: "Document still valid", passed: true });
    }
  }

  // A filename that admits it is a scan is a useful early hint for reviewers.
  if (/scan|photo|camera|img[_-]?\d/i.test(input.fileName) && input.mimeType === "application/pdf") {
    findings.push({
      code: "LIKELY_SCAN",
      severity: "INFO",
      message: "The file name suggests a scan; text search may not work on this document.",
      clause: spec.clause,
    });
  }

  const blockers = findings.filter((f) => f.severity === "BLOCKER").length;
  const warnings = findings.filter((f) => f.severity === "WARNING").length;

  // Score weights blockers hardest, then warnings, then field coverage.
  const fieldCoverage = spec.requiredFields.length === 0 ? 1 : passedFields / spec.requiredFields.length;
  const raw = fieldCoverage - blockers * 0.35 - warnings * 0.12;
  const score = Math.max(0, Math.min(1, Number(raw.toFixed(2))));

  const verdict: DocumentAnalysis["verdict"] =
    blockers > 0 ? "INCOMPLETE" : warnings > 0 ? "NEEDS_ATTENTION" : "COMPLIANT";

  const order: Record<Severity, number> = { BLOCKER: 0, WARNING: 1, INFO: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    kind: spec.kind,
    title: spec.title,
    clause: spec.clause,
    findings,
    checks,
    score,
    verdict,
    extracted,
    isSuggestion: true,
    source: "rules",
  };
}

/** Summarises a set of analyses for the case header. */
export function summariseAnalyses(analyses: DocumentAnalysis[]) {
  const blockers = analyses.reduce((n, a) => n + a.findings.filter((f) => f.severity === "BLOCKER").length, 0);
  const warnings = analyses.reduce((n, a) => n + a.findings.filter((f) => f.severity === "WARNING").length, 0);
  return {
    analysed: analyses.length,
    compliant: analyses.filter((a) => a.verdict === "COMPLIANT").length,
    blockers,
    warnings,
    readyForSubmission: blockers === 0,
  };
}
