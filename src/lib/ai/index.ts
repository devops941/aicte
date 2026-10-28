import type { ApplicationType, Role } from "@prisma/client";

/**
 * AI assistance layer.
 *
 * Every capability is implemented as deterministic code first, so the platform
 * works with no external key. A language-model provider can be registered
 * behind the same interface for summaries and document pre-checks. No function
 * here may change a stage, a status or a deadline: outputs are suggestions the
 * officer must confirm, and each carries a `source` and a `suggestion` flag.
 */

export type Suggestion<T> = {
  value: T;
  confidence: number;
  factors: string[];
  source: "rules" | "model";
  isSuggestion: true;
};

export type ClassificationInput = {
  intakeRequested?: number | null;
  existingIntake?: number | null;
  hasExistingApproval?: boolean;
  isNewInstitution?: boolean;
  courseName?: string | null;
};

const COURSE_SIGNALS = ["course", "programme", "program", "branch", "discipline"];

/** Suggests an application type from form data. Human picks the final value. */
export function classifyApplication(input: ClassificationInput): Suggestion<ApplicationType> {
  const factors: string[] = [];

  if (input.hasExistingApproval && input.intakeRequested && input.existingIntake) {
    if (input.intakeRequested > input.existingIntake) {
      factors.push(`Requested intake ${input.intakeRequested} exceeds existing ${input.existingIntake}`);
      return { value: "INCREASE_IN_INTAKE", confidence: 0.86, factors, source: "rules", isSuggestion: true };
    }
    factors.push("Existing approval found with no intake increase");
    return { value: "EXTENSION_OF_APPROVAL", confidence: 0.78, factors, source: "rules", isSuggestion: true };
  }

  if (input.courseName && COURSE_SIGNALS.some((s) => input.courseName!.toLowerCase().includes(s))) {
    factors.push(`Course field present: "${input.courseName}"`);
    return { value: "NEW_COURSE", confidence: 0.7, factors, source: "rules", isSuggestion: true };
  }

  if (input.isNewInstitution) {
    factors.push("No prior approval recorded for this institution");
    return { value: "NEW_ENGINEERING", confidence: 0.8, factors, source: "rules", isSuggestion: true };
  }

  factors.push("No strong signal; defaulted to new engineering approval");
  return { value: "NEW_ENGINEERING", confidence: 0.5, factors, source: "rules", isSuggestion: true };
}

export type DelayRiskInput = {
  stageAgeWorkingDays: number;
  slaWorkingDays: number;
  openCasesForOwner: number;
  clarificationsRaised: number;
  avgStageDaysForType: number;
};

/**
 * Delay-risk score, rule-based with the contributing factors always returned so
 * the officer can see *why* a case was flagged.
 */
export function delayRisk(input: DelayRiskInput): Suggestion<"LOW" | "MEDIUM" | "HIGH"> {
  const factors: string[] = [];
  let score = 0;

  const ratio = input.slaWorkingDays > 0 ? input.stageAgeWorkingDays / input.slaWorkingDays : 0;
  if (ratio >= 1) {
    score += 3;
    factors.push(`Stage age ${input.stageAgeWorkingDays}d has passed the ${input.slaWorkingDays}d allowance`);
  } else if (ratio >= 0.8) {
    score += 2;
    factors.push(`${Math.round(ratio * 100)}% of the stage allowance is used`);
  } else if (ratio >= 0.5) {
    score += 1;
    factors.push(`${Math.round(ratio * 100)}% of the stage allowance is used`);
  }

  if (input.openCasesForOwner >= 25) {
    score += 2;
    factors.push(`Owner is carrying ${input.openCasesForOwner} open cases`);
  } else if (input.openCasesForOwner >= 12) {
    score += 1;
    factors.push(`Owner is carrying ${input.openCasesForOwner} open cases`);
  }

  if (input.clarificationsRaised >= 3) {
    score += 2;
    factors.push(`${input.clarificationsRaised} clarification rounds so far`);
  } else if (input.clarificationsRaised >= 1) {
    score += 1;
    factors.push(`${input.clarificationsRaised} clarification round(s) so far`);
  }

  if (input.avgStageDaysForType > 0 && input.stageAgeWorkingDays > input.avgStageDaysForType * 1.5) {
    score += 1;
    factors.push(`Slower than the ${Math.round(input.avgStageDaysForType)}d average for this application type`);
  }

  const value = score >= 5 ? "HIGH" : score >= 3 ? "MEDIUM" : "LOW";
  if (factors.length === 0) factors.push("No risk factors detected");
  return { value, confidence: Math.min(0.95, 0.5 + score * 0.08), factors, source: "rules", isSuggestion: true };
}

