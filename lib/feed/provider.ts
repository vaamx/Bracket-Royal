import type { NormalizedResult } from "@/lib/scoring/run";

/** A swappable source of finished match results, normalized to our match ids. */
export interface ResultsProvider {
  readonly name: string;
  fetchFinishedResults(): Promise<NormalizedResult[]>;
}

export type { NormalizedResult };
