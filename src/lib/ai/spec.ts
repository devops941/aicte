/**
 * AICTE document specification catalogue.
 *
 * Each entry encodes what the platform expects a given document kind to
 * contain, so the analyser can check a submission against a stated rule rather
 * than an opinion. The `clause` field records the source of the expectation so
 * a reviewer can see *why* a document was flagged. These rules are deliberately
 * data, not code: adding a document kind or a field is an edit here alone.
 */

export type SpecField = {
  key: string;
  label: string;
  required: boolean;
  /** Accepted values, when the field is constrained to a set. */
  oneOf?: string[];
  /** Sanity bound for numeric fields, used to catch obvious data-entry slips. */
  min?: number;
};

export type DocumentSpec = {
  kind: string;
  title: string;
  /** Where the requirement comes from, shown next to every finding. */
  clause: string;
  /** Expected validity window. Absent means the document does not expire. */
  validityMonths?: number;
  /** MIME types the platform will accept for this kind. */
  acceptedMime: string[];
  requiredFields: SpecField[];
};

const PDF_OR_IMAGE = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
];

const SPREADSHEET_OR_DOC = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
];

export const DOCUMENT_SPECS: Record<string, DocumentSpec> = {
  TRUST_DEED: {
    kind: "TRUST_DEED",
    title: "Trust or Society Deed",
    clause: "AICTE Approval Process Handbook — institutional registration evidence",
    acceptedMime: PDF_OR_IMAGE,
    requiredFields: [
      { key: "registrationNumber", label: "Registration number", required: true },
      { key: "registrationDate", label: "Date of registration", required: true },
      { key: "trustName", label: "Name of trust or society", required: true },
      { key: "trusteeCount", label: "Number of trustees", required: true, min: 2 },
    ],
  },
  LAND_DOCUMENT: {
    kind: "LAND_DOCUMENT",
    title: "Land Ownership Document",
    clause: "AICTE Approval Process Handbook — land requirement",
    acceptedMime: PDF_OR_IMAGE,
    requiredFields: [
      { key: "surveyNumber", label: "Survey or plot number", required: true },
      { key: "areaSqm", label: "Land area in square metres", required: true, min: 1 },
      { key: "ownershipType", label: "Nature of ownership", required: true, oneOf: ["OWNED", "LEASED", "GIFTED"] },
      { key: "district", label: "Revenue district", required: true },
    ],
  },
  BUILDING_PLAN: {
    kind: "BUILDING_PLAN",
    title: "Approved Building Plan",
    clause: "AICTE Approval Process Handbook — built-up area and safety",
    acceptedMime: PDF_OR_IMAGE,
    requiredFields: [
      { key: "approvalNumber", label: "Plan approval number", required: true },
      { key: "approvedBy", label: "Approving authority", required: true },
      { key: "builtUpAreaSqm", label: "Built-up area in square metres", required: true, min: 1 },
      { key: "floors", label: "Number of floors", required: true, min: 1 },
    ],
  },
  AFFIDAVIT: {
    kind: "AFFIDAVIT",
    title: "Affidavit of Compliance",
    clause: "AICTE Approval Process Handbook — undertaking of compliance",
    validityMonths: 12,
    acceptedMime: PDF_OR_IMAGE,
    requiredFields: [
      { key: "deponentName", label: "Deponent name", required: true },
      { key: "notarisedOn", label: "Date of notarisation", required: true },
      { key: "courtName", label: "Notary or court", required: true },
    ],
  },
  FACULTY_LIST: {
    kind: "FACULTY_LIST",
    title: "Faculty List with Credentials",
    clause: "AICTE Approval Process Handbook — faculty cadre ratio",
    acceptedMime: SPREADSHEET_OR_DOC,
    requiredFields: [
      { key: "facultyCount", label: "Total faculty count", required: true, min: 1 },
      { key: "studentFacultyRatio", label: "Student to faculty ratio", required: true, min: 1 },
      { key: "phdCount", label: "Faculty holding a doctorate", required: false, min: 0 },
    ],
  },
  FINANCIAL_STATEMENT: {
    kind: "FINANCIAL_STATEMENT",
    title: "Audited Financial Statement",
    clause: "AICTE Approval Process Handbook — financial soundness",
    validityMonths: 12,
    acceptedMime: SPREADSHEET_OR_DOC,
    requiredFields: [
      { key: "auditorName", label: "Chartered accountant", required: true },
      { key: "financialYear", label: "Financial year", required: true },
      { key: "netWorth", label: "Net worth", required: true },
    ],
  },
  COMPLIANCE_REPORT: {
    kind: "COMPLIANCE_REPORT",
    title: "Previous Year Compliance Report",
    clause: "AICTE Approval Process Handbook — extension of approval",
    validityMonths: 12,
    acceptedMime: SPREADSHEET_OR_DOC,
    requiredFields: [
      { key: "academicYear", label: "Academic year covered", required: true },
      { key: "deficienciesClosed", label: "Deficiencies closed", required: true, min: 0 },
    ],
  },
  FEE_STRUCTURE: {
    kind: "FEE_STRUCTURE",
    title: "Approved Fee Structure",
    clause: "AICTE Approval Process Handbook — fee fixation",
    acceptedMime: SPREADSHEET_OR_DOC,
    requiredFields: [
      { key: "approvedBy", label: "Fee fixation authority", required: true },
      { key: "tuitionPerYear", label: "Annual tuition fee", required: true, min: 0 },
    ],
  },
  INFRA_REPORT: {
    kind: "INFRA_REPORT",
    title: "Infrastructure Adequacy Report",
    clause: "AICTE Approval Process Handbook — infrastructure for the requested intake",
    acceptedMime: PDF_OR_IMAGE,
    requiredFields: [
      { key: "classrooms", label: "Number of classrooms", required: true, min: 1 },
      { key: "labCount", label: "Number of laboratories", required: true, min: 1 },
      { key: "libraryVolumeCount", label: "Library volumes", required: false, min: 0 },
    ],
  },
  LAB_EQUIPMENT: {
    kind: "LAB_EQUIPMENT",
    title: "Laboratory Equipment List",
    clause: "AICTE Approval Process Handbook — laboratory equipment",
    acceptedMime: SPREADSHEET_OR_DOC,
    requiredFields: [
      { key: "labCount", label: "Number of laboratories", required: true, min: 1 },
      { key: "totalValue", label: "Total equipment value", required: true, min: 0 },
    ],
  },
  SYLLABUS: {
    kind: "SYLLABUS",
    title: "Proposed Syllabus",
    clause: "AICTE Approval Process Handbook — new course curriculum",
    acceptedMime: PDF_OR_IMAGE,
    requiredFields: [
      { key: "programName", label: "Programme name", required: true },
      { key: "credits", label: "Total credits", required: true, min: 1 },
      { key: "semesters", label: "Number of semesters", required: true, min: 1 },
    ],
  },
  STUDENT_TRANSFER: {
    kind: "STUDENT_TRANSFER",
    title: "Student Transfer Plan",
    clause: "AICTE Approval Process Handbook — closure of programme",
    acceptedMime: SPREADSHEET_OR_DOC,
    requiredFields: [
      { key: "studentCount", label: "Number of students to transfer", required: true, min: 0 },
      { key: "receivingInstitutions", label: "Receiving institutions", required: true, min: 1 },
    ],
  },
  NOC: {
    kind: "NOC",
    title: "No Objection Certificate",
    clause: "AICTE Approval Process Handbook — state or university clearance",
    validityMonths: 12,
    acceptedMime: PDF_OR_IMAGE,
    requiredFields: [
      { key: "issuedBy", label: "Issuing authority", required: true },
      { key: "issuedOn", label: "Date of issue", required: true },
    ],
  },
  SUPPORTING_DOC: {
    kind: "SUPPORTING_DOC",
    title: "Supporting Document",
    clause: "AICTE Approval Process Handbook — additional evidence",
    acceptedMime: PDF_OR_IMAGE,
    requiredFields: [],
  },
};

export function specFor(kind: string): DocumentSpec | null {
  return DOCUMENT_SPECS[kind] ?? null;
}
