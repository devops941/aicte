import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { SLA_LABELS, STATUS_LABELS, TYPE_LABELS } from "@/lib/constants";
import { Badge, SLA_TONE, STATUS_TONE } from "@/components/ui/badge";
import { formatDate, humanise } from "@/lib/utils";

export const metadata: Metadata = { title: "Verify application" };

/**
 * Public verification page. It deliberately shows only what is needed to
 * confirm that a printed reference is genuine: no remarks, no documents, no
 * personal data. Everything else stays behind authentication.
 */
export default async function VerifyPage({ params }: { params: Promise<{ appNo: string }> }) {
  const { appNo } = await params;

  const application = await prisma.application.findUnique({
    where: { appNo: decodeURIComponent(appNo) },
    select: {
      appNo: true,
      title: true,
      type: true,
      status: true,
      slaState: true,
      submittedAt: true,
      currentStage: { select: { name: true } },
      institution: { select: { name: true, state: true } },
    },
  });

  if (!application) notFound();

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-lg animate-fade-up">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-lg font-bold text-white shadow-glow">
            A
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">AICTE Approval Portal</p>
            <p className="text-[11px] text-muted">Reference verification</p>
          </div>
        </div>

        <div className="card card-pad">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ok/10 text-ok">
              <CheckCircle2 className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">This reference is genuine</p>
              <p className="text-[11px] text-muted">Issued by the AICTE approval workflow platform</p>
            </div>
          </div>

          <dl className="mt-5 space-y-3">
            <Row label="Application number" value={<span className="font-mono text-brand">{application.appNo}</span>} />
            <Row label="Title" value={application.title} />
            <Row label="Type" value={TYPE_LABELS[application.type] ?? application.type} />
            <Row label="Institution" value={`${application.institution.name}, ${application.institution.state}`} />
            <Row label="Submitted" value={formatDate(application.submittedAt)} />
            <Row
              label="Current stage"
              value={
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted" />
                  {application.currentStage?.name ?? "Not yet routed"}
                </span>
              }
            />
            <Row
              label="Status"
              value={
                <span className="flex flex-wrap gap-1.5">
                  <Badge tone={STATUS_TONE[application.status] ?? "neutral"}>
                    {STATUS_LABELS[application.status] ?? application.status}
                  </Badge>
                  <Badge tone={SLA_TONE[application.slaState] ?? "neutral"}>
                    {SLA_LABELS[application.slaState] ?? humanise(application.slaState)}
                  </Badge>
                </span>
              }
            />
          </dl>

          <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-line bg-canvas px-3.5 py-3">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
            <p className="text-[11px] leading-relaxed text-muted">
              This page confirms that the application number exists and shows its current position. It shows no
              remarks, documents or personal details. An approval decision is valid only when issued by the
              competent authority.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}
