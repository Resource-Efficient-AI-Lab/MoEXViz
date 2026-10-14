/**
 * Human-readable names for the six pre-computed input categories. Keyed by the `domain` field
 * in moe_routing_trace.json / domain_specialization.json — imported by the Architecture tab's
 * prompt optgroups and every Domain Specialization sub-tab.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  // Renamed from the bare domain keys ("Code", "Math") to match what the `code`/`math` passages
  // actually are, not just what the key says: `code`'s five prompts are production-incident
  // narratives (a latency regression, a double-charge bug, a memory leak, a flaky CI suite, a
  // table split) — systems/reliability engineering scenarios, not algorithm or syntax questions —
  // and `math`'s are all real-world word problems (mortgage amortization, related rates, Bayesian
  // defect rates, least-squares fit, a perpetuity) worked through to a numeric answer, the pattern
  // "applied math" names — never an abstract proof or symbolic exercise. Only this label changed;
  // `code`/`math` stay the internal keys everywhere (data lookups, CSS data attributes, URLs).
  code: 'Software Engineering',
  math: 'Applied Math',
  biomedical: 'Biomedical',
  legal: 'Legal',
  creative_writing: 'Creative writing',
  conversational: 'Conversational',
};

/** The six real categories, in the data's own order. */
export const CATEGORIES = [
  'code',
  'math',
  'biomedical',
  'legal',
  'creative_writing',
  'conversational',
];
