// Demo dataset for the TEST environments (marketing.ersah.in and the per-PR
// envs), so nobody ever opens an empty CRM. Idempotent: every demo company is
// prefixed "DEMO ", and each run deletes those rows and recreates them, so a
// re-deploy resets the demo data without touching anything an operator added
// by hand.
//
// GUARD: refuses to run unless ALLOW_DEMO_SEED=1 is set. The runtime image has
// NODE_ENV=production everywhere — including on the test server — so NODE_ENV
// cannot distinguish test from live. An explicit flag in the env file can:
// /etc/salevali-crm/test.env sets it, the future prod.env never will, and a
// stray invocation against the live DB is then a printed sentence, not a
// database full of fake merchants.
//
// Also seeds the fixed test sign-in admin@ersah.in. That credential is
// deliberately public within the team and only ever exists behind this guard.
import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PREFIX = "DEMO ";
const TEST_ADMIN_EMAIL = "admin@ersah.in";
const TEST_ADMIN_PASSWORD = "12345678.Qw";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const daysAhead = (n) => new Date(Date.now() + n * DAY);

// Realistic German merchants. `history` is the funnel path with, per step, how
// many days ago it happened — backdated on purpose: transitions all stamped
// "now" would make every conversion instant and every time-in-stage zero,
// which makes the analytics screens (epic 3) undevelopable.
const MERCHANTS = [
  // ── Paying customers ────────────────────────────────────────────────────────
  { name: "Marqa Home GmbH", city: "Köln", industry: "Home & Living", locale: "TR", source: "CONSULTANT",
    pricing: "API_TRANSACTION_TIERED", tx: 2400, channels: ["AMAZON", "EBAY", "OTTO", "DHL"], sepa: "ACTIVE",
    history: [["PROSPECT_100", 210], ["CONTACTED_200", 200], ["DEMO_COMPLETED_400", 190], ["TRIAL_ACTIVE_500", 180], ["CUSTOMER_ACTIVE_700", 150]] },
  { name: "Simple Trading UG", city: "Berlin", industry: "Elektronik-Zubehör", locale: "DE", source: "WEBSITE_TRIAL",
    pricing: "API_TRANSACTION_TIERED", tx: 850, channels: ["AMAZON", "DHL"], sepa: "ACTIVE",
    history: [["TRIAL_ACTIVE_500", 120], ["CUSTOMER_ACTIVE_700", 92]] },
  { name: "Good Markt e.K.", city: "Hamburg", industry: "Drogerie & Haushalt", locale: "DE", source: "REFERRAL",
    pricing: "API_TRANSACTION_TIERED", tx: 5200, channels: ["AMAZON", "KAUFLAND", "SHOPIFY", "DPD"], sepa: "ACTIVE",
    history: [["PROSPECT_100", 300], ["CONTACTED_200", 290], ["DEMO_SCHEDULED_300", 285], ["DEMO_COMPLETED_400", 280], ["TRIAL_ACTIVE_500", 270], ["CUSTOMER_ACTIVE_700", 240]] },
  { name: "Here Mood GmbH", city: "Langenfeld", industry: "Möbel & Deko", locale: "TR", source: "CONSULTANT",
    pricing: "INVOICE_ONLY_FIXED", tx: null, channels: [], sepa: "ACTIVE",
    history: [["CONTACTED_200", 130], ["TRIAL_ACTIVE_500", 110], ["CUSTOMER_ACTIVE_700", 80]] },
  { name: "Finest Shopping GmbH", city: "München", industry: "Fashion", locale: "EN", source: "ADS",
    pricing: "API_TRANSACTION_TIERED", tx: 1450, channels: ["AMAZON", "EBAY", "SHOPWARE", "GLS"], sepa: "ACTIVE", mrr: 79.9,
    history: [["PROSPECT_100", 160], ["DEMO_COMPLETED_400", 150], ["TRIAL_ACTIVE_500", 140], ["CUSTOMER_ACTIVE_700", 110]] },
  { name: "MVM Handels GmbH", city: "Düsseldorf", industry: "Werkzeug & Garten", locale: "TR", source: "REFERRAL",
    pricing: "API_TRANSACTION_TIERED", tx: 3100, channels: ["AMAZON", "EBAY", "OTTO", "WOOCOMMERCE", "DHL", "HERMES"], sepa: "ACTIVE",
    history: [["CONTACTED_200", 220], ["TRIAL_ACTIVE_500", 200], ["CUSTOMER_ACTIVE_700", 170]] },

  // ── In the funnel ───────────────────────────────────────────────────────────
  { name: "Nordwind Outdoor GmbH", city: "Kiel", industry: "Outdoor & Sport", locale: "DE", source: "WEBSITE_TRIAL",
    pricing: "API_TRANSACTION_TIERED", tx: 600, channels: ["AMAZON", "SHOPIFY"], sepa: "NONE",
    history: [["TRIAL_ACTIVE_500", 8]], trialDays: [8, 22] },
  { name: "Bella Casa Deko UG", city: "Stuttgart", industry: "Deko", locale: "DE", source: "DEMO_REQUEST",
    pricing: "UNDECIDED", tx: 300, channels: ["ETSY", "SHOPIFY"], sepa: "NONE",
    history: [["CONTACTED_200", 30], ["DEMO_COMPLETED_400", 20], ["TRIAL_ACTIVE_500", 12]], trialDays: [12, 18] },
  { name: "TechnikPoint24 GmbH", city: "Frankfurt", industry: "Unterhaltungselektronik", locale: "DE", source: "WEBSITE_TRIAL",
    pricing: "API_TRANSACTION_TIERED", tx: 1900, channels: ["AMAZON", "EBAY", "KAUFLAND"], sepa: "NONE",
    history: [["TRIAL_ACTIVE_500", 26]], trialDays: [26, 4] },
  { name: "Anadolu Gıda Markt GmbH", city: "Duisburg", industry: "Lebensmittel", locale: "TR", source: "EVENT",
    pricing: "UNDECIDED", tx: null, channels: ["AMAZON"], sepa: "NONE",
    history: [["PROSPECT_100", 45], ["CONTACTED_200", 38], ["DEMO_SCHEDULED_300", 5]] },
  { name: "Kinderland Spielwaren e.K.", city: "Nürnberg", industry: "Spielwaren", locale: "DE", source: "OUTBOUND",
    pricing: "UNDECIDED", tx: 750, channels: ["AMAZON", "OTTO"], sepa: "NONE",
    history: [["PROSPECT_100", 21], ["CONTACTED_200", 14]] },
  { name: "Vello Bike Parts GmbH", city: "Leipzig", industry: "Fahrradteile", locale: "EN", source: "AFFILIATE",
    pricing: "UNDECIDED", tx: null, channels: ["EBAY", "WOOCOMMERCE"], sepa: "NONE",
    history: [["PROSPECT_100", 10]] },
  { name: "Beauty Depot 24 UG", city: "Essen", industry: "Kosmetik", locale: "TR", source: "ADS",
    pricing: "UNDECIDED", tx: 1100, channels: ["AMAZON", "KAUFLAND"], sepa: "NONE",
    history: [["CONTACTED_200", 60], ["DEMO_COMPLETED_400", 50], ["TRIAL_ACTIVE_500", 44], ["TRIAL_EXPIRED_600", 14]] },
  { name: "Gartenwelt Krause GmbH", city: "Dresden", industry: "Garten", locale: "DE", source: "DEMO_REQUEST",
    pricing: "INVOICE_ONLY_FIXED", tx: null, channels: [], sepa: "NONE",
    history: [["CONTACTED_200", 90], ["TRIAL_ACTIVE_500", 75], ["TRIAL_EXPIRED_600", 45]] },

  // ── Closed out ──────────────────────────────────────────────────────────────
  { name: "Papierwerk Nord UG", city: "Bremen", industry: "Bürobedarf", locale: "DE", source: "OUTBOUND",
    pricing: "UNDECIDED", tx: null, channels: [], sepa: "NONE",
    history: [["PROSPECT_100", 130], ["CONTACTED_200", 120], ["LOST_950", 100]],
    note: "Entschied sich für den Verbleib bei der bestehenden Warenwirtschaft." },
  { name: "Modehaus Yildiz GmbH", city: "Dortmund", industry: "Fashion", locale: "TR", source: "REFERRAL",
    pricing: "API_TRANSACTION_TIERED", tx: 420, channels: ["AMAZON"], sepa: "NONE",
    history: [["TRIAL_ACTIVE_500", 200], ["CUSTOMER_ACTIVE_700", 170], ["CANCELLATION_NOTICE_800", 60], ["CHURNED_900", 30]],
    note: "Geschäftsaufgabe zum Jahresende." },
  { name: "Billig-Basar Online", city: "Hannover", industry: "Restposten", locale: "DE", source: "ADS",
    pricing: "UNDECIDED", tx: null, channels: [], sepa: "NONE",
    history: [["PROSPECT_100", 70], ["DISQUALIFIED_990", 65]],
    note: "Kein Multichannel-Bedarf — verkauft nur über den eigenen Laden." },
];

