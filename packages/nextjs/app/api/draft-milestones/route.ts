import { NextResponse } from "next/server";
import type {
  DraftRequest,
  DraftResponse,
  DraftedMilestone,
} from "../../../lib/milestoneDrafter";
import { defaultApprovalForKind } from "../../../lib/milestoneDrafter";
import { CampaignKind } from "../../../lib/types";

/**
 * Milestone drafting endpoint — the single seam where LLM generation belongs.
 *
 * Current behavior: a deterministic per-kind heuristic (below), so the app
 * works with zero external dependencies and never pretends a model wrote it
 * (`source: "heuristic"` is surfaced in the UI).
 *
 * TODO(llm): to wire a real model, replace ONLY the body of this handler:
 *   1. `npm install @anthropic-ai/sdk` in packages/nextjs
 *   2. Set ANTHROPIC_API_KEY (server-side env — never NEXT_PUBLIC_).
 *   3. const client = new Anthropic();
 *      const response = await client.messages.parse({
 *        model: "claude-opus-4-8",
 *        max_tokens: 16000,
 *        output_config: { format: zodOutputFormat(DraftResponseSchema) },
 *        messages: [{ role: "user", content: buildPrompt(request) }],
 *      });
 *      return NextResponse.json({ ...response.parsed_output, source: "llm" });
 *   4. Keep the heuristic below as the fallback when the key is unset or the
 *      call fails — the UI contract (DraftResponse) must not change.
 */

const CLAMP = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Request-size guard: milestone drafts are tiny, so reject anything large before
// parsing it. Defends the single server endpoint against oversized-payload abuse.
const MAX_BODY_BYTES = 16 * 1024;
// Per-field length caps stop a caller from pushing megabytes of text through the
// two free-form fields (which pass into the heuristic and back out in the response).
const MAX_FIELD_LEN = 4000;

// In-memory fixed-window rate limiter (per process instance). No dependency; good
// enough for a single deployment. Behind a CDN/multi-instance host this becomes
// best-effort — a shared store is the Phase 2 upgrade.
const RL_WINDOW_MS = 60_000;
const RL_MAX = 30;
const rlHits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(req: Request): boolean {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const now = Date.now();
  let e = rlHits.get(ip);
  if (!e || now > e.resetAt) {
    e = { count: 0, resetAt: now + RL_WINDOW_MS };
    rlHits.set(ip, e);
  }
  e.count += 1;
  // Opportunistic cleanup so the map stays bounded.
  if (rlHits.size > 5000) {
    for (const [k, v] of rlHits) if (now > v.resetAt) rlHits.delete(k);
  }
  return e.count > RL_MAX;
}

