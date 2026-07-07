import { ApprovalModel, CampaignKind } from "./types";
import type { ApprovalModelValue, CampaignKindValue } from "./types";

/**
 * AI-assisted milestone drafting — the typed boundary between the create-flow
 * UI and whatever generates the draft.
 *
 * The UI only ever talks to draftMilestones(); the generation itself lives
 * behind POST /api/draft-milestones (app/api/draft-milestones/route.ts).
 * Today that route runs a deterministic heuristic per campaign kind; the LLM
 * integration plugs into the route without touching this file or the UI.
 * Drafts are ALWAYS editable suggestions — the creator reviews every field
 * before anything goes on-chain.
 */

export interface DraftRequest {
  kind: CampaignKindValue;
  title: string;
  description: string;
  /** Optional goal in whole USDC (display units), for amount suggestions. */
  goalAmount?: string;
  /** Preferred milestone count, 1–5. */
  milestoneCount?: number;
}

export interface DraftedMilestone {
  title: string;
  successDefinition: string;
  reportingPeriod: string;
  expectedMetrics: string;
  requiredProof: string;
  /** Suggested proof deadline, days from now (0 = suggest none). */
  suggestedDeadlineDays: number;
  /** Suggested share of the total goal, 0–1; shares sum to 1. */
  amountShare: number;
}

export interface DraftResponse {
  milestones: DraftedMilestone[];
  approval: {
    model: ApprovalModelValue;
    threshold: number;
    rationale: string;
  };
  notes: string;
  source: "heuristic" | "llm";
}

export async function draftMilestones(request: DraftRequest): Promise<DraftResponse> {
  const res = await fetch("/api/draft-milestones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    throw new Error(`Milestone drafting failed (${res.status})`);
  }
  return (await res.json()) as DraftResponse;
}

/** Sensible approval defaults by campaign kind, shared by UI and drafter. */
export function defaultApprovalForKind(kind: CampaignKindValue): {
  model: ApprovalModelValue;
  rationale: string;
} {
  switch (kind) {
    case CampaignKind.Startup:
      return {
        model: ApprovalModel.DesignatedReviewers,
        rationale:
          "Investor flows name their reviewers: the lead investor, partners, or an investment committee (set the threshold for committee sign-off).",
      };
    case CampaignKind.Grant:
      return {
        model: ApprovalModel.DesignatedReviewers,
        rationale: "Grant programs designate the administrator(s) who verify deliverables.",
      };
    case CampaignKind.Charity:
      return {
        model: ApprovalModel.NoApproval,
        rationale:
          "Consumer/charity campaigns default to no approval — funds release as soon as you submit proof. Switch to designated reviewers if you want oversight.",
      };
    default:
      return {
        model: ApprovalModel.NoApproval,
        rationale: "Defaulting to no approval; switch to designated reviewers for institutional flows.",
      };
  }
}
