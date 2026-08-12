import { LeadStatus, Prisma } from "@prisma/client";
import Link from "next/link";

import { LeadCard } from "@/components/LeadCard";
import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const status =
    typeof params.status === "string" && Object.keys(LEAD_STATUS_LABELS).includes(params.status)
      ? (params.status as LeadStatus)
      : undefined;

  const where: Prisma.LeadWhereInput = {
    status,
    OR: q
      ? [
          { title: { contains: q } },
          { notes: { contains: q } },
          { contact: { is: { firstName: { contains: q } } } },
          { contact: { is: { lastName: { contains: q } } } },
          { contact: { is: { company: { contains: q } } } },
          { campaign: { is: { name: { contains: q } } } },
        ]
      : undefined,
  };

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      contact: {
        select: { firstName: true, lastName: true, company: true },
      },
      campaign: { select: { name: true } },
      assignedTo: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Leads</h1>
          <p className="mt-2 text-sm text-slate-500">
            Filter, inspect, and progress potential customers through the marketing pipeline.
          </p>
        </div>
        <Link
          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
          href="/dashboard/leads/new"
        >
          New lead
        </Link>
      </div>

      <form className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-[2fr,1fr,auto]">
        <input
          className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring"
          defaultValue={q}
          name="q"
          placeholder="Search title, contact, company, or campaign"
        />
        <select
          className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring"
          defaultValue={status ?? ""}
          name="status"
        >
          <option value="">All statuses</option>
          {LEAD_STATUS_ORDER.map((entry) => (
            <option key={entry} value={entry}>
              {LEAD_STATUS_LABELS[entry]}
            </option>
          ))}
        </select>
        <button
          className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          type="submit"
        >
          Apply filters
        </button>
      </form>

      <div className="grid gap-4 xl:grid-cols-2">
        {leads.length > 0 ? (
          leads.map((lead) => <LeadCard key={lead.id} lead={lead} />)
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500 xl:col-span-2">
            No leads match your filters yet.
          </div>
        )}
      </div>
    </div>
  );
}
