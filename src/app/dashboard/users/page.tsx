import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getServerAuthSession } from "@/lib/auth";
import { createInvitation } from "@/lib/invitations";
import { prisma } from "@/lib/prisma";
import { inviteUserSchema } from "@/lib/schemas";
import { USER_ROLE_LABELS, USER_ROLE_OPTIONS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerAuthSession();
  const params = await searchParams;
  const rawError = typeof params.error === "string" ? params.error : null;
  const success = typeof params.success === "string" ? params.success : null;

  // Map raw error codes/strings to safe user-facing messages
  const ERROR_MESSAGES: Record<string, string> = {
    validation: "Please check your input and try again.",
    "An invitation for this email already exists.": "An invitation for this email has already been sent.",
    send_failed: "Unable to send the invitation right now. Please try again later.",
  };
  const error = rawError
    ? (ERROR_MESSAGES[rawError] ?? "Something went wrong. Please try again.")
    : null;

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== UserRole.ADMIN) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-sm text-amber-800">
        Only admins can view and manage users.
      </div>
    );
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  async function inviteUserAction(formData: FormData) {
    "use server";

    const currentSession = await getServerAuthSession();

    if (!currentSession?.user) {
      redirect("/login");
    }

    if (currentSession.user.role !== UserRole.ADMIN) {
      redirect("/dashboard");
    }

    const parsed = inviteUserSchema.safeParse({
      email: formData.get("email"),
      role: formData.get("role") ?? UserRole.MARKETER,
    });

    if (!parsed.success) {
      redirect("/dashboard/users?error=validation");
    }

    try {
      await createInvitation({
        ...parsed.data,
        createdById: currentSession.user.id,
      });
    } catch (err) {
      const isDuplicate =
        err instanceof Error && err.message.toLowerCase().includes("already");
      const errorKey = isDuplicate
        ? "An invitation for this email already exists."
        : "send_failed";
      redirect(`/dashboard/users?error=${encodeURIComponent(errorKey)}`);
    }

    revalidatePath("/dashboard/users");
    redirect("/dashboard/users?success=Invitation%20sent");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Users</h1>
        <p className="mt-2 text-sm text-slate-500">
          Invite teammates and assign the right access level for marketing operations.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Invite teammate</h2>
        <form action={inviteUserAction} className="mt-5 grid gap-4 md:grid-cols-[2fr,1fr,auto]">
          <input className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring" name="email" placeholder="colleague@example.com" required type="email" />
          <select className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none ring-emerald-500 focus:border-emerald-500 focus:ring" defaultValue={UserRole.MARKETER} name="role">
            {USER_ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {USER_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <button className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500" type="submit">
            Send invite
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-5 py-4 font-semibold">Name</th>
                <th className="px-5 py-4 font-semibold">Email</th>
                <th className="px-5 py-4 font-semibold">Role</th>
                <th className="px-5 py-4 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-5 py-4 font-semibold text-slate-900">{user.name}</td>
                  <td className="px-5 py-4 text-slate-600">{user.email}</td>
                  <td className="px-5 py-4 text-slate-600">{USER_ROLE_LABELS[user.role]}</td>
                  <td className="px-5 py-4 text-slate-600">{user.createdAt.toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
