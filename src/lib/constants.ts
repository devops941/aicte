export const ROLE_LABELS: Record<string, string> = {
  INSTITUTION_ADMIN: "Institution Admin",
  REGIONAL_OFFICER: "Regional Officer",
  BUREAU_OFFICER: "Bureau Officer",
  EVC_MEMBER: "EVC Member",
  COMPETENT_AUTHORITY: "Competent Authority",
  SYSTEM_ADMIN: "System Admin",
  AUDITOR: "Auditor",
};

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  IN_PROCESS: "In Process",
  RETURNED_FOR_CLARIFICATION: "Returned for Clarification",
  SCHEDULED_EVC: "EVC Scheduled",
  PENDING_DECISION: "Pending Decision",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export const TYPE_LABELS: Record<string, string> = {
  NEW_ENGINEERING: "New Engineering Institution",
  EXTENSION_OF_APPROVAL: "Extension of Approval",
  INCREASE_IN_INTAKE: "Increase in Intake",
  NEW_COURSE: "New Course",
  CLOSURE: "Closure",
  OTHERS: "Others",
};

export const SLA_LABELS: Record<string, string> = {
  ON_TRACK: "On Track",
  DUE_SOON: "Due Soon",
  OVERDUE: "Overdue",
  PAUSED: "Paused",
  MET: "Met",
  BREACHED: "Breached",
};

export const ACTION_LABELS: Record<string, string> = {
  CREATED: "Created",
  SUBMIT: "Submit",
  SCRUTINIZE: "Scrutinise",
  RETURN_FOR_CLARIFICATION: "Return for Clarification",
  RESPOND_CLARIFICATION: "Respond to Clarification",
  FORWARD: "Forward",
  RE_SCRUTINIZE: "Re-scrutinise",
  SCHEDULE_EVC: "Schedule EVC",
  COMPLETE_EVC: "Complete EVC",
  RECOMMEND: "Recommend",
  APPROVE: "Approve",
  REJECT: "Reject",
  WITHDRAW: "Withdraw",
  RESUBMIT: "Resubmit",
};

export const CHECKLIST_BY_TYPE: Record<string, { kind: string; label: string; mandatory: boolean }[]> = {
  NEW_ENGINEERING: [
    { kind: "TRUST_DEED", label: "Trust or Society Deed", mandatory: true },
    { kind: "LAND_DOCUMENT", label: "Land Ownership Document", mandatory: true },
    { kind: "BUILDING_PLAN", label: "Approved Building Plan", mandatory: true },
    { kind: "AFFIDAVIT", label: "Affidavit of Compliance", mandatory: true },
    { kind: "FACULTY_LIST", label: "Faculty List with Credentials", mandatory: true },
    { kind: "FINANCIAL_STATEMENT", label: "Audited Financial Statement", mandatory: false },
  ],
  EXTENSION_OF_APPROVAL: [
    { kind: "COMPLIANCE_REPORT", label: "Previous Year Compliance Report", mandatory: true },
    { kind: "AFFIDAVIT", label: "Affidavit of Compliance", mandatory: true },
    { kind: "FACULTY_LIST", label: "Updated Faculty List", mandatory: true },
    { kind: "FEE_STRUCTURE", label: "Approved Fee Structure", mandatory: false },
  ],
  INCREASE_IN_INTAKE: [
    { kind: "INFRA_REPORT", label: "Infrastructure Adequacy Report", mandatory: true },
    { kind: "FACULTY_LIST", label: "Faculty List for Additional Intake", mandatory: true },
    { kind: "LAB_EQUIPMENT", label: "Laboratory Equipment List", mandatory: true },
  ],
  NEW_COURSE: [
    { kind: "SYLLABUS", label: "Proposed Syllabus", mandatory: true },
    { kind: "FACULTY_LIST", label: "Faculty for Proposed Course", mandatory: true },
    { kind: "INFRA_REPORT", label: "Infrastructure for Proposed Course", mandatory: true },
  ],
  CLOSURE: [
    { kind: "STUDENT_TRANSFER", label: "Student Transfer Plan", mandatory: true },
    { kind: "NOC", label: "No Objection Certificate", mandatory: true },
  ],
  OTHERS: [{ kind: "SUPPORTING_DOC", label: "Supporting Document", mandatory: true }],
};

export const NAV_BY_ROLE: Record<string, { href: string; label: string; icon: string }[]> = {
  INSTITUTION_ADMIN: [
    { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/applications", label: "Applications", icon: "FileStack" },
    { href: "/compliance", label: "Compliance", icon: "ShieldCheck" },
    { href: "/notifications", label: "Alerts", icon: "Bell" },
  ],
  REGIONAL_OFFICER: [
    { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/cases", label: "Cases", icon: "FolderKanban" },
    { href: "/evc", label: "EVC Visits", icon: "CalendarClock" },
    { href: "/reports", label: "Reports", icon: "BarChart3" },
    { href: "/notifications", label: "Alerts", icon: "Bell" },
  ],
  BUREAU_OFFICER: [
    { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/cases", label: "Cases", icon: "FolderKanban" },
    { href: "/evc", label: "EVC Visits", icon: "CalendarClock" },
    { href: "/reports", label: "Reports", icon: "BarChart3" },
    { href: "/notifications", label: "Alerts", icon: "Bell" },
  ],
  EVC_MEMBER: [
    { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/evc", label: "My Visits", icon: "CalendarClock" },
    { href: "/notifications", label: "Alerts", icon: "Bell" },
  ],
  COMPETENT_AUTHORITY: [
    { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/cases", label: "Decisions", icon: "Gavel" },
    { href: "/reports", label: "Reports", icon: "BarChart3" },
    { href: "/audit", label: "Audit Trail", icon: "History" },
    { href: "/notifications", label: "Alerts", icon: "Bell" },
  ],
  SYSTEM_ADMIN: [
    { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/admin/workflows", label: "Workflows", icon: "GitBranch" },
    { href: "/admin/users", label: "Users", icon: "Users" },
    { href: "/admin/escalation", label: "Escalation", icon: "ArrowUpRight" },
    { href: "/admin/holidays", label: "Holidays", icon: "CalendarDays" },
    { href: "/reports", label: "Reports", icon: "BarChart3" },
    { href: "/audit", label: "Audit Trail", icon: "History" },
  ],
  AUDITOR: [
    { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/cases", label: "Cases", icon: "FolderKanban" },
    { href: "/reports", label: "Reports", icon: "BarChart3" },
    { href: "/audit", label: "Audit Trail", icon: "History" },
  ],
};