const FIRST = ["Ayşe", "Mehmet", "Julia", "Thomas", "Elif", "Stefan", "Fatma", "Markus", "Zeynep", "Anna", "Peter", "Deniz", "Laura", "Emre", "Katrin", "Ali", "Sabine"];
const LAST = ["Yılmaz", "Schmidt", "Kaya", "Müller", "Demir", "Weber", "Şahin", "Becker", "Öztürk", "Wagner", "Arslan", "Hoffmann", "Çelik", "Koch", "Aydın", "Richter", "Doğan"];

async function main() {
  if (process.env.ALLOW_DEMO_SEED !== "1") {
    console.log("seed-demo: ALLOW_DEMO_SEED is not '1' — refusing to write demo data. (Set it in the test env file only.)");
    return;
  }

  // The fixed test sign-in. Same shape as prisma/seed.mjs, fixed credentials —
  // this account only ever exists behind the ALLOW_DEMO_SEED guard.
  const passwordHash = await bcrypt.hash(TEST_ADMIN_PASSWORD, 12);
  const admin = await prisma.user.upsert({
    where: { email: TEST_ADMIN_EMAIL },
    update: { role: UserRole.ADMIN, passwordHash },
    create: { email: TEST_ADMIN_EMAIL, name: "Test Admin", role: UserRole.ADMIN, passwordHash },
  });
  console.log(`seed-demo: test admin ${admin.email} ready`);

  // Reset previous demo rows. Contacts are SetNull on customer delete, so they
  // are removed explicitly by their @demo.example e-mail domain.
  const old = await prisma.customer.findMany({
    where: { companyName: { startsWith: DEMO_PREFIX } },
    select: { id: true },
  });
  if (old.length > 0) {
    const ids = old.map((c) => c.id);
    await prisma.contact.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.contact.deleteMany({ where: { email: { endsWith: "@demo.example" } } });

  let interactions = 0;
  let tasks = 0;

  for (const [i, m] of MERCHANTS.entries()) {
    const history = m.history;
    const stage = history[history.length - 1][0];
    const enteredStage = (s) => history.find(([h]) => h === s);

    // Lifecycle dates consistent with the history, mirroring what
    // lifecycleTimestampsFor() would have produced at each step.
    const trialStep = enteredStage("TRIAL_ACTIVE_500");
    const trialStartedAt = m.trialDays ? daysAgo(m.trialDays[0]) : trialStep ? daysAgo(trialStep[1]) : null;
    const trialEndsAt = m.trialDays ? daysAhead(m.trialDays[1]) : trialStartedAt ? new Date(trialStartedAt.getTime() + 30 * DAY) : null;
    const convertedAt = enteredStage("CUSTOMER_ACTIVE_700") ? daysAgo(enteredStage("CUSTOMER_ACTIVE_700")[1]) : null;
    const noticeAt = enteredStage("CANCELLATION_NOTICE_800") ? daysAgo(enteredStage("CANCELLATION_NOTICE_800")[1]) : null;
    const churnedAt = enteredStage("CHURNED_900") ? daysAgo(enteredStage("CHURNED_900")[1]) : null;
    const closedStep = enteredStage("CHURNED_900") ?? enteredStage("LOST_950") ?? enteredStage("DISQUALIFIED_990");
    const closedAt = closedStep ? daysAgo(closedStep[1]) : null;

    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 3) % LAST.length];
    const slug = m.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    const customer = await prisma.customer.create({
      data: {
        companyName: `${DEMO_PREFIX}${m.name}`,
        country: "DE",
        city: m.city,
        industry: m.industry,
        locale: m.locale,
        website: `https://${slug}.example`,
        stage,
        source: m.source,
        pricingModel: m.pricing,
        monthlyTransactions: m.tx,
        mrr: m.mrr ?? null,
        sepaMandateStatus: m.sepa,
        trialStartedAt, trialEndsAt, convertedAt,
        cancellationNoticeAt: noticeAt, churnedAt, closedAt,
        assignedToId: admin.id,
        createdById: admin.id,
        createdAt: daysAgo(history[0][1]),
        contacts: {
          create: {
            firstName: first,
            lastName: last,
            email: `${first.toLowerCase().replace(/[şç]/g, "s").replace(/[ğ]/g, "g").replace(/[üö]/g, "u").replace(/[ıi̇]/g, "i")}.${last.toLowerCase().replace(/[şç]/g, "s").replace(/[ğ]/g, "g").replace(/[üö]/g, "u").replace(/[ıi̇]/g, "i")}@demo.example`,
            phone: `+49 17${i % 10} ${1000000 + i * 53219}`,
            title: i % 3 === 0 ? "Geschäftsführung" : i % 3 === 1 ? "E-Commerce Manager" : "Buchhaltung",
            isPrimary: true,
            createdById: admin.id,
          },
        },
        integrations: {
          create: m.channels.map((channel) => ({
            channel,
            status: stage === "CUSTOMER_ACTIVE_700" || churnedAt ? "CONNECTED" : "INTERESTED",
          })),
        },
        // The audit trail, backdated to match — this is what the funnel
        // analytics read, so it has to exist and be plausible.
        stageHistory: {
          create: history.map(([toStage, ago], idx) => ({
            fromStage: idx === 0 ? null : history[idx - 1][0],
            toStage,
            changedAt: daysAgo(ago),
            createdById: admin.id,
            note: idx === history.length - 1 ? m.note ?? null : null,
          })),
        },
      },
    });

    // A little activity on the worked accounts.
    if (history.length > 1) {
      await prisma.interaction.create({
        data: {
          customerId: customer.id,
          type: i % 2 === 0 ? "CALL" : "EMAIL",
          subject: "Erstgespräch zu Multichannel-Anbindung",
          body: `Verkauft aktuell über ${m.channels.length || "keinen"} Kanal/Kanäle. Interesse an automatischer Rechnungsstellung.`,
          happenedAt: daysAgo(history[0][1] - 1),
          createdById: admin.id,
        },
      });
      interactions++;
    }
    if (stage === "TRIAL_ACTIVE_500" || stage === "TRIAL_EXPIRED_600" || stage === "DEMO_SCHEDULED_300") {
      await prisma.task.create({
        data: {
          customerId: customer.id,
          title: stage === "TRIAL_EXPIRED_600" ? "Nachfassen: Trial ausgelaufen, Entscheidung einholen" : "Onboarding-Check: Kanäle verbunden?",
          dueDate: daysAhead((i % 5) + 1),
          assignedToId: admin.id,
          createdById: admin.id,
        },
      });
      tasks++;
    }
  }

  console.log(`seed-demo: ${MERCHANTS.length} demo customers, ${interactions} interactions, ${tasks} tasks recreated`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
