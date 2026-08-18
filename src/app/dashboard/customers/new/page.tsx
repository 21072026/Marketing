import { CustomerLocale, CustomerSource, LifecycleStage, PricingModel, SepaMandateStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  CUSTOMER_LOCALE_LABELS,
  CUSTOMER_LOCALE_OPTIONS,
  CUSTOMER_SOURCE_LABELS,
  CUSTOMER_SOURCE_OPTIONS,
  INTEGRATION_CHANNEL_LABELS,
  LIFECYCLE_STAGE_LABELS,
  LIFECYCLE_STAGE_ORDER,
  MARKETPLACE_CHANNELS,
  PRICING_MODEL_LABELS,
  PRICING_MODEL_OPTIONS,
  SEPA_MANDATE_STATUS_LABELS,
  SEPA_MANDATE_STATUS_OPTIONS,
  SHOP_CHANNELS,
  TRIAL_LENGTH_DAYS,
} from "@/lib/constants";
import { getServerAuthSession } from "@/lib/auth";
import { lifecycleTimestampsFor } from "@/lib/lifecycle";
import { prisma } from "@/lib/prisma";
import { customerCreateSchema, integrationUpsertSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const fieldClasses =
  "w-full rounded-xl border border-slate-200 px-4 py-3 outline-none ring-emerald-500 focus:border-emerald-500 focus:ring";
const labelClasses = "space-y-2 text-sm font-medium text-slate-700";

export default async function NewCustomerPage() {
  const [campaigns, users] = await Promise.all([
    prisma.campaign.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);

  async function createCustomerAction(formData: FormData) {
    "use server";

    const session = await getServerAuthSession();

    if (!session?.user) {
      redirect("/login");
    }

    const parsed = customerCreateSchema.safeParse({
      companyName: formData.get("companyName"),
      legalName: formData.get("legalName"),
      website: formData.get("website"),
      country: formData.get("country"),
      city: formData.get("city"),
      vatId: formData.get("vatId"),
      locale: formData.get("locale") ?? CustomerLocale.DE,
      industry: formData.get("industry"),
      stage: formData.get("stage") ?? LifecycleStage.PROSPECT_100,
      source: formData.get("source") ?? CustomerSource.OTHER,
      pricingModel: formData.get("pricingModel") ?? PricingModel.UNDECIDED,
      monthlyTransactions: formData.get("monthlyTransactions"),
      mrr: formData.get("mrr"),
      currency: formData.get("currency") ?? "EUR",
      trialStartedAt: formData.get("trialStartedAt"),
      trialEndsAt: formData.get("trialEndsAt"),
      sepaMandateStatus: formData.get("sepaMandateStatus") ?? SepaMandateStatus.NONE,
      assignedToId: formData.get("assignedToId"),
      campaignId: formData.get("campaignId"),
      notes: formData.get("notes"),
    });

    if (!parsed.success) {
      redirect("/dashboard/customers/new?error=validation");
    }

    // Channels arrive as repeated checkbox values; each valid one becomes an
    // integration row marked "interested" until the connection is confirmed.
    const channels = formData
      .getAll("channels")
      .map((value) => integrationUpsertSchema.safeParse({ channel: value }))
      .flatMap((result) => (result.success ? [result.data] : []));

    const { stage, ...rest } = parsed.data;
    const timestamps = lifecycleTimestampsFor(stage, {
      trialStartedAt: rest.trialStartedAt ?? null,
      trialEndsAt: rest.trialEndsAt ?? null,
    });

    const customer = await prisma.customer.create({
      data: {
        ...rest,
        stage,
        ...timestamps,
        createdById: session.user.id,
        integrations: channels.length > 0 ? { create: channels } : undefined,
        stageHistory: {
          create: {
            toStage: stage,
            createdById: session.user.id,
          },
        },
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/customers");
    redirect(`/dashboard/customers/${customer.id}`);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Add customer</h1>
        <p className="mt-2 text-sm text-slate-500">
          Record a merchant that uses or should use SaleVali: company details, funnel stage, billing
          model, and the channels they sell on.
        </p>
      </div>

      <form
        action={createCustomerAction}
        className="space-y-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <fieldset className="space-y-5">
          <legend className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
            Company
          </legend>
          <div className="grid gap-5 md:grid-cols-2">
            <label className={`${labelClasses} md:col-span-2`}>
              <span>Company name</span>
              <input className={fieldClasses} name="companyName" placeholder="Marqa Home GmbH" required />
            </label>

            <label className={labelClasses}>
              <span>Legal name</span>
              <input className={fieldClasses} name="legalName" placeholder="Optional registered name" />
            </label>

            <label className={labelClasses}>
              <span>Website</span>
              <input className={fieldClasses} name="website" placeholder="https://example.de" />
            </label>

            <label className={labelClasses}>
              <span>Country (ISO code)</span>
              <input className={`${fieldClasses} uppercase`} defaultValue="DE" maxLength={2} name="country" />
            </label>

            <label className={labelClasses}>
              <span>City</span>
              <input className={fieldClasses} name="city" placeholder="Langenfeld" />
            </label>

            <label className={labelClasses}>
              <span>VAT ID (USt-IdNr.)</span>
              <input className={fieldClasses} name="vatId" placeholder="DE123456789" />
            </label>

            <label className={labelClasses}>
              <span>Interface language</span>
              <select className={fieldClasses} defaultValue={CustomerLocale.DE} name="locale">
                {CUSTOMER_LOCALE_OPTIONS.map((locale) => (
                  <option key={locale} value={locale}>
                    {CUSTOMER_LOCALE_LABELS[locale]}
                  </option>
                ))}
              </select>
            </label>

            <label className={`${labelClasses} md:col-span-2`}>
              <span>Industry / product niche</span>
              <input className={fieldClasses} name="industry" placeholder="Home & living" />
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-5">
          <legend className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
            Funnel
          </legend>
          <div className="grid gap-5 md:grid-cols-2">
            <label className={labelClasses}>
              <span>Lifecycle stage</span>
              <select className={fieldClasses} defaultValue={LifecycleStage.PROSPECT_100} name="stage">
                {LIFECYCLE_STAGE_ORDER.map((stage) => (
                  <option key={stage} value={stage}>
                    {LIFECYCLE_STAGE_LABELS[stage]}
                  </option>
                ))}
              </select>
            </label>

            <label className={labelClasses}>
              <span>Source</span>
              <select className={fieldClasses} defaultValue={CustomerSource.OTHER} name="source">
                {CUSTOMER_SOURCE_OPTIONS.map((source) => (
                  <option key={source} value={source}>
                    {CUSTOMER_SOURCE_LABELS[source]}
                  </option>
                ))}
              </select>
            </label>

            <label className={labelClasses}>
              <span>Trial start</span>
              <input className={fieldClasses} name="trialStartedAt" type="date" />
            </label>

            <label className={labelClasses}>
              <span>Trial end</span>
              <input className={fieldClasses} name="trialEndsAt" type="date" />
            </label>

            <label className={labelClasses}>
              <span>Assigned marketer</span>
              <select className={fieldClasses} name="assignedToId">
                <option value="">Unassigned</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={labelClasses}>
              <span>Source campaign</span>
              <select className={fieldClasses} name="campaignId">
                <option value="">No campaign attribution</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Leave the trial dates empty when setting the stage to “Trial active” — a{" "}
            {TRIAL_LENGTH_DAYS}-day window is filled in automatically.
          </p>
        </fieldset>

        <fieldset className="space-y-5">
          <legend className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
            Billing
          </legend>
          <div className="grid gap-5 md:grid-cols-2">
            <label className={`${labelClasses} md:col-span-2`}>
              <span>Billing model</span>
              <select className={fieldClasses} defaultValue={PricingModel.UNDECIDED} name="pricingModel">
                {PRICING_MODEL_OPTIONS.map((model) => (
                  <option key={model} value={model}>
                    {PRICING_MODEL_LABELS[model]}
                  </option>
                ))}
              </select>
            </label>

            <label className={labelClasses}>
              <span>Monthly transactions</span>
              <input className={fieldClasses} min="0" name="monthlyTransactions" placeholder="1200" step="1" type="number" />
            </label>

            <label className={labelClasses}>
              <span>Monthly recurring revenue</span>
              <input className={fieldClasses} min="0" name="mrr" placeholder="Leave empty to estimate" step="0.01" type="number" />
            </label>

            <label className={labelClasses}>
              <span>Currency</span>
              <input className={`${fieldClasses} uppercase`} defaultValue="EUR" maxLength={3} name="currency" />
            </label>

            <label className={labelClasses}>
              <span>SEPA mandate</span>
              <select className={fieldClasses} defaultValue={SepaMandateStatus.NONE} name="sepaMandateStatus">
                {SEPA_MANDATE_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {SEPA_MANDATE_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-5">
          <legend className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">
            Channels they sell on
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Marketplaces</p>
              {MARKETPLACE_CHANNELS.map((channel) => (
                <label key={channel} className="flex items-center gap-3 text-sm text-slate-700">
                  <input className="h-4 w-4 rounded border-slate-300" name="channels" type="checkbox" value={channel} />
                  {INTEGRATION_CHANNEL_LABELS[channel]}
                </label>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shops</p>
              {SHOP_CHANNELS.map((channel) => (
                <label key={channel} className="flex items-center gap-3 text-sm text-slate-700">
                  <input className="h-4 w-4 rounded border-slate-300" name="channels" type="checkbox" value={channel} />
                  {INTEGRATION_CHANNEL_LABELS[channel]}
                </label>
              ))}
            </div>
          </div>
        </fieldset>

        <label className={labelClasses}>
          <span>Notes</span>
          <textarea
            className={`${fieldClasses} min-h-36`}
            name="notes"
            placeholder="Current system, pain points, objections, next steps."
          />
        </label>

        <div className="flex justify-end">
          <button
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
            type="submit"
          >
            Save customer
          </button>
        </div>
      </form>
    </div>
  );
}
