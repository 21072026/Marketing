import { CampaignStatus } from "@prisma/client";
import Link from "next/link";

import { LeadCard } from "@/components/LeadCard";
import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [totalLeads, activeCampaigns, groupedStatuses, recentLeads] = await Promise.all([
    prisma.lead.count(),
    prisma.campaign.count({ where: { status: CampaignStatus.ACTIVE } }),
    prisma.lead.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
    prisma.lead.findMany({
      take: 5,
      orderBy: { updatedAt: "desc" },
      include: {
        contact: {
          select: { firstName: true, lastName: true, company: true },
        },
        campaign: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
    }),
  ]);

  const statusMap = new Map(groupedStatuses.map((entry) => [entry.status, entry._count.status]));

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 rounded-3xl bg-slate-950 px-6 py-8 text-white shadow-xl sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">Overview</p>
          <h1 className="mt-3 text-3xl font-bold">Marketing pipeline at a glance</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Track new demand, keep campaigns moving, and coordinate outreach from one shared CRM.
          </p>
        </div>
        <Link
          className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          href="/dashboard/leads/new"
        >
          Add new lead
        </Link>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Total leads</p>
          <p className="mt-4 text-4xl font-bold text-slate-900">{totalLeads}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Active campaigns</p>
          <p className="mt-4 text-4xl font-bold text-slate-900">{activeCampaigns}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Closed pipeline</p>
          <p className="mt-4 text-4xl font-bold text-slate-900">
            {(statusMap.get("LEAD_WON_600") ?? 0) + (statusMap.get("LEAD_LOST_700") ?? 0)}
          </p>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr,1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Leads by status</h2>
            <Link className="text-sm font-semibold text-emerald-600 hover:text-emerald-500" href="/dashboard/leads">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {LEAD_STATUS_ORDER.map((status) => (
              <div key={status} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-sm font-medium text-slate-700">{LEAD_STATUS_LABELS[status]}</span>
                <span className="text-sm font-semibold text-slate-900">{statusMap.get(status) ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Recently updated leads</h2>
            <Link className="text-sm font-semibold text-emerald-600 hover:text-emerald-500" href="/dashboard/leads/new">
              Create lead
            </Link>
          </div>
          <div className="space-y-3">
            {recentLeads.length > 0 ? (
              recentLeads.map((lead) => <LeadCard key={lead.id} lead={lead} />)
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                No leads yet. Create your first lead to start tracking the pipeline.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
