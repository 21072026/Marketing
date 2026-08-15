# Security

## Reporting a vulnerability

Email **security@bcsit-gmbh.de** with a description and, if possible, steps to
reproduce. Do not open a public issue for a vulnerability.

You will get an acknowledgement, and a fix or a decision with reasoning. Please
give us a reasonable window before disclosing anything publicly.

## What this application holds

Named contacts at customer companies: names, business email addresses, phone
numbers, VAT IDs, plus commercial detail (transaction volume, revenue, notes).
Under GDPR that is personal data about identifiable people. Treat database dumps
accordingly — `infra/backup-db.sh` creates them `0600` in a `0700` directory, and
they must never be copied into the repository, a preview environment, or a
ticket.

## Controls in place

- **Authentication**: NextAuth credentials, bcrypt hashes, JWT sessions.
  Registration is invitation-only, via one-time tokens with an expiry.
- **Authorization**: the middleware guards `/dashboard/*`; every API route checks
  the session itself, and an e2e spec asserts that each one answers `401` to an
  anonymous caller — so a new route that forgets the check fails the gate.
- **Security headers**: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, restrictive `Permissions-Policy` (`next.config.js`). No
  third-party script hosts are allow-listed; keep it that way.
- **Health endpoint**: `/api/health` stays public for uptime monitors, but its
  detailed fields (version, git sha, subsystem status) are released only to an
  admin session or a caller holding `HEALTH_TOKEN` — those fields are a
  ready-made answer to "which CVEs apply to this deployment?". The optional
  `?db=1` / `?smtp=1` subsystem checks are gated on the same authorization, so
  an anonymous caller cannot make the server open a database or SMTP connection
  on demand, nor read an SMTP error back to probe the mail configuration.
- **Dependencies**: Dependabot weekly; `npm audit` on every PR, blocking on
  `critical` (`security-audit.yml`).
- **Static analysis**: CodeQL (`security-extended`) on push, PR and weekly.
- **Data**: a backup is taken before every schema sync, and a data-destroying
  schema change stops the production deploy.

## Known gaps

Recorded here rather than left implicit — see `docs/BACKLOG.md` for the plan.

- **Role scoping is coarse.** `MARKETER`, `MANAGER` and `ADMIN` differ only in
  delete permissions and access to the Users page; every role can see every
  customer. Acceptable for a small in-house team, not for external accounts.
- **No access log.** There is no record of who read which customer record.
- **No erasure workflow.** Deleting everything about one person is a manual
  database operation today.
