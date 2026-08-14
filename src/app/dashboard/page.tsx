import { LifecycleStage } from "@prisma/client";
import Link from "next/link";

import { CustomerCard } from "@/components/CustomerCard";
import {
  CLOSED_STAGES,
  LIFECYCLE_STAGE_LABELS,
  LIFECYCLE_STAGE_ORDER,
  OPEN_FUNNEL_STAGES,
} from "@/lib/constants";
import { addDays, decimalToNumber, formatCurrency } from "@/lib/lifecycle";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const trialWarningCutoff = addDays(now, 7);

  const [
    totalCustomers,
    payingCustomers,
    activeTrials,
    trialsEndingSoon,
    groupedStages,
    payingMrr,
    openTasks,
    recentCustomers,
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.customer.count({ where: { stage: LifecycleStage.CUSTOMER_ACTIVE_700 } }),
    prisma.customer.count({ where: { stage: LifecycleStage.TRIAL_ACTIVE_500 } }),
    prisma.customer.findMany({
      where: {
        stage: LifecycleStage.TRIAL_ACTIVE_500,
        trialEndsAt: { lte: trialWarningCutoff },
      },
      orderBy: { trialEndsAt: "asc" },
      take: 8,
      select: {
        id: true,
        companyName: true,
        trialEndsAt: true,
        assignedTo: { select: { name: true } },
      },
    }),
    prisma.customer.groupBy({
      by: ["stage"],
      _count: { stage: true },
    }),
    prisma.customer.aggregate({
      where: { stage: LifecycleStage.CUSTOMER_ACTIVE_700 },
      _sum: { mrr: true },
    }),
    prisma.task.count({ where: { done: false } }),
    prisma.customer.findMany({
      take: 5,
      orderBy: { updatedAt: "desc" },
      include: {
        assignedTo: { select: { name: true } },
        campaign: { select: { name: true } },
        integrations: { select: { channel: true } },
      },
    }),
  ]);

  const stageMap = new Map(groupedStages.map((entry) => [entry.stage, entry._count.stage]));
  const openFunnel = OPEN_FUNNEL_STAGES.reduce((sum, stage) => sum + (stageMap.get(stage) ?? 0), 0);
  const churned = CLOSED_STAGES.reduce((sum, stage) => sum + (stageMap.get(stage) ?? 0), 0);
  const mrrTotal = decimalToNumber(payingMrr._sum.mrr);

  const stats = [
    { label: "Customers tracked", value: totalCustomers.toLocaleString() },
    { label: "Paying customers", value: payingCustomers.toLocaleString() },
    { label: "Active trials", value: activeTrials.toLocaleString() },
    { label: "Open funnel", value: openFunnel.toLocaleString() },
    { label: "Recurring revenue", value: formatCurrency(mrrTotal ?? 0) },
    { label: "Open follow-ups", value: openTasks.toLocaleString() },
  ];

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 rounded-3xl bg-slate-950 px-6 py-8 text-white shadow-xl sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">Overview</p>
          <h1 className="mt-3 text-3xl font-bold">SaleVali customer acquisition</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Track the merchants using — or evaluating — SaleVali, keep trials from expiring
            unattended, and coordinate marketing follow-up in one place.
          </p>
        </div>
        <Link
          className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          href="/dashboard/customers/new"
        >
          Add customer
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{stat.label}</p>
            <p className="mt-4 text-4xl font-bold text-slate-900">{stat.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr,1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Lifecycle funnel</h2>
            <Link className="text-sm font-semibold text-emerald-600 hover:text-emerald-500" href="/dashboard/customers">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {LIFECYCLE_STAGE_ORDER.map((stage) => (
              <div key={stage} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-sm font-medium text-slate-700">{LIFECYCLE_STAGE_LABELS[stage]}</span>
                <span className="text-sm font-semibold text-slate-900">{stageMap.get(stage) ?? 0}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">
            {churned} customer{churned === 1 ? "" : "s"} closed out (churned, lost, or disqualified).
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Trials ending within 7 days</h2>
          <p className="mt-1 text-sm text-slate-500">
            SaleVali trials run 30 days with no automatic renewal — these need a decision.
          </p>
          <div className="mt-4 space-y-3">
            {trialsEndingSoon.length > 0 ? (
              trialsEndingSoon.map((customer) => (
                <Link
                  key={customer.id}
                  className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 transition hover:border-amber-300"
                  href={`/dashboard/customers/${customer.id}`}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{customer.companyName}</p>
                    <p className="text-xs text-slate-500">
                      Owner: {customer.assignedTo?.name ?? "Unassigned"}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-amber-700">
                    {customer.trialEndsAt ? customer.trialEndsAt.toLocaleDateString() : "No end date"}
                  </span>
                </Link>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                No trials are expiring in the next 7 days.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Recently updated customers</h2>
          <Link className="text-sm font-semibold text-emerald-600 hover:text-emerald-500" href="/dashboard/customers/new">
            Add customer
          </Link>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {recentCustomers.length > 0 ? (
            recentCustomers.map((customer) => <CustomerCard key={customer.id} customer={customer} />)
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500 xl:col-span-2">
              No customers yet. Add the first merchant to start tracking the funnel.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
