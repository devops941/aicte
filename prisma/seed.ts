import { PrismaClient, type ApplicationType, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { GENESIS_HASH, computeEntryHash } from "../src/lib/audit/chain";

const prisma = new PrismaClient();

type StageDef = {
  code: string;
  name: string;
  sla: number;
  role: Role;
  initial?: boolean;
  terminal?: boolean;
  description?: string;
};

type EdgeDef = {
  from: string;
  to: string;
  action: string;
  role: Role;
  remark?: boolean;
  label?: string;
};

/** Illustrative default routes. Replace SLA days with the current handbook values. */
const WORKFLOWS: Record<ApplicationType, { code: string; name: string; stages: StageDef[]; edges: EdgeDef[] }> = {
  NEW_ENGINEERING: {
    code: "WF-NEW-ENG",
    name: "New Engineering Institution Approval",
    stages: [
      { code: "SUBMITTED", name: "Submission", sla: 3, role: "INSTITUTION_ADMIN", initial: true },
      { code: "SCRUTINY", name: "Scrutiny", sla: 10, role: "REGIONAL_OFFICER" },
      { code: "CLARIFICATION", name: "Awaiting Clarification", sla: 7, role: "INSTITUTION_ADMIN" },
      { code: "EVC", name: "Expert Visit Committee", sla: 20, role: "EVC_MEMBER" },
      { code: "BUREAU_REVIEW", name: "Bureau Review", sla: 12, role: "BUREAU_OFFICER" },
      { code: "DECISION", name: "Competent Authority Decision", sla: 15, role: "COMPETENT_AUTHORITY" },
      { code: "APPROVED", name: "Approved", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
      { code: "REJECTED", name: "Rejected", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
    ],
    edges: [
      { from: "SUBMITTED", to: "SCRUTINY", action: "SUBMIT", role: "INSTITUTION_ADMIN" },
      { from: "SCRUTINY", to: "CLARIFICATION", action: "RETURN_FOR_CLARIFICATION", role: "REGIONAL_OFFICER", remark: true },
      { from: "CLARIFICATION", to: "SCRUTINY", action: "RESPOND_CLARIFICATION", role: "INSTITUTION_ADMIN", remark: true },
      { from: "SCRUTINY", to: "EVC", action: "FORWARD", role: "REGIONAL_OFFICER", remark: true },
      { from: "EVC", to: "BUREAU_REVIEW", action: "COMPLETE_EVC", role: "EVC_MEMBER", remark: true },
      { from: "BUREAU_REVIEW", to: "DECISION", action: "FORWARD", role: "BUREAU_OFFICER", remark: true },
      { from: "DECISION", to: "APPROVED", action: "APPROVE", role: "COMPETENT_AUTHORITY", remark: true },
      { from: "DECISION", to: "REJECTED", action: "REJECT", role: "COMPETENT_AUTHORITY", remark: true },
    ],
  },
  EXTENSION_OF_APPROVAL: {
    code: "WF-EOA",
    name: "Extension of Approval",
    stages: [
      { code: "SUBMITTED", name: "Submission", sla: 3, role: "INSTITUTION_ADMIN", initial: true },
      { code: "SCRUTINY", name: "Scrutiny", sla: 8, role: "REGIONAL_OFFICER" },
      { code: "CLARIFICATION", name: "Awaiting Clarification", sla: 7, role: "INSTITUTION_ADMIN" },
      { code: "BUREAU_REVIEW", name: "Bureau Review", sla: 10, role: "BUREAU_OFFICER" },
      { code: "DECISION", name: "Competent Authority Decision", sla: 12, role: "COMPETENT_AUTHORITY" },
      { code: "APPROVED", name: "Approved", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
      { code: "REJECTED", name: "Rejected", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
    ],
    edges: [
      { from: "SUBMITTED", to: "SCRUTINY", action: "SUBMIT", role: "INSTITUTION_ADMIN" },
      { from: "SCRUTINY", to: "CLARIFICATION", action: "RETURN_FOR_CLARIFICATION", role: "REGIONAL_OFFICER", remark: true },
      { from: "CLARIFICATION", to: "SCRUTINY", action: "RESPOND_CLARIFICATION", role: "INSTITUTION_ADMIN", remark: true },
      { from: "SCRUTINY", to: "BUREAU_REVIEW", action: "FORWARD", role: "REGIONAL_OFFICER", remark: true },
      { from: "BUREAU_REVIEW", to: "DECISION", action: "FORWARD", role: "BUREAU_OFFICER", remark: true },
      { from: "DECISION", to: "APPROVED", action: "APPROVE", role: "COMPETENT_AUTHORITY", remark: true },
      { from: "DECISION", to: "REJECTED", action: "REJECT", role: "COMPETENT_AUTHORITY", remark: true },
    ],
  },
  INCREASE_IN_INTAKE: {
    code: "WF-INTAKE",
    name: "Increase in Intake",
    stages: [
      { code: "SUBMITTED", name: "Submission", sla: 3, role: "INSTITUTION_ADMIN", initial: true },
      { code: "SCRUTINY", name: "Scrutiny", sla: 7, role: "REGIONAL_OFFICER" },
      { code: "CLARIFICATION", name: "Awaiting Clarification", sla: 7, role: "INSTITUTION_ADMIN" },
      { code: "EVC", name: "Expert Visit Committee", sla: 15, role: "EVC_MEMBER" },
      { code: "DECISION", name: "Competent Authority Decision", sla: 10, role: "COMPETENT_AUTHORITY" },
      { code: "APPROVED", name: "Approved", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
      { code: "REJECTED", name: "Rejected", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
    ],
    edges: [
      { from: "SUBMITTED", to: "SCRUTINY", action: "SUBMIT", role: "INSTITUTION_ADMIN" },
      { from: "SCRUTINY", to: "CLARIFICATION", action: "RETURN_FOR_CLARIFICATION", role: "REGIONAL_OFFICER", remark: true },
      { from: "CLARIFICATION", to: "SCRUTINY", action: "RESPOND_CLARIFICATION", role: "INSTITUTION_ADMIN", remark: true },
      { from: "SCRUTINY", to: "EVC", action: "FORWARD", role: "REGIONAL_OFFICER", remark: true },
      { from: "EVC", to: "DECISION", action: "COMPLETE_EVC", role: "EVC_MEMBER", remark: true },
      { from: "DECISION", to: "APPROVED", action: "APPROVE", role: "COMPETENT_AUTHORITY", remark: true },
      { from: "DECISION", to: "REJECTED", action: "REJECT", role: "COMPETENT_AUTHORITY", remark: true },
    ],
  },
  NEW_COURSE: {
    code: "WF-COURSE",
    name: "New Course Approval",
    stages: [
      { code: "SUBMITTED", name: "Submission", sla: 3, role: "INSTITUTION_ADMIN", initial: true },
      { code: "SCRUTINY", name: "Scrutiny", sla: 8, role: "REGIONAL_OFFICER" },
      { code: "CLARIFICATION", name: "Awaiting Clarification", sla: 7, role: "INSTITUTION_ADMIN" },
      { code: "BUREAU_REVIEW", name: "Bureau Review", sla: 10, role: "BUREAU_OFFICER" },
      { code: "DECISION", name: "Competent Authority Decision", sla: 12, role: "COMPETENT_AUTHORITY" },
      { code: "APPROVED", name: "Approved", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
      { code: "REJECTED", name: "Rejected", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
    ],
    edges: [
      { from: "SUBMITTED", to: "SCRUTINY", action: "SUBMIT", role: "INSTITUTION_ADMIN" },
      { from: "SCRUTINY", to: "CLARIFICATION", action: "RETURN_FOR_CLARIFICATION", role: "REGIONAL_OFFICER", remark: true },
      { from: "CLARIFICATION", to: "SCRUTINY", action: "RESPOND_CLARIFICATION", role: "INSTITUTION_ADMIN", remark: true },
      { from: "SCRUTINY", to: "BUREAU_REVIEW", action: "FORWARD", role: "REGIONAL_OFFICER", remark: true },
      { from: "BUREAU_REVIEW", to: "DECISION", action: "FORWARD", role: "BUREAU_OFFICER", remark: true },
      { from: "DECISION", to: "APPROVED", action: "APPROVE", role: "COMPETENT_AUTHORITY", remark: true },
      { from: "DECISION", to: "REJECTED", action: "REJECT", role: "COMPETENT_AUTHORITY", remark: true },
    ],
  },
  CLOSURE: {
    code: "WF-CLOSURE",
    name: "Institution Closure",
    stages: [
      { code: "SUBMITTED", name: "Submission", sla: 3, role: "INSTITUTION_ADMIN", initial: true },
      { code: "SCRUTINY", name: "Scrutiny", sla: 10, role: "REGIONAL_OFFICER" },
      { code: "CLARIFICATION", name: "Awaiting Clarification", sla: 7, role: "INSTITUTION_ADMIN" },
      { code: "DECISION", name: "Competent Authority Decision", sla: 15, role: "COMPETENT_AUTHORITY" },
      { code: "APPROVED", name: "Approved", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
      { code: "REJECTED", name: "Rejected", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
    ],
    edges: [
      { from: "SUBMITTED", to: "SCRUTINY", action: "SUBMIT", role: "INSTITUTION_ADMIN" },
      { from: "SCRUTINY", to: "CLARIFICATION", action: "RETURN_FOR_CLARIFICATION", role: "REGIONAL_OFFICER", remark: true },
      { from: "CLARIFICATION", to: "SCRUTINY", action: "RESPOND_CLARIFICATION", role: "INSTITUTION_ADMIN", remark: true },
      { from: "SCRUTINY", to: "DECISION", action: "FORWARD", role: "REGIONAL_OFFICER", remark: true },
      { from: "DECISION", to: "APPROVED", action: "APPROVE", role: "COMPETENT_AUTHORITY", remark: true },
      { from: "DECISION", to: "REJECTED", action: "REJECT", role: "COMPETENT_AUTHORITY", remark: true },
    ],
  },
  OTHERS: {
    code: "WF-OTHERS",
    name: "Other Applications",
    stages: [
      { code: "SUBMITTED", name: "Submission", sla: 3, role: "INSTITUTION_ADMIN", initial: true },
      { code: "SCRUTINY", name: "Scrutiny", sla: 10, role: "REGIONAL_OFFICER" },
      { code: "CLARIFICATION", name: "Awaiting Clarification", sla: 7, role: "INSTITUTION_ADMIN" },
      { code: "DECISION", name: "Competent Authority Decision", sla: 15, role: "COMPETENT_AUTHORITY" },
      { code: "APPROVED", name: "Approved", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
      { code: "REJECTED", name: "Rejected", sla: 0, role: "COMPETENT_AUTHORITY", terminal: true },
    ],
    edges: [
      { from: "SUBMITTED", to: "SCRUTINY", action: "SUBMIT", role: "INSTITUTION_ADMIN" },
      { from: "SCRUTINY", to: "CLARIFICATION", action: "RETURN_FOR_CLARIFICATION", role: "REGIONAL_OFFICER", remark: true },
      { from: "CLARIFICATION", to: "SCRUTINY", action: "RESPOND_CLARIFICATION", role: "INSTITUTION_ADMIN", remark: true },
      { from: "SCRUTINY", to: "DECISION", action: "FORWARD", role: "REGIONAL_OFFICER", remark: true },
      { from: "DECISION", to: "APPROVED", action: "APPROVE", role: "COMPETENT_AUTHORITY", remark: true },
      { from: "DECISION", to: "REJECTED", action: "REJECT", role: "COMPETENT_AUTHORITY", remark: true },
    ],
  },
};

const REGIONS = [
  { code: "SOUTH", name: "Southern Region" },
  { code: "WEST", name: "Western Region" },
  { code: "NORTH", name: "Northern Region" },
  { code: "EAST", name: "Eastern Region" },
];

const INSTITUTIONS = [
  { aicteId: "1-10000001", name: "Sri Venkateswara Institute of Technology", state: "Tamil Nadu", district: "Chennai", city: "Chennai", region: "SOUTH" },
  { aicteId: "1-10000002", name: "Coimbatore College of Engineering", state: "Tamil Nadu", district: "Coimbatore", city: "Coimbatore", region: "SOUTH" },
  { aicteId: "1-10000003", name: "Deccan Institute of Advanced Studies", state: "Telangana", district: "Hyderabad", city: "Hyderabad", region: "SOUTH" },
  { aicteId: "1-10000004", name: "Sahyadri Technical University", state: "Maharashtra", district: "Pune", city: "Pune", region: "WEST" },
  { aicteId: "1-10000005", name: "Gujarat Institute of Engineering", state: "Gujarat", district: "Ahmedabad", city: "Ahmedabad", region: "WEST" },
  { aicteId: "1-10000006", name: "Yamuna Institute of Technology", state: "Delhi", district: "New Delhi", city: "New Delhi", region: "NORTH" },
  { aicteId: "1-10000007", name: "Himalaya School of Engineering", state: "Uttarakhand", district: "Dehradun", city: "Dehradun", region: "NORTH" },
  { aicteId: "1-10000008", name: "Bengal Institute of Science and Technology", state: "West Bengal", district: "Kolkata", city: "Kolkata", region: "EAST" },
];

async function seedWorkflows() {
  const created: Record<string, string> = {};
  for (const [type, def] of Object.entries(WORKFLOWS)) {
    const existing = await prisma.workflowDefinition.findFirst({
      where: { code: def.code, version: 1 },
      select: { id: true },
    });
    const definition =
      existing ??
      (await prisma.workflowDefinition.create({
        data: {
          code: def.code,
          name: def.name,
          applicationType: type as ApplicationType,
          version: 1,
          isActive: true,
          description: `Default routing for ${def.name}. Stage names and SLA days are illustrative; update from the Approval Process Handbook.`,
        },
        select: { id: true },
      }));

    if (existing) {
      created[type] = existing.id;
      continue;
    }

    const stageIds: Record<string, string> = {};
    for (const [index, stage] of def.stages.entries()) {
      const row = await prisma.workflowStage.create({
        data: {
          definitionId: definition.id,
          code: stage.code,
          name: stage.name,
          sequence: index,
          slaWorkingDays: stage.sla,
          isInitial: Boolean(stage.initial),
          isTerminal: Boolean(stage.terminal),
          assigneeRole: stage.role,
          description: stage.description ?? null,
        },
        select: { id: true },
      });
      stageIds[stage.code] = row.id;
    }

    for (const edge of def.edges) {
      await prisma.workflowTransition.create({
        data: {
          fromStageId: stageIds[edge.from],
          toStageId: stageIds[edge.to],
          action: edge.action as never,
          requiredRole: edge.role,
          requiresRemark: Boolean(edge.remark),
          label: edge.label ?? null,
        },
      });
    }
    created[type] = definition.id;
    console.log(`  workflow ${def.code} v1 created`);
  }
  return created;
}

async function seedHolidays(regionIds: Record<string, string>) {
  const year = new Date().getFullYear();
  const national = [
    { date: `${year}-01-26`, label: "Republic Day" },
    { date: `${year}-08-15`, label: "Independence Day" },
    { date: `${year}-10-02`, label: "Gandhi Jayanti" },
    { date: `${year}-12-25`, label: "Christmas" },
    { date: `${year}-11-01`, label: "Kannada Rajyotsava" },
  ];
  for (const h of national) {
    const date = new Date(h.date);
    // Postgres treats NULLs as distinct in unique indexes, so national
    // holidays (regionId null) are matched explicitly rather than upserted.
    const existing = await prisma.holiday.findFirst({ where: { date, regionId: null } });
    if (existing) {
      await prisma.holiday.update({ where: { id: existing.id }, data: { label: h.label } });
    } else {
      await prisma.holiday.create({ data: { date, label: h.label } });
    }
  }
  const regional = [
    { region: "SOUTH", date: `${year}-04-14`, label: "Tamil New Year / Vishu" },
    { region: "SOUTH", date: `${year}-01-15`, label: "Pongal" },
    { region: "WEST", date: `${year}-03-30`, label: "Gudi Padwa" },
    { region: "EAST", date: `${year}-04-15`, label: "Poila Boishakh" },
    { region: "NORTH", date: `${year}-03-14`, label: "Holi (regional)" },
  ];
  for (const h of regional) {
    const regionId = regionIds[h.region];
    if (!regionId) continue;
    await prisma.holiday.upsert({
      where: { date_regionId: { date: new Date(h.date), regionId } },
      update: { label: h.label },
      create: { date: new Date(h.date), regionId, label: h.label },
    });
  }
}

async function seedEscalationPolicies() {
  const ladder = [
    { level: 1, afterWorkingDays: 3, targetRole: "REGIONAL_OFFICER" as Role, description: "First reminder to the case owner" },
    { level: 2, afterWorkingDays: 7, targetRole: "BUREAU_OFFICER" as Role, description: "Escalate to the bureau supervisor" },
    { level: 3, afterWorkingDays: 15, targetRole: "COMPETENT_AUTHORITY" as Role, description: "Escalate to the competent authority" },
  ];
  for (const p of ladder) {
    const existing = await prisma.escalationPolicy.findFirst({
      where: { scope: null, regionId: null, level: p.level },
    });
    if (existing) {
      await prisma.escalationPolicy.update({ where: { id: existing.id }, data: p });
    } else {
      await prisma.escalationPolicy.create({
        data: { scope: null, regionId: null, channel: "IN_APP", isActive: true, ...p },
      });
    }
  }
}

async function main() {
  console.log("Seeding AICTE platform...");

  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD ?? "Admin@123", 12);

  // Regions
  const regionIds: Record<string, string> = {};
  for (const r of REGIONS) {
    const row = await prisma.region.upsert({
      where: { code: r.code },
      update: { name: r.name },
      create: { code: r.code, name: r.name },
    });
    regionIds[r.code] = row.id;
  }
  console.log(`  ${REGIONS.length} regions`);

  // Institutions
  const institutionIds: Record<string, string> = {};
  for (const inst of INSTITUTIONS) {
    const row = await prisma.institution.upsert({
      where: { aicteId: inst.aicteId },
      update: { name: inst.name, regionId: regionIds[inst.region] },
      create: {
        aicteId: inst.aicteId,
        name: inst.name,
        state: inst.state,
        district: inst.district,
        city: inst.city,
        regionId: regionIds[inst.region],
        contactEmail: `principal@${inst.aicteId.replace(/[^0-9]/g, "")}.edu.in`,
      },
    });
    institutionIds[inst.aicteId] = row.id;
  }
  console.log(`  ${INSTITUTIONS.length} institutions`);

  // Workflows
  await seedWorkflows();
  console.log("  workflows with stages and transitions");

  // Holidays + escalation
  await seedHolidays(regionIds);
  await seedEscalationPolicies();
  console.log("  holidays and escalation policies");

  // Users: one per role, plus extras for realism
  const users: { email: string; name: string; role: Role; region?: string; institution?: string; designation: string }[] = [
    { email: process.env.ADMIN_EMAIL ?? "admin@gmail.com", name: "System Administrator", role: "SYSTEM_ADMIN", designation: "Platform Administrator" },
    { email: "institution@sri.edu.in", name: "Dr. Ramesh Kumar", role: "INSTITUTION_ADMIN", institution: "1-10000001", designation: "Principal" },
    { email: "institution@coimbatore.edu.in", name: "Dr. Lakshmi Narayanan", role: "INSTITUTION_ADMIN", institution: "1-10000002", designation: "Principal" },
    { email: "institution@sahyadri.edu.in", name: "Dr. Anil Deshmukh", role: "INSTITUTION_ADMIN", institution: "1-10000004", designation: "Principal" },
    { email: "ro.south@aicte.gov.in", name: "Suresh Menon", role: "REGIONAL_OFFICER", region: "SOUTH", designation: "Regional Officer" },
    { email: "ro.west@aicte.gov.in", name: "Priya Kulkarni", role: "REGIONAL_OFFICER", region: "WEST", designation: "Regional Officer" },
    { email: "ro.north@aicte.gov.in", name: "Vikram Singh", role: "REGIONAL_OFFICER", region: "NORTH", designation: "Regional Officer" },
    { email: "bureau.south@aicte.gov.in", name: "Meera Iyer", role: "BUREAU_OFFICER", region: "SOUTH", designation: "Bureau Officer" },
    { email: "bureau.west@aicte.gov.in", name: "Rahul Joshi", role: "BUREAU_OFFICER", region: "WEST", designation: "Bureau Officer" },
    { email: "evc.member1@aicte.gov.in", name: "Prof. Anand Krishnan", role: "EVC_MEMBER", region: "SOUTH", designation: "EVC Member" },
    { email: "evc.member2@aicte.gov.in", name: "Prof. Sanjay Verma", role: "EVC_MEMBER", region: "WEST", designation: "EVC Member" },
    { email: "authority@aicte.gov.in", name: "Dr. Nirmala Rao", role: "COMPETENT_AUTHORITY", designation: "Competent Authority" },
    { email: "auditor@aicte.gov.in", name: "K. Balasubramanian", role: "AUDITOR", designation: "Internal Auditor" },
  ];

  const userIds: Record<string, string> = {};
  for (const u of users) {
    const row = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        regionId: u.region ? regionIds[u.region] : null,
        institutionId: u.institution ? institutionIds[u.institution] : null,
        designation: u.designation,
        isActive: true,
      },
      create: {
        email: u.email,
        name: u.name,
        passwordHash,
        role: u.role,
        regionId: u.region ? regionIds[u.region] : null,
        institutionId: u.institution ? institutionIds[u.institution] : null,
        designation: u.designation,
        isActive: true,
      },
    });
    userIds[u.email] = row.id;
  }
  console.log(`  ${users.length} users (password: ${process.env.ADMIN_PASSWORD ?? "Admin@123"})`);

  // Demo applications spread across stages and SLA states
  const existingApps = await prisma.application.count();
  if (existingApps === 0) {
    const demo = [
      { type: "NEW_ENGINEERING" as ApplicationType, inst: "1-10000001", title: "New B.Tech Programme Approval 2026-27", stage: "SCRUTINY", ageDays: 4, status: "IN_PROCESS" as const },
      { type: "INCREASE_IN_INTAKE" as ApplicationType, inst: "1-10000002", title: "Intake increase CSE 60 to 120", stage: "EVC", ageDays: 12, status: "SCHEDULED_EVC" as const },
      { type: "EXTENSION_OF_APPROVAL" as ApplicationType, inst: "1-10000003", title: "Extension of Approval 2026-27", stage: "CLARIFICATION", ageDays: 6, status: "RETURNED_FOR_CLARIFICATION" as const },
      { type: "NEW_COURSE" as ApplicationType, inst: "1-10000004", title: "New M.Tech in Data Science", stage: "BUREAU_REVIEW", ageDays: 9, status: "IN_PROCESS" as const },
      { type: "NEW_ENGINEERING" as ApplicationType, inst: "1-10000005", title: "New Engineering College Establishment", stage: "DECISION", ageDays: 18, status: "PENDING_DECISION" as const },
      { type: "EXTENSION_OF_APPROVAL" as ApplicationType, inst: "1-10000006", title: "Extension of Approval - Phase II", stage: "SCRUTINY", ageDays: 14, status: "IN_PROCESS" as const },
      { type: "INCREASE_IN_INTAKE" as ApplicationType, inst: "1-10000007", title: "Intake increase ECE 30 to 60", stage: "SUBMITTED", ageDays: 1, status: "SUBMITTED" as const },
      { type: "CLOSURE" as ApplicationType, inst: "1-10000008", title: "Voluntary closure of Civil Engineering", stage: "DECISION", ageDays: 22, status: "PENDING_DECISION" as const },
    ];

    const year = new Date().getFullYear();
    let seq = 1;
    const holidays = await prisma.holiday.findMany({ select: { date: true, regionId: true } });

    for (const d of demo) {
      const institution = await prisma.institution.findUnique({ where: { id: institutionIds[d.inst] } });
      if (!institution) continue;
      const definition = await prisma.workflowDefinition.findFirst({
        where: { applicationType: d.type, isActive: true },
        include: { stages: true },
      });
      if (!definition) continue;
      const stage = definition.stages.find((s) => s.code === d.stage) ?? definition.stages.find((s) => s.isInitial);
      if (!stage) continue;

      const enteredAt = new Date(Date.now() - d.ageDays * 86400000);
      const submittedAt = new Date(Date.now() - (d.ageDays + 2) * 86400000);
      const dueAt = new Date(enteredAt.getTime() + stage.slaWorkingDays * 86400000);
      const overdue = dueAt < new Date();
      const nearDue = !overdue && dueAt.getTime() - Date.now() < 3 * 86400000;

      const app = await prisma.application.create({
        data: {
          appNo: `APP-${year}-${String(seq).padStart(6, "0")}`,
          type: d.type,
          title: d.title,
          summary: `Submitted by ${institution.name} for the 2026-27 academic cycle.`,
          institutionId: institution.id,
          regionId: institution.regionId,
          workflowVersionId: definition.id,
          currentStageId: stage.id,
          status: d.status,
          submittedAt,
          slaDueAt: dueAt,
          slaState: overdue ? "OVERDUE" : nearDue ? "DUE_SOON" : "ON_TRACK",
        },
      });
      seq += 1;

      await prisma.applicationStageHistory.create({
        data: {
          applicationId: app.id,
          stageId: stage.id,
          action: "SUBMIT",
          actorRole: "INSTITUTION_ADMIN",
          remark: "Application submitted with supporting documents.",
          enteredAt,
        },
      });

      const ownerRole = stage.assigneeRole;
      const owner = await prisma.user.findFirst({
        where: {
          role: ownerRole,
          isActive: true,
          ...(ownerRole === "INSTITUTION_ADMIN"
            ? { institutionId: institution.id }
            : { regionId: institution.regionId }),
        },
      });
      if (owner) {
        await prisma.assignment.create({
          data: { applicationId: app.id, userId: owner.id, stageId: stage.id, note: "Seeded assignment" },
        });
      }
      if (d.status === "RETURNED_FOR_CLARIFICATION") {
        await prisma.clarificationRequest.create({
          data: {
            applicationId: app.id,
            stageId: stage.id,
            raisedById: userIds["ro.south@aicte.gov.in"],
            reason: "Faculty list does not match the submitted intake; please upload the revised list with credentials.",
            dueAt: new Date(Date.now() + 5 * 86400000),
            status: "OPEN",
          },
        });
      }
    }

    // Undertakings for compliance tracking
    const undertakings = [
      { inst: "1-10000001", title: "Submit annual audited financial statement", dueInDays: 12 },
      { inst: "1-10000002", title: "Faculty retention report for increased intake", dueInDays: 4 },
      { inst: "1-10000004", title: "Laboratory equipment procurement evidence", dueInDays: -3 },
    ];
    for (const u of undertakings) {
      const instId = institutionIds[u.inst];
      if (!instId) continue;
      await prisma.undertaking.create({
        data: {
          institutionId: instId,
          title: u.title,
          description: "Seeded compliance obligation for demonstration.",
          dueAt: new Date(Date.now() + u.dueInDays * 86400000),
          status: u.dueInDays < 0 ? "OVERDUE" : "OPEN",
        },
      });
    }
    console.log(`  ${demo.length} demo applications and ${undertakings.length} undertakings`);
  } else {
    console.log(`  applications already present (${existingApps}); skipped demo data`);
  }

  // Worker heartbeat rows so the dashboard has something to show
  for (const job of ["sla-scan", "escalation-scan", "notification-dispatch", "evc-reminders", "document-expiry", "undertaking-scan"]) {
    await prisma.workerHeartbeat.upsert({
      where: { job },
      update: {},
      create: { job, status: "PENDING", detail: "Not yet run" },
    });
  }

  // Seed the audit chain with a genesis entry. It uses the same hashing helper
  // as every later write, so the chain verifies from the very first row.
  const auditCount = await prisma.auditLog.count();
  if (auditCount === 0) {
    const createdAt = new Date();
    const payload = {
      actorId: null,
      actorEmail: "system@aicte.gov.in",
      action: "SEED",
      entityType: "System",
      entityId: null,
      before: null,
      after: { note: "Initial platform seed" },
      createdAt,
    };
    await prisma.auditLog.create({
      data: {
        actorId: null,
        actorEmail: payload.actorEmail,
        action: payload.action,
        entityType: payload.entityType,
        entityId: null,
        after: payload.after,
        prevHash: GENESIS_HASH,
        hash: computeEntryHash(payload, GENESIS_HASH),
        createdAt,
      },
    });
  }

  const counts = {
    regions: await prisma.region.count(),
    institutions: await prisma.institution.count(),
    users: await prisma.user.count(),
    workflows: await prisma.workflowDefinition.count(),
    stages: await prisma.workflowStage.count(),
    transitions: await prisma.workflowTransition.count(),
    applications: await prisma.application.count(),
    holidays: await prisma.holiday.count(),
    escalationPolicies: await prisma.escalationPolicy.count(),
  };
  console.log("\nSeed complete:");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(20)} ${v}`);
  console.log(`\nLogin with any seeded user. Password: ${process.env.ADMIN_PASSWORD ?? "Admin@123"}`);
  console.log(`Admin: ${process.env.ADMIN_EMAIL ?? "admin@gmail.com"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