export type ChecklistInput = {
  applicationType: ApplicationType;
  submittedKinds: string[];
  required: { kind: string; label: string; mandatory: boolean }[];
};

export type ChecklistResult = {
  outstanding: { kind: string; label: string; mandatory: boolean }[];
  satisfied: { kind: string; label: string }[];
  complete: boolean;
};

/** Compliance assistant: which configured checklist items are still missing. */
export function outstandingChecklist(input: ChecklistInput): ChecklistResult {
  const submitted = new Set(input.submittedKinds);
  const outstanding = input.required.filter((r) => !submitted.has(r.kind));
  const satisfied = input.required
    .filter((r) => submitted.has(r.kind))
    .map((r) => ({ kind: r.kind, label: r.label }));
  return {
    outstanding,
    satisfied,
    complete: outstanding.filter((o) => o.mandatory).length === 0,
  };
}

export type DocCheckInput = {
  fileName: string;
  mimeType: string;
  extracted?: Record<string, unknown> | null;
  expectedKind: string;
  requiredFields?: string[];
};

export type DocCheckResult = {
  issues: string[];
  matchedFields: string[];
  missingFields: string[];
  confidence: number;
  source: "rules";
  isSuggestion: true;
};

/**
 * Document pre-check. Reads whatever fields an extractor produced and reports
 * gaps. It never asserts a document is genuine; the officer confirms.
 */
export function preCheckDocument(input: DocCheckInput): DocCheckResult {
  const issues: string[] = [];
  const extracted = input.extracted ?? {};
  const matchedFields = Object.keys(extracted);
  const required = input.requiredFields ?? [];
  const missingFields = required.filter((f) => extracted[f] === undefined || extracted[f] === null || extracted[f] === "");

  if (missingFields.length > 0) issues.push(`Missing required field(s): ${missingFields.join(", ")}`);
  if (matchedFields.length === 0) issues.push("No machine-readable fields were extracted; officer review required");

  if (input.mimeType === "application/pdf" && /scan/i.test(input.fileName)) {
    issues.push("File name suggests a scan; text may be an image and not machine-readable");
  }

  return {
    issues,
    matchedFields,
    missingFields,
    confidence: matchedFields.length === 0 ? 0.2 : Math.max(0.3, 1 - missingFields.length / Math.max(1, required.length)),
    source: "rules",
    isSuggestion: true,
  };
}

export type SummaryEntry = { id: string; action: string; remark?: string | null; at: Date; actor?: string | null };

export type CaseSummary = {
  text: string;
  citations: string[];
  source: "rules";
  isSuggestion: true;
};

/**
 * Case summary built from the record itself, citing entry ids so a reader can
 * jump to the source. It is never saved as a remark automatically.
 */
export function summariseCase(entries: SummaryEntry[], title: string): CaseSummary {
  const ordered = [...entries].sort((a, b) => a.at.getTime() - b.at.getTime());
  if (ordered.length === 0) {
    return { text: `${title}: no recorded activity yet.`, citations: [], source: "rules", isSuggestion: true };
  }
  const clarifications = ordered.filter((e) => e.action === "RETURN_FOR_CLARIFICATION").length;
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const spanDays = Math.max(1, Math.round((last.at.getTime() - first.at.getTime()) / 86400000));

  const parts = [
    `${title}: ${ordered.length} recorded step(s) over ${spanDays} day(s).`,
    `Opened with ${first.action}${first.actor ? ` by ${first.actor}` : ""}.`,
    `Latest step is ${last.action}${last.actor ? ` by ${last.actor}` : ""}.`,
  ];
  if (clarifications > 0) parts.push(`${clarifications} clarification round(s) recorded.`);
  if (last.remark) parts.push(`Most recent remark: "${last.remark.slice(0, 160)}".`);

  return {
    text: parts.join(" "),
    citations: [first.id, last.id],
    source: "rules",
    isSuggestion: true,
  };
}

