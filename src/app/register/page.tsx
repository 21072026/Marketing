"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") ?? "";
  const [token, setToken] = useState(tokenFromUrl);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setToken(tokenFromUrl);
  }, [tokenFromUrl]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const response = await fetch("/api/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token, name, password }),
    });

    const payload = (await response.json()) as { error?: string; message?: string };
    setLoading(false);

    if (!response.ok) {
      setError(payload.error ?? "Unable to complete registration.");
      return;
    }

    setSuccess(payload.message ?? "Registration complete. Redirecting to login...");
    setTimeout(() => {
      router.push("/login");
    }, 1200);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl shadow-slate-950/20">
        <div className="mb-8 space-y-2 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-600">
            Marketing CRM
          </p>
          <h1 className="text-3xl font-bold text-slate-900">Complete your invitation</h1>
          <p className="text-sm text-slate-500">
            Create your password and start collaborating on the marketing pipeline.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block space-y-2 text-sm font-medium text-slate-700">
            <span>Invitation token</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none ring-emerald-500 transition focus:border-emerald-500 focus:ring"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste the invite token"
              required
            />
          </label>

          <label className="block space-y-2 text-sm font-medium text-slate-700">
            <span>Your name</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none ring-emerald-500 transition focus:border-emerald-500 focus:ring"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Jane Marketer"
              required
            />
          </label>

          <label className="block space-y-2 text-sm font-medium text-slate-700">
            <span>Password</span>
            <input
              className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none ring-emerald-500 transition focus:border-emerald-500 focus:ring"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 8 characters"
              required
            />
          </label>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}
            </div>
          ) : null}

          <button
            className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
            disabled={loading}
            type="submit"
          >
            {loading ? "Registering..." : "Complete registration"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already activated?{" "}
          <Link className="font-semibold text-emerald-600 hover:text-emerald-500" href="/login">
            Return to login
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
