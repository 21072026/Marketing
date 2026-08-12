import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { contactCreateSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const contacts = await prisma.contact.findMany({
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    include: {
      _count: {
        select: { leads: true },
      },
      createdBy: {
        select: { name: true },
      },
    },
  });

  async function createContactAction(formData: FormData) {
    "use server";

    const session = await getServerAuthSession();

    if (!session?.user) {
      redirect("/login");
    }

    const parsed = contactCreateSchema.safeParse({
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      company: formData.get("company"),
      title: formData.get("title"),
      notes: formData.get("notes"),
    });

    if (!parsed.success) {
      redirect("/dashboard/contacts?error=validation");
    }

    await prisma.contact.create({
      data: {
        ...parsed.data,
        createdById: session.user.id,
      },
    });

    revalidatePath("/dashboard/contacts");
    redirect("/dashboard/contacts");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Contacts</h1>
        <p className="mt-2 text-sm text-slate-500">
          Maintain the people behind each opportunity and campaign touchpoint.
        </p>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Add contact</h2>
        <form action={createContactAction} className="mt-5 grid gap-4 md:grid-cols-2">
          <input className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring" name="firstName" placeholder="First name" required />
          <input className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring" name="lastName" placeholder="Last name" required />
          <input className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring" name="email" placeholder="Email" type="email" />
          <input className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring" name="phone" placeholder="Phone" />
          <input className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring" name="company" placeholder="Company" />
          <input className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring" name="title" placeholder="Title" />
          <textarea className="min-h-28 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring md:col-span-2" name="notes" placeholder="Context, preferences, or account notes" />
          <div className="md:col-span-2 flex justify-end">
            <button className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500" type="submit">
              Save contact
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-5 py-4 font-semibold">Contact</th>
                <th className="px-5 py-4 font-semibold">Company</th>
                <th className="px-5 py-4 font-semibold">Email</th>
                <th className="px-5 py-4 font-semibold">Open leads</th>
                <th className="px-5 py-4 font-semibold">Created by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {contacts.length > 0 ? (
                contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">
                        {contact.firstName} {contact.lastName}
                      </div>
                      <div className="text-xs text-slate-500">{contact.title ?? "No title"}</div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{contact.company ?? "—"}</td>
                    <td className="px-5 py-4 text-slate-600">{contact.email ?? "—"}</td>
                    <td className="px-5 py-4 text-slate-600">{contact._count.leads}</td>
                    <td className="px-5 py-4 text-slate-600">{contact.createdBy.name}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-5 py-10 text-center text-slate-500" colSpan={5}>
                    No contacts created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
