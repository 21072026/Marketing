import { IntegrationChannel, LifecycleStage, PricingModel, Prisma } from "@prisma/client";
import Link from "next/link";

import { CustomerCard } from "@/components/CustomerCard";
import {
  INTEGRATION_CHANNEL_LABELS,
  LIFECYCLE_STAGE_LABELS,
  LIFECYCLE_STAGE_ORDER,
  MARKETPLACE_CHANNELS,
  PRICING_MODEL_LABELS,
  PRICING_MODEL_OPTIONS,
  SHOP_CHANNELS,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const inputClasses =
  "rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";

  const stage =
    typeof params.stage === "string" && params.stage in LIFECYCLE_STAGE_LABELS
      ? (params.stage as LifecycleStage)
      : undefined;

  const pricingModel =
    typeof params.pricingModel === "string" &&
    Object.values(PricingModel).includes(params.pricingModel as PricingModel)
      ? (params.pricingModel as PricingModel)
      : undefined;

  const channel =
    typeof params.channel === "string" &&
    Object.values(IntegrationChannel).includes(params.channel as IntegrationChannel)
      ? (params.channel as IntegrationChannel)
      : undefined;

  const where: Prisma.CustomerWhereInput = {
    stage,
    pricingModel,
    integrations: channel ? { some: { channel } } : undefined,
    OR: q
      ? [
          { companyName: { contains: q } },
          { legalName: { contains: q } },
          { website: { contains: q } },
          { city: { contains: q } },
          { vatId: { contains: q } },
          { notes: { contains: q } },
          { contacts: { some: { firstName: { contains: q } } } },
          { contacts: { some: { lastName: { contains: q } } } },
          { contacts: { some: { email: { contains: q } } } },
          { campaign: { is: { name: { contains: q } } } },
        ]
      : undefined,
  };

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      assignedTo: { select: { name: true } },
      campaign: { select: { name: true } },
      integrations: { select: { channel: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Customers</h1>
          <p className="mt-2 text-sm text-slate-500">
            Merchants using or evaluating SaleVali. Filter by funnel stage, billing model, or the
            sales channels they run.
          </p>
        </div>
        <Link
          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
          href="/dashboard/customers/new"
        >
          New customer
        </Link>
      </div>

      <form className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-[2fr,1fr,1fr,1fr,auto]">
        <input
          className={inputClasses}
          defaultValue={q}
          name="q"
          placeholder="Search company, contact, VAT ID, or campaign"
        />
        <select className={inputClasses} defaultValue={stage ?? ""} name="stage">
          <option value="">All stages</option>
          {LIFECYCLE_STAGE_ORDER.map((entry) => (
            <option key={entry} value={entry}>
              {LIFECYCLE_STAGE_LABELS[entry]}
            </option>
          ))}
        </select>
        <select className={inputClasses} defaultValue={pricingModel ?? ""} name="pricingModel">
          <option value="">All billing models</option>
          {PRICING_MODEL_OPTIONS.map((entry) => (
            <option key={entry} value={entry}>
              {PRICING_MODEL_LABELS[entry]}
            </option>
          ))}
        </select>
        <select className={inputClasses} defaultValue={channel ?? ""} name="channel">
          <option value="">All channels</option>
          <optgroup label="Marketplaces">
            {MARKETPLACE_CHANNELS.map((entry) => (
              <option key={entry} value={entry}>
                {INTEGRATION_CHANNEL_LABELS[entry]}
              </option>
            ))}
          </optgroup>
          <optgroup label="Shops">
            {SHOP_CHANNELS.map((entry) => (
              <option key={entry} value={entry}>
                {INTEGRATION_CHANNEL_LABELS[entry]}
              </option>
            ))}
          </optgroup>
        </select>
        <button
          className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          type="submit"
        >
          Apply filters
        </button>
      </form>

      <div className="grid gap-4 xl:grid-cols-2">
        {customers.length > 0 ? (
          customers.map((customer) => <CustomerCard key={customer.id} customer={customer} />)
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500 xl:col-span-2">
            No customers match your filters yet.
          </div>
        )}
      </div>
    </div>
  );
}
