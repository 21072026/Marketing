import { CampaignStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_OPTIONS } from "@/lib/constants";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { campaignCreateSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { leads: true },
      },
      createdBy: {
        select: { name: true },
      },
    },
  });

  async function createCampaignAction(formData: FormData) {
    "use server";

    const session = await getServerAuthSession();

    if (!session?.user) {
      redirect("/login");
    }

    const parsed = campaignCreateSchema.safeParse({
      name: formData.get("name"),
      description: formData.get("description"),
      status: formData.get("status") ?? CampaignStatus.DRAFT,
      startDate: formData.get("startDate"),
      endDate: formData.get("endDate"),
      budget: formData.get("budget"),
    });

    if (!parsed.success) {
      redirect("/dashboard/campaigns?error=validation");
    }

    await prisma.campaign.create({
      data: {
        ...parsed.data,
        createdById: session.user.id,
      },
    });

    revalidatePath("/dashboard/campaigns");
    revalidatePath("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Campaigns</h1>
        <p className="mt-2 text-sm text-slate-500">
          Coordinate launch windows, budget, and sourced opportunities by campaign.
        </p>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Create campaign</h2>
        <form action={createCampaignAction} className="mt-5 grid gap-4 md:grid-cols-2">
          <input className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring md:col-span-2" name="name" placeholder="Q4 Product Launch" required />
          <select className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring" defaultValue={CampaignStatus.DRAFT} name="status">
            {CAMPAIGN_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {CAMPAIGN_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <input className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring" min="0" name="budget" placeholder="Budget" step="0.01" type="number" />
          <input className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring" name="startDate" type="date" />
          <input className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring" name="endDate" type="date" />
          <textarea className="min-h-28 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring md:col-span-2" name="description" placeholder="Audience, offer, channels, and goals" />
          <div className="md:col-span-2 flex justify-end">
            <button className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500" type="submit">
              Save campaign
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {campaigns.length > 0 ? (
          campaigns.map((campaign) => (
            <article key={campaign.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600">
                    {CAMPAIGN_STATUS_LABELS[campaign.status]}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">{campaign.name}</h2>
                </div>
                <div className="text-right text-sm font-semibold text-slate-900">
                  {campaign.budget ? `$${campaign.budget.toString()}` : "No budget"}
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-600">{campaign.description ?? "No campaign description yet."}</p>
              <div className="mt-5 flex flex-wrap gap-3 text-xs text-slate-500">
                <span>Leads: {campaign._count.leads}</span>
                <span>Created by {campaign.createdBy.name}</span>
                <span>
                  {campaign.startDate ? campaign.startDate.toLocaleDateString() : "No start date"} →{" "}
                  {campaign.endDate ? campaign.endDate.toLocaleDateString() : "No end date"}
                </span>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500 xl:col-span-2">
            No campaigns created yet.
          </div>
        )}
      </section>
    </div>
  );
}
