import type { DomainSpecializationData, UmapData } from '../data/types';

export interface SampleToken {
  token: string;
}

/**
 * The first layer that actually routes between experts — 0 for OLMoE and JetMoE, 1 for DeepSeek,
 * whose layer 0 is a plain dense FFN with all-zero expert rows.
 *
 * Valid as a floor (rather than a set to skip) because dense layers are always a prefix: DeepSeek
 * is configured `first_k_dense_replace=1`. Every view that indexes by layer clamps to this, so a
 * reader can't land on a layer where `topKExperts` would rank 64 zeros and ring the first k as
 * "most-used".
 */
export function firstMoeLayer(data: DomainSpecializationData): number {
  const dense = data.dense_layers;
  return dense && dense.length > 0 ? Math.max(...dense) + 1 : 0;
}

/** Indices of the `k` highest values in `rates`, descending. */
export function topKExperts(rates: number[], k = 8): number[] {
  return rates
    .map((rate, expert) => ({ rate, expert }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, k)
    .map((e) => e.expert);
}

export interface CellMetrics {
  /** T(d): total tokens across the category's pooled passages. */
  total: number;
  /** hits(d,l,e), rounded back out of the stored rate rather than re-read from a raw count the
   *  JSON doesn't ship — activation_rate is already hits ÷ total, so this is exact up to the
   *  float rate's own rounding. */
  count: number;
  /** activation_rate(d,l,e) = hits(d,l,e) ÷ T(d), as a fraction (not ×100). */
  rate: number;
  /** normalized_rate(d,l,e) = [activation_rate ÷ k] × 100, already a percentage. */
  normalized: number;
  /** avg_softmax_prob(d,l,e) × 100, already a percentage. */
  avgProb: number;
  /** spec_score(d,l,e) = log2[(rate+ε) ÷ (avg_rate+ε)] — already computed into the data at
   *  export time, with the same ε = 0.0001 the paper defines. */
  specScore: number;
  /** 2^specScore — the "N× the 6-category average" figure the modal actually displays. */
  fold: number;
}

/** Every per-(category, layer, expert) number the paper's §4.4 metrics define, shared by
 *  DomainCellModal (a reader's own click) and WorkedExampleModal (a fixed reference example) so
 *  the two can never drift into reporting different arithmetic for the same formulas. */
export function cellMetrics(
  data: DomainSpecializationData,
  category: string,
  layer: number,
  expert: number
): CellMetrics {
  const total = data.token_counts[category];
  const rate = data.activation_rate[category][layer][expert];
  const count = Math.round(rate * total);
  const normalized = (rate / data.top_k_experts) * 100;
  const avgProb = data.avg_prob[category][layer][expert] * 100;
  const specScore = data.specialization_score[category][layer][expert];
  const fold = Math.pow(2, specScore);
  return { total, count, rate, normalized, avgProb, specScore, fold };
}

/**
 * The tokens that most strongly routed to (layer, expert) for a category — reads
 * expert_token_idx (indexed by token_idx into domain_tokens, NOT pre-sorted by score despite the
 * data's field name) and sorts by routing score descending.
 *
 * Unaffected by the notebook's per-cell cap: what ships is the 40 highest-scoring pairs, so the
 * top 3 by score are the same 3 they would be against the untruncated list.
 */
export function tokensForExpert(
  data: DomainSpecializationData,
  category: string,
  layer: number,
  expert: number,
  k = 3
): SampleToken[] {
  const pairs = data.expert_token_idx[category]?.[layer]?.[expert];
  if (!pairs) return [];
  const tokens = data.domain_tokens[category];

  const sorted = [...pairs].sort((a, b) => b[1] - a[1]);
  const seen = new Set<string>();
  const result: SampleToken[] = [];
  for (const [tokenIdx] of sorted) {
    const token = tokens[tokenIdx];
    const key = token.trim() || token;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ token });
    if (result.length >= k) break;
  }
  return result;
}

export interface UmapCategoryStats {
  category: string;
  count: number;
  /** Mean (x, y) of this category's points — not a real (layer, expert) pair, just the cluster's
   *  center of mass, used only to compare clusters against each other. */
  centroid: { x: number; y: number };
  /** Mean distance of this category's points from its own centroid — how tightly its (layer,
   *  expert) pairs agree on one spot in activation-profile space versus how scattered they are. */
  spread: number;
}

export interface UmapAnalysis {
  perCategory: UmapCategoryStats[];
  /** The two categories whose centroids sit closest together — the strongest "these two route
   *  alike" signal a reader can get from the plot at a glance. */
  closestPair: { a: string; b: string; distance: number };
  /** Smallest `spread`: the category whose (layer, expert) points agree most on where they sit. */
  tightest: UmapCategoryStats;
  /** Largest `spread`: the category whose points disagree most — no single activation profile
   *  describes it well. */
  mostScattered: UmapCategoryStats;
}

/**
 * Turns the raw (layer, expert) → (x, y) scatter into the same read a person does by eye —
 * "which clusters sit on top of each other, which one is tight, which one is all over the place"
 * — as real numbers, so the UMAP tab's copy can state a finding instead of just describing the
 * axes. Grouped by `dominant_category` (each point's single strongest category), not by whichever
 * categories are currently toggled on: the analysis describes the whole run, not the current view.
 */
export function analyzeUmap(umap: UmapData): UmapAnalysis | null {
  const byCategory = new Map<string, { x: number; y: number }[]>();
  for (const p of umap.points) {
    const arr = byCategory.get(p.dominant_category);
    if (arr) arr.push({ x: p.x, y: p.y });
    else byCategory.set(p.dominant_category, [{ x: p.x, y: p.y }]);
  }

  const perCategory: UmapCategoryStats[] = [];
  for (const category of umap.domains) {
    const pts = byCategory.get(category);
    if (!pts || pts.length === 0) continue;
    const cx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
    const cy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
    const spread =
      pts.reduce((sum, p) => sum + Math.hypot(p.x - cx, p.y - cy), 0) / pts.length;
    perCategory.push({ category, count: pts.length, centroid: { x: cx, y: cy }, spread });
  }
  // Fewer than two real clusters: nothing to compare one against another.
  if (perCategory.length < 2) return null;

  let closestPair = { a: perCategory[0].category, b: perCategory[1].category, distance: Infinity };
  for (let i = 0; i < perCategory.length; i++) {
    for (let j = i + 1; j < perCategory.length; j++) {
      const distance = Math.hypot(
        perCategory[i].centroid.x - perCategory[j].centroid.x,
        perCategory[i].centroid.y - perCategory[j].centroid.y
      );
      if (distance < closestPair.distance) {
        closestPair = { a: perCategory[i].category, b: perCategory[j].category, distance };
      }
    }
  }

  const tightest = perCategory.reduce((a, b) => (a.spread <= b.spread ? a : b));
  const mostScattered = perCategory.reduce((a, b) => (a.spread >= b.spread ? a : b));

  return { perCategory, closestPair, tightest, mostScattered };
}
