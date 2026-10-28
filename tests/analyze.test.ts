import { describe, expect, it } from "vitest";
import { analyseDocument, summariseAnalyses } from "@/lib/ai/analyse";
import { extractFields, extractText } from "@/lib/ai/extract";
import { DOCUMENT_SPECS, specFor } from "@/lib/ai/spec";

const NOW = new Date(Date.UTC(2026, 5, 1));

function base(overrides: Partial<Parameters<typeof analyseDocument>[0]> = {}) {
  return analyseDocument({
    kind: "FACULTY_LIST",
    fileName: "faculty.csv",
    mimeType: "text/csv",
    sizeBytes: 2048,
    extracted: { facultyCount: 40, studentFacultyRatio: 15 },
    now: NOW,
    ...overrides,
  });
}

describe("document specification catalogue", () => {
  it("covers every document kind the checklist can request", () => {
    const kinds = Object.keys(DOCUMENT_SPECS);
    expect(kinds).toContain("TRUST_DEED");
    expect(kinds).toContain("LAND_DOCUMENT");
    expect(kinds).toContain("FACULTY_LIST");
    expect(kinds).toContain("SUPPORTING_DOC");
  });

  it("returns null for an unregistered kind rather than inventing rules", () => {
    expect(specFor("MADE_UP_DOCUMENT")).toBeNull();
  });

  it("records a source clause for every specification", () => {
    for (const spec of Object.values(DOCUMENT_SPECS)) {
      expect(spec.clause.length).toBeGreaterThan(0);
      expect(spec.acceptedMime.length).toBeGreaterThan(0);
    }
  });
});

