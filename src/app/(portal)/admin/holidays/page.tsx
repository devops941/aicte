import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { requirePageActor } from "@/lib/auth/session";
import { holidaysList, regionOptions } from "@/lib/queries";
import { can } from "@/lib/auth/rbac";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { HolidayForm } from "@/components/holiday-form";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Holidays" };

export default async function HolidaysPage() {
  const actor = await requirePageActor();
  if (!can(actor.role, "admin:config")) redirect("/dashboard");

  const [holidays, regions] = await Promise.all([holidaysList(), regionOptions()]);
  const year = new Date().getFullYear();

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Holiday calendar"
        description="The SLA clock counts working days, so every date listed here is skipped when a deadline is computed."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title={`${holidays.length} date(s)`} subtitle={`National and regional holidays, ${year} and beyond`} />
            <div className="table-wrap border-0">
              <table className="w-full">
                <thead className="bg-canvas">
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Occasion</th>
                    <th className="th">Applies to</th>
                  </tr>
                </thead>
                <tbody>
                  {holidays.map((h) => (
                    <tr key={h.id} className="transition-colors hover:bg-canvas">
                      <td className="td font-medium text-ink">{formatDate(h.date)}</td>
                      <td className="td text-ink">{h.label}</td>
                      <td className="td">
                        {h.region ? <Badge tone="info">{h.region.name}</Badge> : <Badge tone="neutral">National</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <HolidayForm regions={regions} />
      </div>
    </div>
  );
}
