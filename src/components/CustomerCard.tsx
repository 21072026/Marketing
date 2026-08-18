import { IntegrationChannel, LifecycleStage, PricingModel } from "@prisma/client";
import Link from "next/link";

import { LifecycleStageBadge } from "@/components/LifecycleStageBadge";
import { INTEGRATION_CHANNEL_LABELS, PRICING_MODEL_LABELS } from "@/lib/constants";
import { daysUntil, estimateMonthlyRevenue, formatCurrency } from "@/lib/lifecycle";

type CustomerCardProps = {
  customer: {
    id: string;
    companyName: string;
    city: string | null;
    country: string;
    stage: LifecycleStage;
    pricingModel: PricingModel;
    monthlyTransactions: number | null;
    mrr: { toString(): string } | null;
    currency: string;
    trialEndsAt: Date | null;
    updatedAt: Date;
    assignedTo: { name: string } | null;
    campaign: { name: string } | null;
    integrations: { channel: IntegrationChannel }[];
  };
};

export function CustomerCard({ customer }: CustomerCardProps) {
  const mrr = customer.mrr ? Number(customer.mrr.toString()) : null;
  const revenue =
    mrr ?? estimateMonthlyRevenue(customer.pricingModel, customer.monthlyTransactions);
  const trialDaysLeft =
    customer.stage === LifecycleStage.TRIAL_ACTIVE_500 ? daysUntil(customer.trialEndsAt) : null;

  return (
    <Link
      className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
      href={`/dashboard/customers/${customer.id}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold text-slate-900">{customer.companyName}</h3>
            <LifecycleStageBadge stage={customer.stage} />
          </div>
          <p className="text-sm text-slate-500">
            {[customer.city, customer.country].filter(Boolean).join(", ")} ·{" "}
            {PRICING_MODEL_LABELS[customer.pricingModel]}
          </p>
          {customer.integrations.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {customer.integrations.slice(0, 6).map((integration) => (
                <span
                  key={integration.channel}
                  className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
                >
                  {INTEGRATION_CHANNEL_LABELS[integration.channel]}
                </span>
              ))}
              {customer.integrations.length > 6 ? (
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                  +{customer.integrations.length - 6}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No channels recorded yet</p>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            <span>Owner: {customer.assignedTo?.name ?? "Unassigned"}</span>
            <span>Source campaign: {customer.campaign?.name ?? "None"}</span>
            <span>Updated: {customer.updatedAt.toLocaleDateString()}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-900">
            {formatCurrency(revenue, customer.currency)}
            <span className="text-xs font-normal text-slate-500"> / month</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {customer.monthlyTransactions !== null
              ? `${customer.monthlyTransactions.toLocaleString()} transactions/mo`
              : "Volume unknown"}
          </p>
          {trialDaysLeft !== null ? (
            <p
              className={`mt-2 text-xs font-semibold ${
                trialDaysLeft <= 7 ? "text-rose-600" : "text-amber-600"
              }`}
            >
              {trialDaysLeft >= 0 ? `Trial ends in ${trialDaysLeft} days` : `Trial ended ${Math.abs(trialDaysLeft)} days ago`}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
