import { describe, expect, it } from "vitest";
import { csvCell, csvWithBom, toCsv } from "@/lib/csv";
import { looksLikeText, sniffMimeType, verifyUpload } from "@/lib/storage/signature";
import { validateSetting, parseSetting, SETTINGS_BY_KEY } from "@/lib/settings";
import { can, permissionsFor } from "@/lib/auth/rbac";
import {
  escalationPolicySchema,
  holidayCreateSchema,
  institutionCreateSchema,
  maintenanceActionSchema,
  userCreateSchema,
  userUpdateSchema,
} from "@/lib/admin-schemas";

describe("CSV export escaping", () => {
  it("quotes values containing commas, quotes or newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralises spreadsheet formula injection", () => {
    // Each of these would otherwise be evaluated by Excel or LibreOffice.
    expect(csvCell("=HYPERLINK(\"http://evil\",\"click\")")).toBe(
      '"\'=HYPERLINK(""http://evil"",""click"")"',
    );
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tpayload")).toBe("'\tpayload");
    expect(csvCell("\rpayload")).toBe('"\'\rpayload"');
  });

  it("leaves ordinary values untouched", () => {
    expect(csvCell("APP-2026-000001")).toBe("APP-2026-000001");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("joins rows with CRLF and prefixes a UTF-8 BOM", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe("a,b\r\nc,d");
    expect(csvWithBom("a,b")).toBe("\uFEFFa,b");
  });
});

describe("upload content sniffing", () => {
  const pdf = Buffer.from("%PDF-1.7\n...");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
  const text = Buffer.from("name,value\nalpha,1\n");
  // A Windows executable renamed to .pdf and declared as application/pdf.
  const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]);

  it("identifies real formats from their bytes", () => {
    expect(sniffMimeType(pdf)).toBe("application/pdf");
    expect(sniffMimeType(png)).toBe("image/png");
    expect(sniffMimeType(jpeg)).toBe("image/jpeg");
    expect(sniffMimeType(zip)).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });

  it("accepts a file whose bytes match its declared type", () => {
    expect(verifyUpload(pdf, "application/pdf")).toEqual({ ok: true });
    expect(verifyUpload(png, "image/png")).toEqual({ ok: true });
  });

  it("rejects a mislabelled file even when the MIME type claims otherwise", () => {
    const result = verifyUpload(exe, "application/pdf");
    expect(result.ok).toBe(false);
  });

  it("rejects a real PDF submitted as a PNG", () => {
    expect(verifyUpload(pdf, "image/png").ok).toBe(false);
  });

  it("treats a ZIP-based Office document as either OOXML type", () => {
    expect(verifyUpload(zip, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toEqual({ ok: true });
  });

  it("accepts CSV only when it is really text", () => {
    expect(looksLikeText(text)).toBe(true);
    expect(verifyUpload(text, "text/csv")).toEqual({ ok: true });
    // Binary content declared as CSV must be refused.
    expect(verifyUpload(exe, "text/csv").ok).toBe(false);
  });

  it("rejects empty uploads", () => {
    expect(verifyUpload(Buffer.alloc(0), "application/pdf").ok).toBe(false);
  });
});

describe("settings validation", () => {
  const threshold = SETTINGS_BY_KEY.get("SLA_DUE_SOON_PERCENT")!;
  const provider = SETTINGS_BY_KEY.get("AI_PROVIDER")!;
  const flag = SETTINGS_BY_KEY.get("NOTIFY_EMAIL_ENABLED")!;

  it("enforces numeric bounds", () => {
    expect(validateSetting(threshold, "80")).toBeNull();
    expect(validateSetting(threshold, "5")).toMatch(/at least/);
    expect(validateSetting(threshold, "500")).toMatch(/at most/);
    expect(validateSetting(threshold, "abc")).toMatch(/number/);
  });

  it("enforces enum membership", () => {
    expect(validateSetting(provider, "rules")).toBeNull();
    expect(validateSetting(provider, "openai")).toBeNull();
    expect(validateSetting(provider, "skynet")).toMatch(/must be one of/);
  });

  it("enforces booleans", () => {
    expect(validateSetting(flag, "true")).toBeNull();
    expect(validateSetting(flag, "false")).toBeNull();
    expect(validateSetting(flag, "yes")).toMatch(/true or false/);
  });

  it("parses stored strings into declared types and falls back to defaults", () => {
    expect(parseSetting(threshold, undefined)).toBe(80);
    expect(parseSetting(threshold, "90")).toBe(90);
    expect(parseSetting(flag, undefined)).toBe(true);
    expect(parseSetting(flag, "false")).toBe(false);
    expect(parseSetting(provider, "nonsense")).toBe("nonsense");
  });

  it("marks SMTP password as secret", () => {
    expect(SETTINGS_BY_KEY.get("SMTP_PASS")!.secret).toBe(true);
  });
});

describe("super admin separation of duties", () => {
  it("grants a Super Admin platform maintenance", () => {
    expect(can("SUPER_ADMIN", "system:maintain")).toBe(true);
    expect(can("SYSTEM_ADMIN", "system:maintain")).toBe(false);
  });

  it("does not let a Super Admin perform statutory case acts", () => {
    const perms = permissionsFor("SUPER_ADMIN");
    expect(perms).not.toContain("workflow:transition");
    expect(perms).not.toContain("decision:record");
    expect(perms).not.toContain("clarification:raise");
  });

  it("lets a Super Admin administer users and configuration", () => {
    expect(can("SUPER_ADMIN", "admin:users")).toBe(true);
    expect(can("SUPER_ADMIN", "admin:config")).toBe(true);
    expect(can("SUPER_ADMIN", "workflow:configure")).toBe(true);
  });
});

describe("admin payload schemas reject unknown fields", () => {
  // Zod strips unknown keys by default, which would answer 200 to a write that
  // silently did nothing. These schemas are strict so the caller is told.

  it("rejects an unknown field on a user create", () => {
    const base = { email: "a@b.gov.in", name: "A B", role: "AUDITOR", password: "secret123" };
    expect(userCreateSchema.safeParse(base).success).toBe(true);
    expect(userCreateSchema.safeParse({ ...base, isActive: true }).success).toBe(false);
    expect(userCreateSchema.safeParse({ ...base, isActiv: true }).success).toBe(false);
  });

  it("rejects an unknown field on a user update", () => {
    const id = "3f1c2b4a-1d2e-4f6a-8b9c-0d1e2f3a4b5c";
    expect(userUpdateSchema.safeParse({ id, isActive: false }).success).toBe(true);
    expect(userUpdateSchema.safeParse({ id, isActive: false, email: "x@y.gov.in" }).success).toBe(false);
  });

  it("rejects an unknown field on an institution, holiday and escalation", () => {
    const regionId = "3f1c2b4a-1d2e-4f6a-8b9c-0d1e2f3a4b5c";
    expect(
      institutionCreateSchema.safeParse({ aicteId: "1-1", name: "Inst", state: "Goa", regionId }).success,
    ).toBe(true);
    expect(
      institutionCreateSchema.safeParse({ aicteId: "1-1", name: "Inst", state: "Goa", regionId, kind: "x" })
        .success,
    ).toBe(false);

    expect(holidayCreateSchema.safeParse({ date: "2026-12-25", label: "Holiday" }).success).toBe(true);
    expect(holidayCreateSchema.safeParse({ date: "2026-12-25", label: "Holiday", kind: "PUBLIC" }).success).toBe(
      false,
    );

    const policy = { level: 1, afterWorkingDays: 3, targetRole: "REGIONAL_OFFICER", channel: "IN_APP" };
    expect(escalationPolicySchema.safeParse(policy).success).toBe(true);
    expect(escalationPolicySchema.safeParse({ ...policy, priority: 5 }).success).toBe(false);
  });

  it("rejects an unknown maintenance action", () => {
    expect(maintenanceActionSchema.safeParse({ action: "verify-chain" }).success).toBe(true);
    expect(maintenanceActionSchema.safeParse({ action: "drop-tables" }).success).toBe(false);
    expect(maintenanceActionSchema.safeParse({ action: "verify-chain", force: true }).success).toBe(false);
  });
});
