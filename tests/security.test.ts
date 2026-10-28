import { describe, expect, it } from "vitest";
import { DEFAULT_LANDING, safeNextPath } from "@/lib/auth/redirect";
import { escapeHtml } from "@/lib/notifications/html";

describe("safeNextPath", () => {
  it("keeps ordinary same-site paths", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/applications/123")).toBe("/applications/123");
    expect(safeNextPath("/reports?sort=due")).toBe("/reports?sort=due");
  });

  it("falls back when no path is supplied", () => {
    expect(safeNextPath(null)).toBe(DEFAULT_LANDING);
    expect(safeNextPath(undefined)).toBe(DEFAULT_LANDING);
    expect(safeNextPath("")).toBe(DEFAULT_LANDING);
  });

  it("rejects absolute URLs", () => {
    expect(safeNextPath("https://evil.example.com")).toBe(DEFAULT_LANDING);
    expect(safeNextPath("http://evil.example.com/x")).toBe(DEFAULT_LANDING);
    expect(safeNextPath("javascript:alert(1)")).toBe(DEFAULT_LANDING);
  });

  it("rejects protocol-relative and backslash tricks", () => {
    expect(safeNextPath("//evil.example.com")).toBe(DEFAULT_LANDING);
    expect(safeNextPath("/\\evil.example.com")).toBe(DEFAULT_LANDING);
    expect(safeNextPath("/path\\to\\thing")).toBe(DEFAULT_LANDING);
    expect(safeNextPath("/x://evil.example.com")).toBe(DEFAULT_LANDING);
  });
});

describe("escapeHtml", () => {
  it("neutralises markup in interpolated values", () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(escapeHtml('" onmouseover="x')).toBe("&quot; onmouseover=&quot;x");
    expect(escapeHtml("a & b")).toBe("a &amp; b");
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Application APP-2026-000001 is overdue")).toBe(
      "Application APP-2026-000001 is overdue",
    );
  });
});