export type NlFilter = {
  status?: string[];
  slaState?: string[];
  type?: string[];
  regionName?: string;
  overdueOnly?: boolean;
  dueSoonOnly?: boolean;
  unmatched: string[];
  interpreted: string;
};

const STATUS_WORDS: Record<string, string> = {
  draft: "DRAFT",
  submitted: "SUBMITTED",
  "in process": "IN_PROCESS",
  "in-process": "IN_PROCESS",
  clarification: "RETURNED_FOR_CLARIFICATION",
  returned: "RETURNED_FOR_CLARIFICATION",
  scheduled: "SCHEDULED_EVC",
  evc: "SCHEDULED_EVC",
  "pending decision": "PENDING_DECISION",
  approved: "APPROVED",
  rejected: "REJECTED",
  withdrawn: "WITHDRAWN",
};

/**
 * Natural-language search. The query is translated into the same structured
 * filter the case list already uses; it is never turned into SQL, and the
 * caller still applies the actor's scope on top.
 */
export function interpretQuery(query: string, knownRegions: string[] = []): NlFilter {
  const q = query.toLowerCase();
  const filter: NlFilter = { unmatched: [], interpreted: "" };
  const statuses = new Set<string>();
  const types = new Set<string>();

  if (/\boverdue\b/.test(q)) {
    filter.overdueOnly = true;
    statuses.add("__OVERDUE__");
  }
  if (/\bdue soon\b|\bduesoon\b|\bnearing\b/.test(q)) {
    filter.dueSoonOnly = true;
  }
  if (/\bpending\b/.test(q) && !/pending decision/.test(q)) {
    statuses.add("IN_PROCESS");
    statuses.add("SUBMITTED");
  }

  for (const [word, status] of Object.entries(STATUS_WORDS)) {
    if (q.includes(word)) statuses.add(status);
  }

  if (/increase.*intake|intake.*increase/.test(q)) types.add("INCREASE_IN_INTAKE");
  if (/new course/.test(q)) types.add("NEW_COURSE");
  if (/extension/.test(q)) types.add("EXTENSION_OF_APPROVAL");
  if (/closure|close/.test(q)) types.add("CLOSURE");
  if (/new (engineering|institution|college)/.test(q)) types.add("NEW_ENGINEERING");

  for (const region of knownRegions) {
    if (q.includes(region.toLowerCase())) {
      filter.regionName = region;
      break;
    }
  }

  const cleaned = [...statuses].filter((s) => s !== "__OVERDUE__");
  if (cleaned.length) filter.status = cleaned;
  if (types.size) filter.type = [...types];

  const described: string[] = [];
  if (filter.overdueOnly) described.push("overdue only");
  if (filter.dueSoonOnly) described.push("due soon only");
  if (filter.status?.length) described.push(`status in ${filter.status.join(", ")}`);
  if (filter.type?.length) described.push(`type in ${filter.type.join(", ")}`);
  if (filter.regionName) described.push(`region ${filter.regionName}`);
  filter.interpreted = described.length ? `Interpreting as: ${described.join("; ")}` : "No filter recognised; showing all cases in scope";

  const recognisedWords = Object.keys(STATUS_WORDS).concat(["overdue", "due soon", "pending"]);
  const leftovers = q
    .split(/[^a-z]+/)
    .filter((w) => w.length > 3 && !recognisedWords.some((k) => k.includes(w)));
  filter.unmatched = leftovers.slice(0, 6);

  return filter;
}

export type AiProvider = {
  name: string;
  summarise(entries: SummaryEntry[], title: string): Promise<CaseSummary>;
  preCheck(input: DocCheckInput): Promise<DocCheckResult>;
};

export const rulesProvider: AiProvider = {
  name: "rules",
  async summarise(entries, title) {
    return summariseCase(entries, title);
  },
  async preCheck(input) {
    return preCheckDocument(input);
  },
};

export function getAiProvider(): AiProvider {
  return rulesProvider;
}

export type RoleHint = { role: Role; hint: string };

export { DOCUMENT_SPECS, specFor } from "./spec";
export type { DocumentSpec, SpecField } from "./spec";
export { analyseDocument, summariseAnalyses } from "./analyse";
export type { DocumentAnalysis, Finding, Severity } from "./analyse";
export { extractText, extractFields, extractDocument } from "./extract";
