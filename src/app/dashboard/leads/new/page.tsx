import { LeadStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER } from "@/lib/constants";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { leadCreateSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export default async function NewLeadPage() {
  const [contacts, campaigns, users] = await Promise.all([
    prisma.contact.findMany({ orderBy: [{ firstName: "asc" }, { lastName: "asc" }] }),
    prisma.campaign.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);

  async function createLeadAction(formData: FormData) {
    "use server";

    const session = await getServerAuthSession();

    if (!session?.user) {
      redirect("/login");
    }

    const parsed = leadCreateSchema.safeParse({
      title: formData.get("title"),
      contactId: formData.get("contactId"),
      status: formData.get("status") ?? LeadStatus.LEAD_NEW_100,
      assignedToId: formData.get("assignedToId"),
      campaignId: formData.get("campaignId"),
      value: formData.get("value"),
      currency: formData.get("currency") ?? "USD",
      notes: formData.get("notes"),
    });

    if (!parsed.success) {
      redirect("/dashboard/leads/new?error=validation");
    }

    const lead = await prisma.lead.create({
      data: {
        ...parsed.data,
        createdById: session.user.id,
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/leads");
    redirect(`/dashboard/leads/${lead.id}`);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Create lead</h1>
        <p className="mt-2 text-sm text-slate-500">
          Capture pipeline value, ownership, and campaign context in one place.
        </p>
      </div>

      <form action={createLeadAction} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
            <span>Lead title</span>
            <input className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none ring-emerald-500 focus:border-emerald-500 focus:ring" name="title" placeholder="Enterprise ABM opportunity" required />
          </label>

          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Status</span>
            <select className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none ring-emerald-500 focus:border-emerald-500 focus:ring" defaultValue={LeadStatus.LEAD_NEW_100} name="status">
              {LEAD_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {LEAD_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Estimated value</span>
            <input className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none ring-emerald-500 focus:border-emerald-500 focus:ring" min="0" name="value" placeholder="15000" step="0.01" type="number" />
          </label>

          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Currency</span>
            <input className="w-full rounded-xl border border-slate-200 px-4 py-3 uppercase outline-none ring-emerald-500 focus:border-emerald-500 focus:ring" defaultValue="USD" maxLength={3} name="currency" placeholder="USD" />
          </label>

          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Contact</span>
            <select className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none ring-emerald-500 focus:border-emerald-500 focus:ring" name="contactId">
              <option value="">No contact yet</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.firstName} {contact.lastName}
                  {contact.company ? ` · ${contact.company}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Assigned owner</span>
            <select className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none ring-emerald-500 focus:border-emerald-500 focus:ring" name="assignedToId">
              <option value="">Unassigned</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
            <span>Campaign</span>
            <select className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none ring-emerald-500 focus:border-emerald-500 focus:ring" name="campaignId">
              <option value="">No campaign attribution</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2">
            <span>Notes</span>
            <textarea className="min-h-36 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none ring-emerald-500 focus:border-emerald-500 focus:ring" name="notes" placeholder="Add qualification details, next steps, or objections." />
          </label>
        </div>

        <div className="flex justify-end">
          <button className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500" type="submit">
            Save lead
          </button>
        </div>
      </form>
    </div>
  );
}
