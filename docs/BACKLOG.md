# Backlog

Work that is real but too large to land alongside the current change. Each entry
says what it is, why it matters for *selling SaleVali*, and what the first slice
would be — so picking one up does not start with re-deriving the reasoning.

Ordered roughly by value per unit of effort.

---

## 1. Turkish / German UI (i18n)

**Why.** SaleVali itself ships in DE / EN / TR, and the marketing team is
German- and Turkish-speaking. The CRM is English-only. Every stage label,
badge and empty state is currently a hard-coded string.

**First slice.** Extract all user-facing strings into `src/i18n/{de,en,tr}.ts`,
a `t()` helper reading the user's locale, and a CI check that the three files
have identical key sets (the reference project's `check:i18n` script is the
model). Do the extraction before adding more screens, not after.

**Size.** Large — it touches every component. Cheaper now than in six months.

---

## 2. Trial expiry reminders (scheduled job + email)

**Why.** SaleVali trials run 30 days and **never auto-renew**. A trial that
expires unattended is a customer lost in silence. Today the dashboard shows a
7-day warning panel — which only helps someone who opens the dashboard.

**First slice.** A cron entry (`node-cron` in-process, or an authenticated
`/api/cron/trial-reminders` called by systemd) that emails the assigned marketer
at T-7 / T-3 / T-0, plus a `Setting` row baselining "already notified" so
turning it on does not email the entire back catalogue at once.

**Size.** Medium. Needs the reference project's cron-baseline trick to be safe.

---

## 3. Self-service onboarding of the SaleVali signup funnel

**Why.** Merchants register on salevali.de and start a trial without anyone in
the CRM knowing. Someone re-types them by hand, or they are never tracked.

**First slice.** An authenticated ingest endpoint
(`POST /api/customers/ingest`, shared-secret header) that the SaleVali app calls
on signup, creating a `Customer` at `TRIAL_ACTIVE_500` with `source =
WEBSITE_TRIAL` and the connected channels. Idempotent on VAT ID or company +
country, so a repeat call updates rather than duplicates.

**Size.** Medium, and it needs a decision from the SaleVali side about who calls
whom.

---

## 4. Usage-driven health signals

**Why.** The strongest churn predictor for an ERP is usage: a merchant whose
transaction volume drops for two weeks is leaving, whatever the CRM says. `mrr`
and `monthlyTransactions` are typed in by hand today, so they are stale by
definition.

**First slice.** A nightly sync of per-customer transaction counts from the
SaleVali database into a `CustomerUsage` table (date, transactions, orders), a
sparkline on the customer record, and a "volume dropped >40% month over month"
filter on the customer list.

**Size.** Large. Depends on read access to SaleVali's data.

---

## 5. Reporting and funnel analytics

**Why.** `StageChange` already records every transition with a timestamp, so
conversion rates and time-in-stage are computable — nothing reads them yet.

**First slice.** `/dashboard/analytics`: trial → paying conversion rate by month
and by source, median days in each stage, MRR trend, and churn by cohort. Read
straight from `StageChange`; no new writes needed.

**Size.** Medium.

---

## 6. Per-PR preview environments

**Why.** `deploy-preview.yml` tracks `main`, so two PRs in flight cannot be
reviewed side by side. The reference project solves this with topic
environments (`topic-preview.yml` / `topic-teardown.sh`): a container and
subdomain per PR, torn down on merge.

**First slice.** Port `topic-deploy.sh` + `topic-teardown.sh`, a wildcard TLS
cert, and a PR-comment bot posting the URL.

**Size.** Medium, mostly server-side setup. Do it when more than one person is
reviewing at a time.

---

## 7. Role scoping that actually restricts

**Why.** `MARKETER`, `MANAGER` and `ADMIN` exist, but apart from delete
permissions and the Users page, every role sees and edits every customer. That
is fine for a small in-house team and wrong the moment freelancers or a partner
agency get accounts.

**First slice.** Decide the policy first (own customers only? region? none?),
write it down in `docs/role-access-matrix.md`, then enforce it in one place —
a `scopeForUser(session)` helper every query goes through — and cover it with an
authorization-matrix e2e spec asserting the *negative* cases.

**Size.** Medium. The e2e coverage is the important half.

---

## 8. Import from the existing spreadsheet / SaleVali customer list

**Why.** There are already customers. Until they are in the CRM, the CRM is a
parallel universe and the team keeps using the spreadsheet.

**First slice.** `scripts/import-csv.mjs`: company, contact, country, channels,
stage; dry-run by default, `--commit` to write, idempotent on VAT ID. Report
what it would change before it changes anything.

**Size.** Small–medium, and it is what makes the tool real for the team.

---

## 9. E2E result emails and a stress test

**Why.** `e2e-full.yml` runs twice a day and reports into the Actions tab, which
nobody watches. The reference project emails a summary after every scheduled
run (`scripts/e2e-report-email.mjs`) — heartbeat when green, failing specs with
error snippets when red. `scripts/send-alert-email.mjs` is already ported, so
half the work is done.

**First slice.** Merge the sharded blob reports, render a summary, send it to
`ALERT_EMAIL_TO`. Then a small `scripts/stress-test.mjs` hitting `/api/health`
and the customer list to catch response-time regressions.

**Size.** Small.

---

## 10. GDPR / data-protection surface

**Why.** The records are named people at German companies, and SaleVali's own
selling points are GoBD / DSGVO compliance. A CRM that cannot answer "delete
everything about this person" is a liability for the same customers it is meant
to win.

**First slice.** A documented retention policy (`docs/DATA_ACCESS_POLICY.md`),
an admin-only "erase contact" action that removes the person while keeping the
company aggregate, and an access log for who read which customer record.

**Size.** Medium. Get it in place before the first freelancer account.