describe("analyseDocument", () => {
  it("marks a complete document compliant with a full score", () => {
    const result = base();
    expect(result.verdict).toBe("COMPLIANT");
    expect(result.score).toBe(1);
    expect(result.findings).toHaveLength(0);
    expect(result.isSuggestion).toBe(true);
    expect(result.source).toBe("rules");
  });

  it("flags a missing required field as a blocker and cites the clause", () => {
    const result = base({ extracted: { studentFacultyRatio: 15 } });
    expect(result.verdict).toBe("INCOMPLETE");
    const finding = result.findings.find((f) => f.field === "facultyCount");
    expect(finding?.severity).toBe("BLOCKER");
    expect(finding?.code).toBe("MISSING_FACULTYCOUNT");
    expect(finding?.clause).toBe(specFor("FACULTY_LIST")!.clause);
  });

  it("treats a non-mandatory field as optional", () => {
    const result = base({ extracted: { facultyCount: 40, studentFacultyRatio: 15 } });
    expect(result.findings.some((f) => f.field === "phdCount")).toBe(false);
  });

  it("rejects a file type the specification does not accept", () => {
    const result = base({ mimeType: "application/zip" });
    const finding = result.findings.find((f) => f.code === "WRONG_FORMAT");
    expect(finding?.severity).toBe("BLOCKER");
    expect(result.verdict).toBe("INCOMPLETE");
  });

  it("rejects an empty file", () => {
    const result = base({ sizeBytes: 0 });
    expect(result.findings.some((f) => f.code === "BAD_SIZE")).toBe(true);
  });

  it("warns when no fields could be read from the document", () => {
    const result = base({ extracted: {} });
    expect(result.findings.some((f) => f.code === "NOT_READABLE")).toBe(true);
    // Required fields are therefore absent too, which is a blocker.
    expect(result.verdict).toBe("INCOMPLETE");
  });

  it("warns without blocking when a document needs no required fields", () => {
    const result = analyseDocument({
      kind: "SUPPORTING_DOC",
      fileName: "annexure.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      extracted: {},
      now: NOW,
    });
    expect(result.findings.some((f) => f.code === "NOT_READABLE")).toBe(true);
    expect(result.verdict).toBe("NEEDS_ATTENTION");
  });

  it("enforces a value that must come from a fixed set", () => {
    const result = analyseDocument({
      kind: "LAND_DOCUMENT",
      fileName: "land.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      extracted: { surveyNumber: "12/3", areaSqm: 8000, ownershipType: "RENTED", district: "Pune" },
      now: NOW,
    });
    const finding = result.findings.find((f) => f.code === "INVALID_OWNERSHIPTYPE");
    expect(finding?.severity).toBe("BLOCKER");
    expect(finding?.message).toContain("OWNED");
  });

  it("accepts a value that is inside the allowed set", () => {
    const result = analyseDocument({
      kind: "LAND_DOCUMENT",
      fileName: "land.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      extracted: { surveyNumber: "12/3", areaSqm: 8000, ownershipType: "LEASED", district: "Pune" },
      now: NOW,
    });
    expect(result.findings.some((f) => f.code === "INVALID_OWNERSHIPTYPE")).toBe(false);
  });

  it("enforces a numeric lower bound", () => {
    const result = analyseDocument({
      kind: "BUILDING_PLAN",
      fileName: "plan.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      extracted: { approvalNumber: "BP-1", approvedBy: "DTP", builtUpAreaSqm: 0, floors: 3 },
      now: NOW,
    });
    expect(result.findings.some((f) => f.code === "BELOW_MIN_BUILTUPAREASQM")).toBe(true);
  });

  it("blocks an expired document when the specification defines a validity window", () => {
    const result = analyseDocument({
      kind: "AFFIDAVIT",
      fileName: "affidavit.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      extracted: { deponentName: "A. Rao", notarisedOn: "2024-01-01", courtName: "Notary, Pune" },
      expiresAt: new Date(Date.UTC(2026, 0, 1)),
      now: NOW,
    });
    expect(result.findings.some((f) => f.code === "EXPIRED")).toBe(true);
    expect(result.verdict).toBe("INCOMPLETE");
  });

  it("warns when a document with a validity window has no expiry recorded", () => {
    const result = analyseDocument({
      kind: "NOC",
      fileName: "noc.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      extracted: { issuedBy: "State Board", issuedOn: "2026-02-01" },
      now: NOW,
    });
    expect(result.findings.some((f) => f.code === "NO_EXPIRY")).toBe(true);
  });

  it("notes a likely scan without blocking it", () => {
    const result = analyseDocument({
      kind: "LAND_DOCUMENT",
      fileName: "scan_001.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      extracted: { surveyNumber: "1", areaSqm: 100, ownershipType: "OWNED", district: "Pune" },
      now: NOW,
    });
    const finding = result.findings.find((f) => f.code === "LIKELY_SCAN");
    expect(finding?.severity).toBe("INFO");
    expect(result.verdict).toBe("COMPLIANT");
  });

  it("reports an unregistered kind without fabricating a verdict", () => {
    const result = analyseDocument({
      kind: "MYSTERY_DOC",
      fileName: "x.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      now: NOW,
    });
    expect(result.verdict).toBe("UNKNOWN_KIND");
    expect(result.findings[0].code).toBe("UNKNOWN_KIND");
  });

  it("orders findings so blockers come first", () => {
    const result = analyseDocument({
      kind: "AFFIDAVIT",
      fileName: "scan_affidavit.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      extracted: { deponentName: "A. Rao" },
      expiresAt: new Date(Date.UTC(2020, 0, 1)),
      now: NOW,
    });
    const severities = result.findings.map((f) => f.severity);
    expect(severities[0]).toBe("BLOCKER");
    const firstWarning = severities.indexOf("WARNING");
    const firstInfo = severities.indexOf("INFO");
    if (firstWarning !== -1 && firstInfo !== -1) expect(firstWarning).toBeLessThan(firstInfo);
  });

  it("never returns a score outside zero to one", () => {
    const result = analyseDocument({
      kind: "TRUST_DEED",
      fileName: "scan.pdf",
      mimeType: "application/zip",
      sizeBytes: 0,
      extracted: {},
      now: NOW,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});

describe("summariseAnalyses", () => {
  it("reports readiness only when no blockers remain", () => {
    const good = base();
    const bad = base({ extracted: {} });
    const summary = summariseAnalyses([good, bad]);
    expect(summary.analysed).toBe(2);
    expect(summary.compliant).toBe(1);
    expect(summary.readyForSubmission).toBe(false);
  });

  it("counts a fully compliant set as ready", () => {
    expect(summariseAnalyses([base()]).readyForSubmission).toBe(true);
  });
});

describe("extraction", () => {
  it("reads labelled values out of plain text", () => {
    const text = "Faculty Count: 42\nStudent Faculty Ratio: 15\nPhD: 8";
    const fields = extractFields(text, specFor("FACULTY_LIST")!);
    expect(fields.facultyCount).toBe(42);
    expect(fields.studentFacultyRatio).toBe(15);
    expect(fields.phdCount).toBe(8);
  });

  it("returns nothing for text with no recognisable labels", () => {
    const fields = extractFields("Some unrelated narrative about the institution.", specFor("FACULTY_LIST")!);
    expect(Object.keys(fields)).toHaveLength(0);
  });

  it("decodes literal strings from a PDF body", () => {
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n(Registration Number: ABC-123)\nendobj\n%%EOF", "latin1");
    const text = extractText(pdf, "application/pdf");
    expect(text).toContain("Registration Number: ABC-123");
  });

  it("returns empty text for a binary format it cannot decode", () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01]);
    expect(extractText(zip, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("");
  });

  it("does not mistake a long narrative for a number", () => {
    const text = "Faculty Count: forty two faculty members are currently employed here";
    const fields = extractFields(text, specFor("FACULTY_LIST")!);
    expect(fields.facultyCount).toBe("forty two faculty members are currently employed here");
  });

  it("keeps an alphanumeric identifier intact instead of stripping it to digits", () => {
    const text = "Survey Number: 145/2A\nArea: 12500\nOwnership: LEASED\nDistrict: Coimbatore";
    const fields = extractFields(text, specFor("LAND_DOCUMENT")!);
    expect(fields.surveyNumber).toBe("145/2A");
    expect(fields.areaSqm).toBe(12500);
    expect(fields.ownershipType).toBe("LEASED");
  });

  it("accepts a thousands separator in a numeric field", () => {
    const text = "Area: 12,500\nOwnership: OWNED\nSurvey Number: 1\nDistrict: Pune";
    const fields = extractFields(text, specFor("LAND_DOCUMENT")!);
    expect(fields.areaSqm).toBe(12500);
  });
});