export async function POST(req: Request) {
  if (rateLimited(req)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Reject oversized bodies up front (Content-Length is a cheap first gate).
  const declaredLen = Number(req.headers.get("content-length") ?? 0);
  if (declaredLen > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  let body: DraftRequest;
  try {
    body = JSON.parse(raw) as DraftRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.title?.trim() || !body?.description?.trim()) {
    return NextResponse.json(
      { error: "title and description are required to draft milestones" },
      { status: 400 },
    );
  }
  if (body.title.length > MAX_FIELD_LEN || body.description.length > MAX_FIELD_LEN) {
    return NextResponse.json(
      { error: "title and description are too long" },
      { status: 400 },
    );
  }

  const count = CLAMP(Math.round(body.milestoneCount ?? 3), 1, 5);
  const response = heuristicDraft(body, count);
  return NextResponse.json(response);
}

// -----------------------------------------------------------------------------
// Deterministic heuristic generation (per campaign kind)
// -----------------------------------------------------------------------------

function heuristicDraft(request: DraftRequest, count: number): DraftResponse {
  const templates = TEMPLATES[request.kind] ?? TEMPLATES[CampaignKind.Other];
  const picked = spread(templates.milestones, count);

  // Front-load amounts slightly: earlier tranches are smaller, building trust.
  const rawShares = picked.map((_, i) => 1 + i * 0.25);
  const total = rawShares.reduce((s, v) => s + v, 0);
  const shares = rawShares.map((v) => v / total);

  const approvalDefault = defaultApprovalForKind(request.kind);

  return {
    milestones: picked.map((m, i) => ({
      ...m,
      title: m.title.replace("{n}", String(i + 1)),
      amountShare: shares[i],
      suggestedDeadlineDays: templates.deadlineDays * (i + 1),
    })),
    approval: {
      model: approvalDefault.model,
      threshold: approvalDefault.threshold,
      rationale: approvalDefault.rationale,
    },
    notes: templates.notes,
    source: "heuristic",
  };
}

/** Pick `count` templates, spreading across the list when count < length. */
function spread<T>(items: T[], count: number): T[] {
  if (count >= items.length) {
    return Array.from({ length: count }, (_, i) => items[i % items.length]);
  }
  return Array.from(
    { length: count },
    (_, i) => items[Math.floor((i * items.length) / count)],
  );
}

type Template = Omit<DraftedMilestone, "amountShare" | "suggestedDeadlineDays">;

const TEMPLATES: Record<number, { milestones: Template[]; deadlineDays: number; notes: string }> = {
  [CampaignKind.Charity]: {
    deadlineDays: 30,
    notes:
      "Charity drafts tie deadlines to distribution windows and lean on receipts, photos and delivery logs. Edit every field to match your actual plan.",
    milestones: [
      {
        title: "Initial purchase / deposit made",
        successDefinition:
          "The first tranche of funds is spent on the stated purpose, with a receipt matching the milestone amount.",
        reportingPeriod: "Once, within the first distribution window",
        expectedMetrics: "",
        requiredProof: "Itemized receipts or invoices, photos of purchased goods, vendor reference",
      },
      {
        title: "Distribution to beneficiaries",
        successDefinition:
          "Goods or services reach the stated beneficiaries; the delivery is documented end to end.",
        reportingPeriod: "Once, at distribution",
        expectedMetrics: "Number of beneficiaries reached",
        requiredProof: "Photos/videos of distribution, delivery logs, beneficiary confirmation",
      },
      {
        title: "Follow-up and impact report",
        successDefinition:
          "A wrap-up report accounts for all spending and documents the outcome for donors.",
        reportingPeriod: "Once, after distribution completes",
        expectedMetrics: "Total spent vs. raised, beneficiaries served",
        requiredProof: "Spending summary, remaining receipts, follow-up photos or testimonials",
      },
      {
        title: "Phase {n} delivery",
        successDefinition: "The next planned tranche of aid is purchased and delivered as described.",
        reportingPeriod: "Per distribution window",
        expectedMetrics: "",
        requiredProof: "Receipts, photos, delivery logs",
      },
    ],
  },
  [CampaignKind.Startup]: {
    deadlineDays: 28,
    notes:
      "Startup drafts assume a metrics-driven review every 2–4 weeks. Replace the placeholder numbers with the targets you actually committed to your investors.",
    milestones: [
      {
        title: "MVP shipped to first users",
        successDefinition:
          "A working product is in real users' hands — publicly accessible or via a managed waitlist.",
        reportingPeriod: "Every 2 weeks until launch",
        expectedMetrics: "Launch date, first-user count",
        requiredProof: "Product link or demo video, analytics screenshot of first sessions, roadmap update",
      },
      {
        title: "User growth target",
        successDefinition:
          "Active usage hits the agreed growth target (e.g. 500 weekly active users) with real, non-incentivized users.",
        reportingPeriod: "Every 2–4 weeks",
        expectedMetrics: "WAU/MAU, week-over-week growth rate",
        requiredProof: "Analytics dashboard screenshots, user growth report, session usage data export",
      },
      {
        title: "Retention / engagement milestone",
        successDefinition:
          "Cohort retention meets the agreed bar (e.g. ≥20% week-4 retention), demonstrating product-market signal.",
        reportingPeriod: "Monthly cohort reporting",
        expectedMetrics: "W4 retention %, DAU/WAU ratio",
        requiredProof: "Cohort retention table, analytics export, team update doc",
      },
      {
        title: "Revenue / ROI checkpoint",
        successDefinition:
          "First revenue (or the agreed unit-economics target) is reached and documented.",
        reportingPeriod: "Monthly",
        expectedMetrics: "MRR, conversion rate, CAC/LTV if available",
        requiredProof: "Revenue dashboard or profit/ROI documents, updated financial model, roadmap",
      },
    ],
  },
  [CampaignKind.Grant]: {
    deadlineDays: 45,
    notes:
      "Grant drafts mirror a typical deliverable-based disbursement schedule reviewed by the program administrator.",
    milestones: [
      {
        title: "Project plan and budget approved",
        successDefinition:
          "A detailed work plan and line-item budget for the grant period is delivered and accepted.",
        reportingPeriod: "Once, at kickoff",
        expectedMetrics: "",
        requiredProof: "Work plan document, line-item budget, timeline",
      },
      {
        title: "Midpoint deliverable",
        successDefinition:
          "The agreed midpoint deliverable is complete and matches the approved plan.",
        reportingPeriod: "Per the grant reporting schedule",
        expectedMetrics: "Deliverable completion vs. plan",
        requiredProof: "Deliverable itself (or access to it), progress report, spend-to-date summary",
      },
      {
        title: "Final report and closeout",
        successDefinition:
          "All grant objectives are met and the final report accounts for the full budget.",
        reportingPeriod: "Once, at grant end",
        expectedMetrics: "Objectives met, budget variance",
        requiredProof: "Final report, complete expense documentation, outcome evidence",
      },
    ],
  },
  [CampaignKind.Other]: {
    deadlineDays: 30,
    notes: "Generic draft — tighten the success definitions until a stranger could judge them.",
    milestones: [
      {
        title: "Milestone {n} delivered",
        successDefinition:
          "The stated deliverable for this phase is complete and verifiable by the reviewer.",
        reportingPeriod: "Per phase",
        expectedMetrics: "",
        requiredProof: "Links or documents demonstrating the deliverable, brief written update",
      },
      {
        title: "Milestone {n} delivered",
        successDefinition:
          "The stated deliverable for this phase is complete and verifiable by the reviewer.",
        reportingPeriod: "Per phase",
        expectedMetrics: "",
        requiredProof: "Links or documents demonstrating the deliverable, brief written update",
      },
      {
        title: "Final delivery and wrap-up",
        successDefinition: "All committed work is complete and documented for funders.",
        reportingPeriod: "Once, at completion",
        expectedMetrics: "",
        requiredProof: "Final deliverables, spending/effort summary",
      },
    ],
  },
};
