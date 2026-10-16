import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useDomainSpecialization } from '../../data/useDomainSpecialization';
import { useDomainUmap } from '../../data/useDomainUmap';
import { CATEGORIES, CATEGORY_LABELS } from '../../data/categories';
import {
  useCategoryMultiSelect,
  CategoryTogglePicker,
} from '../../components/ClusterPlot/CategoryTogglePicker';
import { ClusterPlot } from '../../components/ClusterPlot/ClusterPlot';
import { DomainCellModal, type DomainCell } from './DomainCellModal';
import { WorkedExampleModal } from './WorkedExampleModal';
import { AllCategoriesModal } from './AllCategoriesModal';
import { CompareColumn, ModelPanel, type CompareColumnData } from './DomainCompareColumn';
import { PromptsSection } from './PromptsSection';
import { LayerSlider } from './LayerSlider';
import { SUB_TABS, type SubTab } from './subTabs';
import { useDraggable } from '../useDraggable';
import { useViewportBox } from '../useViewportBox';
import { analyzeUmap, firstMoeLayer, topKExperts, type UmapAnalysis } from '../../utils/domainStats';
import { DOMAIN_MODELS, domainModel, type DomainModelKey } from './models';
import type { DomainSpecializationData, UmapData } from '../../data/types';

/** Friendly name, falling back to the raw key for any category not in CATEGORY_LABELS (there
 *  shouldn't be one, but a label lookup is never worth a crash). */
const labelFor = (category: string): string => CATEGORY_LABELS[category] ?? category;

/** One plain-English sentence stating `analysis`'s actual finding for this model — read by both
 *  the Experts UMAP sub-tab's persistent hint and the guided tour's first step, so the two always
 *  agree instead of one describing the axes in general and the other guessing at an example. */
function umapFindingText(analysis: UmapAnalysis): string {
  const { closestPair, tightest, mostScattered } = analysis;
  const closestSentence = `In this run, ${labelFor(closestPair.a)} and ${labelFor(closestPair.b)} sit closest together on the map — their experts behave the most alike.`;
  // Can only coincide if every category happens to have identical spread — vanishingly unlikely,
  // but a tie here would otherwise read as a contradiction ("X is tightest... X is most scattered").
  if (tightest.category === mostScattered.category) return closestSentence;
  return (
    `${closestSentence} ${labelFor(tightest.category)} forms the tightest cluster — its experts ` +
    `mostly agree on one spot — while ${labelFor(mostScattered.category)} is the most spread out, ` +
    `meaning its tokens don't settle on one consistent set of experts.`
  );
}

/** The two ways sub-tab 3 can draw one category's per-expert activation rates at one layer.
 *  Both read the identical `activation_rate[category][layer]` row, so this is purely a choice
 *  of mark: heat tiles in expert order, or bars. `grid` used to be a sub-tab of its own,
 *  mislabelled "UMAP Expert Grid" (it has never contained a UMAP — that's sub-tab 1). */
type ViewMode = 'grid' | 'histogram';

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: 'grid', label: 'Heatmap grid' },
  { id: 'histogram', label: 'Histogram' },
];

/** Where a reader would actually find `cell` drawn as a real mark on whichever sub-tab is
 *  currently open, for WorkedExampleModal's "Show me on the chart" — 'click' means a genuine
 *  click-through (opens the same pop-up the example already walked through); 'hover' means the
 *  mark itself has no click handler (ClusterPlot's dots, DomainRateChart's points are hover-only
 *  by the same design choice ExpertGrid's cells used to be, before they gained `onCellClick` —
 *  see ExpertGrid.tsx), so the ghost settles there and triggers the same tooltip a real hover
 *  would. `null` for 'prompts': there's no one mark there to point at, just a passage. */
function demoChartSelector(
  subTab: SubTab,
  viewMode: ViewMode,
  cell: DomainCell
): { selector: string; mode: 'click' | 'hover' } | null {
  switch (subTab) {
    case 'histogram': {
      const containerAttr = viewMode === 'histogram' ? 'data-category-chart' : 'data-category-tile';
      return {
        selector: `[${containerAttr}="${cell.category}"] [data-expert-num="${cell.expert}"]`,
        mode: 'click',
      };
    }
    case 'specialists':
      return {
        selector: `[data-specialist-category="${cell.category}"][data-specialist-layer="${cell.layer}"][data-specialist-expert="${cell.expert}"]`,
        mode: 'click',
      };
    case 'map':
      return { selector: `[data-umap-layer="${cell.layer}"][data-umap-expert="${cell.expert}"]`, mode: 'hover' };
    case 'rate':
      return { selector: `[data-rate-category="${cell.category}"][data-rate-layer="${cell.layer}"]`, mode: 'hover' };
    case 'prompts':
      return null;
  }
}

/** Where the guided tour and Worked Example look for the mark they point at. With comparison
 *  columns on screen the same tile/point/row exists once per model, so the lookup is scoped to the
 *  primary model's column (tagged `data-compare-col="primary"`) — the model both features describe.
 *  With a single model there is no tagged column and this is just `document`, as before. */
function primaryColumnRoot(): ParentNode {
  return document.querySelector('[data-compare-col="primary"]') ?? document;
}

/** Among `category`'s own top-ranked specialists, picks whichever sits furthest from the
 *  bottom-right corner of the Experts UMAP plot (smallest x − y: screen-space px grows with x, py
 *  *shrinks* with y, so this is genuinely "away from bottom-right", not just "away from the right
 *  edge") — the corner the floating Worked Example card sits over, so its own representative point
 *  never lands underneath the very card that's explaining it. Falls back to the #1-ranked
 *  specialist (still a real, routed cell) until the UMAP file has loaded, or to expert 0 at the
 *  last layer if `category` has no specialists at all (shouldn't happen for any real category). */
function pickAwayFromCorner(
  data: DomainSpecializationData,
  umap: UmapData | null,
  category: string
): DomainCell {
  const candidates = data.top_specialists[category] ?? [];
  const first = candidates[0];
  if (!first) return { category, layer: data.num_layers - 1, expert: 0 };
  if (!umap) return { category, layer: first.layer, expert: first.expert };
  let best = first;
  let bestScore = Infinity;
  for (const c of candidates) {
    const point = umap.points.find((p) => p.layer_id === c.layer && p.expert_id === c.expert);
    const score = point ? point.x - point.y : Infinity;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return { category, layer: best.layer, expert: best.expert };
}

/** One step per sub-tab PLUS one step per pop-up window, in the order a reader would actually hit
 *  them, so "Guided tour" walks the whole Domain Specialization tab — not just its five sub-tabs,
 *  but the two modals those sub-tabs open (DomainCellModal and AllCategoriesModal), and both of
 *  the heatmap-grid/histogram views the cell modal can be opened from. Mirrors the Architecture
 *  tab's guided tour (see ArchitectureTab.tsx / narration.ts) but drives `subTab`, `viewMode`,
 *  `allOpen` and `cell` instead of the flow-block highlight.
 *  `modal` is undefined for a plain sub-tab step, 'all' to have runTourStep open
 *  AllCategoriesModal, or 'cell' to open DomainCellModal with a representative cell — real from
 *  either `viewMode`, since both the heatmap grid's cells and the Histogram view's bars open it
 *  (see ExpertGrid.tsx's `onCellClick`). Every step with `modal` or `viewMode` set stays on the
 *  'histogram' sub-tab — that's the only sub-tab either pop-up opens from, and the only one with
 *  a grid/histogram choice at all. */
const DOMAIN_TOUR_STEPS: {
  subTab: SubTab;
  title: string;
  text: string;
  modal?: 'cell' | 'all';
  viewMode?: ViewMode;
}[] = [
  {
    subTab: 'map',
    title: 'Experts UMAP',
    // Static fallback for before the UMAP data (and its live analysis) has loaded — see
    // `umapAnalysis` and `tourStepText` below, which override this once it has. Grounded in the
    // paper's own Expert UMAP definition (§4.4): v(l,e), the UMAP call's exact parameters, the
    // all-zero exclusion, and the dominant-domain coloring rule.
    text: 'Toggle categories below to see where each one\u2019s experts land. Each expert e in layer l gets a vector v(l, e): a 6-dimensional activation profile, one value per domain:\n\n\u2022 v(l, e) = (activation_rate for Software Engineering, Applied Math, Biomedical, Legal, Creative Writing, Conversational), all at that one (layer, expert)\n\u2022 Projected to 2D via UMAP \u2014 cosine similarity metric, n_neighbors = 15, min_dist = 0.1\n\u2022 Pairs that never activate on any domain (an all-zero vector) are excluded\n\u2022 Each point is colored by its dominant domain \u2014 whichever of the six has the highest value in its vector\n\nPoints that land close together are experts whose activation pattern is similar across all six domains.',
  },
  {
    subTab: 'rate',
    title: 'Avg. activation rate per layer',
    text: 'Average activation rate per layer(d, l) = the average of activation_rate(d, l, e) over just domain d\u2019s top-k most-used experts e at that layer \u2014 not all experts, only the few it relies on most.\n\n\u2022 Near 100% \u2014 that layer sends almost every one of d\u2019s tokens to that same small crew\n\u2022 Lower \u2014 tokens spread across more experts\n\nCompare the lines across layers to see whether a domain specializes more as the model gets deeper.',
  },
  {
    subTab: 'histogram',
    viewMode: 'grid',
    title: 'Experts activation rates per layer',
    text: 'For a domain d, layer l, expert e:\n\nactivation_rate(d, l, e) = hits(d, l, e) \u00f7 T(d)\n\n\u2022 hits(d, l, e) = how many of domain d\u2019s tokens routed to expert e at layer l\n\u2022 T(d) = total tokens across domain d\u2019s pooled passages\n\nEach tile is one expert, colored by that rate. Ringed tiles are domain d\u2019s top-k most-used experts at this layer. Hover a tile for a quick token preview.',
  },
  {
    subTab: 'histogram',
    viewMode: 'grid',
    modal: 'cell',
    title: 'Expert detail pop-up',
    text: 'Click any tile to open the full breakdown for that (domain, layer, expert) triple:\n\n\u2022 activation rate = hits(d,l,e) \u00f7 T(d)\n\u2022 normalized rate = [activation_rate \u00f7 k] \u00d7 100%, so every expert\u2019s share for that domain sums to 100%\n\u2022 avg. softmax probability = the mean, over all of domain d\u2019s tokens, of the router\u2019s full softmax score for this expert \u2014 whether or not it was actually picked\n\u2022 specialization score = log\u2082[(activation_rate + \u03b5) \u00f7 (avg_rate + \u03b5)], \u03b5 = 0.0001, where avg_rate is the mean activation rate across all six domains for this exact layer + expert \u2014 shown as \u201cN\u00d7 the average\u201d\n\nPlus a sample of the real tokens that routed here (up to 40 shown; the true total is reported separately).',
  },
  {
    subTab: 'histogram',
    viewMode: 'histogram',
    title: 'Histogram view',
    text: 'The same activation_rate(d, l, e) numbers as the heatmap grid, drawn as bars instead of colored tiles:\n\n\u2022 Heatmap \u2014 easier to scan all the experts at a glance\n\u2022 Histogram \u2014 easier to compare exact heights\n\nThe switch in the top-right corner flips between the two any time; the underlying data never changes.',
  },
  {
    subTab: 'histogram',
    viewMode: 'histogram',
    modal: 'cell',
    title: 'Expert detail pop-up, from a bar',
    text: 'Click any bar and you get the identical pop-up you just saw from the heatmap tile \u2014 same formulas, same tokens. The detail view doesn\u2019t care which chart you clicked from, only which (domain, layer, expert) you picked.',
  },
  {
    subTab: 'histogram',
    viewMode: 'histogram',
    modal: 'all',
    title: '\u201cOpen all categories\u201d window',
    text: 'The category pills above only have room for two or three tiles or charts side by side. This opens all six at once, at the same layer, in whichever view (heatmap or histogram) you were just using \u2014 the fastest way to compare a layer across the whole category set.',
  },
  {
    subTab: 'specialists',
    title: 'Top experts per category',
    text: 'top_experts_per_category(d) = the (layer, expert) pairs with the highest activation_rate(d, l, e), sorted descending, top 8 kept.\n\n\u2022 Ranked by raw activation rate only \u2014 no normalization, no baseline comparison\n\u2022 Answers \u201cwhich experts does this domain depend on most, full stop\u201d (unlike the specialization score, which asks whether it uses an expert more than other domains do)\n\nClick a row to jump straight to that pair\u2019s detail pop-up.',
  },
  {
    subTab: 'prompts',
    title: 'Prompts',
    text: 'Five real prompts per domain \u2014 30 total \u2014 pooled together into the T(d) token count every formula in this tab reads from. Every activation rate, every specialization score, every ranking traces back to tokens from these exact passages.',
  },
];

// The shared picker's pill list (sub-tabs 2-3): the six real categories. Sub-tab 1's own
// picker uses CATEGORIES directly.
const SHARED_PICKER_CATEGORIES = CATEGORIES;

interface DomainTabProps {
  syncCategory: string;
  /** Lifted to MoeApp because this tab unmounts on every top-tab switch (see MoeApp.tsx), and
   *  because its dropdown is rendered there — above the top-tab bar (see DomainModelPicker). */
  modelKey: DomainModelKey;
  /** Extra models shown as side-by-side columns beside `modelKey`'s (every sub-tab but Prompts).
   *  At most the two other models; owned by MoeApp for the same unmount reason as `modelKey`. */
  compareKeys: DomainModelKey[];
  /** Tells MoeApp which other models can't be added as a column at the layer now on screen. */
  onBlockedCompareChange: (keys: DomainModelKey[]) => void;
  /** The Experts UMAP sub-tab's own picker, lifted to MoeApp for the same unmount reason: it must
   *  survive both a sub-tab switch (its section unmounts) and a top-tab switch (this whole tab
   *  does), and reset only on a model switch. */
  umapActive: Set<string>;
  onUmapToggle: (category: string) => void;
}

/**
 * The "Domain Specialization" tab: five sub-tabs over one model's domain data — Experts UMAP,
 * Avg. Layers Activation Rates, Experts activation rates per layer, Top experts per category,
 * and Prompts.
 * Sub-tabs 2-3 share one category picker; sub-tab 3 also owns the layer pager and a
 * heat-grid/histogram view toggle; sub-tab 1 keeps its own independent picker; sub-tabs 4-5
 * aren't filtered at all.
 *
 * The Model dropdown (mirroring the Model Architecture tab's) sits above the top-tab bar and is
 * rendered by MoeApp — see DomainModelPicker. All three models ship the same two files from the same six-passage run, so every model gets
 * every sub-tab — see models.ts. Layer/expert/top-k counts differ per model (16×64 top-8,
 * 24×8 top-2, 28×64 top-6) and are read out of the data, never assumed.
 *
 * The whole tab unmounts when the user switches to Model Architecture, so every sub-tab's
 * entrance animation replays on re-open, and the shared picker re-syncs fresh to the Architecture
 * tab's currently-selected prompt's category every time. The Experts UMAP picker is the one
 * exception — it lives in MoeApp and survives that unmount (see `umapActive`).
 */
export function DomainTab({
  syncCategory,
  modelKey,
  compareKeys,
  onBlockedCompareChange,
  umapActive,
  onUmapToggle,
}: DomainTabProps) {
  const { data, loading, error } = useDomainSpecialization(modelKey);
  const [subTab, setSubTab] = useState<SubTab>('map');
  // The comparison columns' data. Exactly two fixed calls (there are only ever two other models),
  // each skipped via `null` when unused — a loop over `compareKeys` would call a varying number of
  // hooks. UMAP files are only fetched while the Experts UMAP sub-tab is the one on screen.
  const compareA = compareKeys[0] ?? null;
  const compareB = compareKeys[1] ?? null;
  const specA = useDomainSpecialization(compareA);
  const specB = useDomainSpecialization(compareB);
  const umapA = useDomainUmap(subTab === 'map' ? compareA : null);
  const umapB = useDomainUmap(subTab === 'map' ? compareB : null);
  const compareColumns: CompareColumnData[] = [
    { key: compareA, spec: specA, umap: umapA },
    { key: compareB, spec: specB, umap: umapB },
  ].flatMap((c) =>
    c.key
      ? [
          {
            key: c.key,
            label: domainModel(c.key).label,
            data: c.spec.data,
            loading: c.spec.loading,
            error: c.spec.error,
            umap: c.umap.data,
            umapLoading: c.umap.loading,
          },
        ]
      : []
  );
  // Lifted out of ExpertsUmapSection (which used to fetch this itself) so the tour's UMAP step can
  // read the same live analysis the sub-tab's own hint text shows — one fetch, one computation,
  // read in two places instead of guessing at copy that might not match what's on screen.
  const { data: umap, loading: umapLoading } = useDomainUmap(modelKey);
  const umapAnalysis = useMemo(() => (umap ? analyzeUmap(umap) : null), [umap]);
  // The one real (category, layer, expert) the guided tour's 'cell' steps, the histogram and
  // specialists sub-tabs' own Worked Example, and DomainCellModal invocations all point at:
  // Software Engineering's most-used expert at the first routed layer (layer 1; DeepSeek's dense
  // layer 1 is skipped by firstMoeLayer). The Experts activation rates tab opens on that same
  // layer, so the example is the tallest, ringed tile on screen. Computed from the data, so it is
  // a real, strongly used expert on every model. Software Engineering is the first category, so
  // its grid/chart card is top-left, away from the card floating over the bottom-right.
  //
  // Experts UMAP and Avg. activation rate per layer get their own representative cell instead
  // (demoCellMap / demoCellRate below) rather than sharing this one: a fixed (layer, expert) has
  // no natural notion of "where on the plot" or "which side of the line chart" it lands, so
  // reusing this one there risked landing exactly under the card that explains it. See
  // `activeDemoCell` for how the three are picked apart by sub-tab.
  const demoCell = useMemo<DomainCell | null>(() => {
    if (!data) return null;
    const layer = firstMoeLayer(data);
    const rates = data.activation_rate['code']?.[layer];
    const expert = rates ? (topKExperts(rates, 1)[0] ?? 0) : 0;
    return { category: 'code', layer, expert };
  }, [data]);
  // Experts UMAP's own representative point — Conversational rather than Math, so every sub-tab
  // isn't showing the same one example, picked the same "furthest from the card" way the shared
  // demoCell itself used to be before it was pinned to a fixed cell (see pickAwayFromCorner).
  const demoCellMap = useMemo<DomainCell | null>(
    () => (data ? pickAwayFromCorner(data, umap, 'conversational') : null),
    [data, umap]
  );
  // Avg. activation rate per layer's own representative cell — same category (Applied Math) as
  // the shared demoCell, but pinned to the chart's own leftmost plotted layer (firstMoeLayer, not
  // literally 0 — DeepSeek's layer 0 is a dense FFN the chart excludes, see firstMoeLayer's own
  // comment) rather than layer 10, so the highlighted dot sits on the chart's left edge, clear of
  // the card that floats over its bottom-right corner. `expert` is unused by RateExample or by
  // demoChartSelector's 'rate' case (both key off category + layer only) — 0 is just a valid index.
  const demoCellRate = useMemo<DomainCell | null>(
    () => (data ? { category: 'math', layer: firstMoeLayer(data), expert: 0 } : null),
    [data]
  );
  // Whichever of the three above actually describes the sub-tab on screen right now — the one
  // thing WorkedExampleModal, "Highlight it on the chart", and the standing demo-highlight ring
  // all need, so each reads this instead of guessing which of demoCell/demoCellMap/demoCellRate
  // applies. A plain ternary over stable (useMemo'd) references, not its own useMemo: its identity
  // only changes when subTab does or one of the three it picks from actually changes, which is
  // exactly the recompute a dependent effect/useMemo wants anyway.
  const activeDemoCell: DomainCell | null =
    subTab === 'map' ? demoCellMap : subTab === 'rate' ? demoCellRate : demoCell;
  // "Σ Worked example" — opened only from the guided tour's own button, one step at a time (no
  // ghost/step sequencing of its own); see WorkedExampleModal and reopenTourOnWorkedExampleClose.
  const [workedExampleOpen, setWorkedExampleOpen] = useState(false);
  // DomainTabBody's imperative handle — see DomainTabBodyHandle's own comment for why this one
  // piece of state has to be reached into rather than lifted like viewMode/allOpen/cell were.
  const domainBodyRef = useRef<DomainTabBodyHandle | null>(null);
  // Lives here rather than in DomainTabBody because the switch it drives is rendered up in the
  // sub-tab bar row (right-aligned), not in the body's control row. Consequence: like `subTab`,
  // it now survives a model switch instead of being reset by the body's `key={modelKey}`.
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  // Same reason as viewMode: the button that opens it sits in this row. The body renders the
  // window itself, since the layer it draws lives down there.
  const [allOpen, setAllOpen] = useState(false);
  // Guided tour over the five sub-tabs plus both pop-ups, started from "Guided tour" in the
  // sub-tab bar row. Lives here, not in DomainTabBody, for the same reason subTab does: it drives
  // the sub-tab bar above the body.
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  // The card's drag offset from its default centered-bottom position, reset whenever a fresh tour
  // starts (see the "Guided tour" button) but kept as-is across Back/Next so dragging it once
  // during a run doesn't snap back on every step. Whole-card-except-buttons handle (see
  // useDraggable), same as WorkedExampleModal's own.
  const tourDrag = useDraggable();
  // The tour card opens by itself, on step 1, each time the reader opens this tab (it unmounts on
  // every top-tab switch, so this runs once per visit) — once the data is there, so the card never
  // sits over a "Loading…" panel. Not re-run on a model switch within the visit: if they exited
  // the tour, a different model shouldn't pop it back open.
  const autoOpenedTour = useRef(false);
  useEffect(() => {
    if (!data || autoOpenedTour.current) return;
    autoOpenedTour.current = true;
    tourDrag.reset();
    setTourOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tourDrag.reset is stable (see useDraggable)
  }, [data]);
  // Lifted out of DomainTabBody (same move as allOpen) so the 'cell' tour step can open
  // DomainCellModal itself, with a representative cell rather than whatever the reader last
  // clicked. Normal clicks (a histogram bar, a specialist row) still just call onSelectCell.
  const [cell, setCell] = useState<DomainCell | null>(null);
  // Set right before showDemoOnChart hides Worked Example to let the real DomainCellModal take its
  // place (see that function's own comment) — a plain ref, not state, since it's read-then-cleared
  // inside a single event handler (onCloseCell below) and never drives a render itself. Without
  // this, closing that pop-up just dropped the reader back to a blank tab with no way back to the
  // card short of re-opening it and re-navigating to the same sub-tab/layer by hand.
  const reopenWorkedExampleOnCellClose = useRef(false);
  // Mirror of the ref above, for the Guided tour's own "Σ Worked example" button: set right before
  // that button hides the tour card to let Worked Example take its place, read-then-cleared when
  // Worked Example's own onClose fires so the tour card comes back at the same step instead of
  // leaving the reader with neither card open. Cleared early by goToSubTab too — Back/Next inside
  // a tour-opened Worked Example already exits the tour on purpose (see goToSubTab's own comment),
  // and a stale `true` here would undo that the moment the reader closes the card.
  const reopenTourOnWorkedExampleClose = useRef(false);
  // The simulated cursor shown just before a step's real effect lands (see runTourStep) — a small
  // ripple over whatever control the reader would actually click to get there themselves. `null`
  // hides it. Screen coordinates (position: fixed), not coordinates relative to the card, since
  // the target is never the card.
  const [tourGhost, setTourGhost] = useState<{ x: number; y: number } | null>(null);
  // True for the ~0.5–0.9s the ghost is playing, so Back/Next/Start can't be mashed into stacking
  // two timers (the second would fire its `apply` over the first's, landing on the wrong step).
  const [tourBusy, setTourBusy] = useState(false);
  const tourTimeoutRef = useRef<number | null>(null);

  const clearTourTimeout = () => {
    if (tourTimeoutRef.current !== null) {
      window.clearTimeout(tourTimeoutRef.current);
      tourTimeoutRef.current = null;
    }
  };

  /** Walks to `step`, first showing a simulated click over whatever control a reader would
   *  actually use to get there from the CURRENT step — found by diffing the destination against
   *  live state, not hardcoded per step, so it works for Back as well as Next and for "Guided tour"
   *  resuming from wherever the reader last left the tab. Falls back to an instant jump when
   *  nothing distinguishes the destination (e.g. Back, which has no "click" of its own) or the
   *  target control isn't on screen (e.g. its category got toggled off) — the tour must never get
   *  stuck waiting for a pointer target that doesn't exist. */
  const runTourStep = (step: number) => {
    const s = DOMAIN_TOUR_STEPS[step];
    const resolvedViewMode = s.viewMode ?? 'grid';

    const apply = () => {
      setTourStep(step);
      setSubTab(s.subTab);
      // Every histogram-sub-tab step explains the demo cell (a tile, a bar, then its pop-up), so
      // put the shared layer pager on that cell's layer — otherwise the pop-up says "layer 14"
      // over a view still showing whatever layer the reader (or the default last layer) left.
      if (s.subTab === 'histogram' && demoCell) domainBodyRef.current?.jumpToLayer(demoCell.layer);
      setViewMode(resolvedViewMode);
      setAllOpen(s.modal === 'all');
      setCell(s.modal === 'cell' ? demoCell : null);
    };

    let selector: string | null = null;
    if (s.subTab !== subTab) {
      selector = `[data-tour-subtab="${s.subTab}"]`;
    } else if (resolvedViewMode !== viewMode) {
      selector = '.domain-view-toggle';
    } else if (s.modal === 'all' && !allOpen) {
      selector = '.open-all-link';
    } else if (s.modal === 'cell' && !cell && demoCell) {
      // Same expert, different container attribute: the heatmap grid tags its tiles
      // `data-category-tile`, the histogram its charts `data-category-chart` (both in the sibling
      // section components), since the same category can be rendered by either depending on
      // `resolvedViewMode`.
      const containerAttr = resolvedViewMode === 'histogram' ? 'data-category-chart' : 'data-category-tile';
      selector = `[${containerAttr}="${demoCell.category}"] [data-expert-num="${demoCell.expert}"]`;
    }

    // Only the tile lookup is a per-column mark; the sub-tab pills, view switch and "open all" link
    // are shared controls outside every column.
    const el = selector
      ? (selector.includes('data-expert-num') ? primaryColumnRoot() : document).querySelector(
          selector
        )
      : null;
    clearTourTimeout();
    if (!el) {
      setTourGhost(null);
      setTourBusy(false);
      apply();
      return;
    }

    const r = el.getBoundingClientRect();
    setTourGhost({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    setTourBusy(true);
    tourTimeoutRef.current = window.setTimeout(() => {
      setTourGhost(null);
      setTourBusy(false);
      apply();
    }, 550);
  };

  /** WorkedExampleModal's own "Show me on the chart" — reuses the tour's ghost/timeout/busy
   *  plumbing purely to avoid a second copy of the same animation code; the two are user-triggered
   *  one at a time; sharing it is safe. Finds the real mark `activeDemoCell` describes on
   *  whichever sub-tab is currently open, points the ghost at it, then either clicks it for real
   *  (histogram, specialists — opens the same pop-up the example already walked through) or
   *  dispatches the hover that would show its tooltip (map, rate — both hover-only, see
   *  demoChartSelector). */
  const showDemoOnChart = () => {
    if (!activeDemoCell) return;
    const target = demoChartSelector(subTab, viewMode, activeDemoCell);
    if (!target) return;

    // The histogram's cell/bar tiles exist at every layer; jumping the shared layer first is what
    // makes clicking one actually open *this* cell's numbers instead of whatever layer was already
    // on screen. React applies it well within the 550ms before the dispatch below fires.
    if (subTab === 'histogram') domainBodyRef.current?.jumpToLayer(activeDemoCell.layer);

    // AllCategoriesModal renders its own copy of the exact same tile (same data-category-tile /
    // data-category-chart / data-expert-num attributes, see its own comment) stacked on top of the
    // sub-tab's single/pair-category view. An unscoped query always finds that other, now-hidden
    // copy first — it comes first in DOM order — and points the ghost at a tile the reader can't
    // actually see behind the open window. Scope to the window's own subtree whenever it's open.
    const searchRoot =
      allOpen && subTab === 'histogram'
        ? (document.querySelector('[data-all-categories-modal]') ?? document)
        : primaryColumnRoot();
    const el = searchRoot.querySelector(target.selector);
    clearTourTimeout();
    if (!el) {
      setTourGhost(null);
      setTourBusy(false);
      return;
    }

    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    setTourGhost({ x: cx, y: cy });
    setTourBusy(true);
    if (target.mode === 'hover') {
      el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: cx, clientY: cy }));
    }
    tourTimeoutRef.current = window.setTimeout(
      () => {
        setTourGhost(null);
        setTourBusy(false);
        // A real DOM click, not a state fake: it runs the tile's/row's own onClick, so the pop-up
        // it opens is the exact one a reader's own click would — including TopExpertsSection's
        // onSelect, which jumps the shared layer on its own for a 'specialists' target. Dispatched
        // rather than `el.click()` because the histogram/grid targets are SVG elements, which have
        // no native `.click()` method.
        if (target.mode === 'click') {
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
          // The card steps aside once the real pop-up it was pointing at is open — the two
          // otherwise stack, and closing the one on top would just hand the reader the exact
          // pop-up this card already walked them through. It comes back once that pop-up is
          // closed (onCloseCell below), rather than leaving the reader stranded with neither.
          setWorkedExampleOpen(false);
          reopenWorkedExampleOnCellClose.current = true;
        }
      },
      target.mode === 'hover' ? 900 : 550
    );
  };

  // Belt-and-suspenders against a step landing after the tab (or the tour) is gone — e.g. the
  // reader switches to Model Architecture mid-animation.
  useEffect(() => clearTourTimeout, []);

  // The persistent half of "Show me on the chart": as soon as Worked Example is open, the real
  // mark it's describing gets a standing `.demo-highlight` ring — no click needed, and it follows
  // the reader from sub-tab to sub-tab (or grid/histogram view) as long as the card stays open.
  // Re-targets instead of just toggling a class in place: `subTab`/`viewMode` changing means the
  // selector itself changed, so the old element (now hidden or unmounted) has to be found again
  // from scratch, which is why this re-runs on each rather than diffing one element's class.
  useEffect(() => {
    if (!workedExampleOpen || !activeDemoCell) return;
    const target = demoChartSelector(subTab, viewMode, activeDemoCell);
    if (!target) return;
    if (subTab === 'histogram') domainBodyRef.current?.jumpToLayer(activeDemoCell.layer);
    // Same AllCategoriesModal duplicate-tile hazard as showDemoOnChart above — scope to it
    // whenever it's open so the standing ring lands on the copy the reader can actually see.
    const searchRoot =
      allOpen && subTab === 'histogram'
        ? (document.querySelector('[data-all-categories-modal]') ?? document)
        : primaryColumnRoot();
    const el = searchRoot.querySelector(target.selector);
    el?.classList.add('demo-highlight');
    return () => {
      el?.classList.remove('demo-highlight');
    };
  }, [workedExampleOpen, subTab, viewMode, activeDemoCell, allOpen]);

  /** The sub-tab bar's own click. Switches to that sub-tab and opens the guided tour on that
   *  sub-tab's first step, so the card explaining the view is always the one on screen — whichever
   *  model is selected, since the tour is model-agnostic. Replaces the earlier behaviour of
   *  dismissing the tour on a manual sub-tab change. Any pending simulated-click timer is dropped
   *  first so it can't fire a stale `apply` after the reader navigated by hand, and the "open all
   *  categories" window, which belongs to the sub-tab being left, is closed. */
  const goToSubTab = (id: SubTab) => {
    clearTourTimeout();
    setTourGhost(null);
    setTourBusy(false);
    reopenTourOnWorkedExampleClose.current = false;
    const step = DOMAIN_TOUR_STEPS.findIndex((st) => st.subTab === id);
    const target = DOMAIN_TOUR_STEPS[step];
    setSubTab(id);
    setAllOpen(false);
    setCell(null);
    setViewMode(target?.viewMode ?? 'grid');
    if (id === 'histogram' && demoCell) domainBodyRef.current?.jumpToLayer(demoCell.layer);
    if (step >= 0) {
      setTourStep(step);
      setTourOpen(true);
    }
  };

  // Switching the main model re-opens the guided tour on the selected sub-tab's own step (the same
  // one clicking that sub-tab shows), so the explanation is always the one for the data now on
  // screen. Skips the first render — opening the tab already starts the tour (see autoOpenedTour).
  const prevModelKey = useRef(modelKey);
  useEffect(() => {
    if (prevModelKey.current === modelKey) return;
    prevModelKey.current = modelKey;
    const step = DOMAIN_TOUR_STEPS.findIndex((st) => st.subTab === subTab);
    if (step < 0) return;
    clearTourTimeout();
    setTourGhost(null);
    setTourBusy(false);
    reopenTourOnWorkedExampleClose.current = false;
    setWorkedExampleOpen(false);
    setAllOpen(false);
    setCell(null);
    setViewMode(DOMAIN_TOUR_STEPS[step].viewMode ?? 'grid');
    setTourStep(step);
    setTourOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on a model change only
  }, [modelKey]);

  return (
    <div className="panel" style={{ paddingLeft: 16, paddingRight: 16 }}>
      {/* The sub-tab bar and the view switch share one row: the switch is pinned to the right
          corner so the pills keep their landmark position on the left. It wraps to its own
          right-aligned line when the pills run out of room.
          `min-h-8` on the pill list, not just on the switch: the switch is 32px and the pills 30px,
          so without it this row would be 2px taller on the one sub-tab that has a switch, and every
          control below it would sit 2px lower there than on the other four. Every control row in
          this tab is pinned to the same 32px band for that reason. */}
      <div
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
        style={{ margin: '4px 0 6px' }}
      >
        <div className="sub-tabs min-h-8 items-center" style={{ margin: 0 }}>
          {SUB_TABS.map((t) => (
            <button
              key={t.id}
              // Also the tour's own target selector (see runTourStep) — real id-like attribute
              // rather than matching on the label text, which is prose and free to reword.
              data-tour-subtab={t.id}
              className={`sub-tab${subTab === t.id ? ' active' : ''}`}
              type="button"
              onClick={() => goToSubTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Right-side group, always rendered (unlike the view-switch alone, which only applies to
            one sub-tab): this is what actually sits at `justify-between`'s right edge, so "Start
            tour" has a landmark position common to all five sub-tabs instead of floating fixed
            over the viewport corner, where the OS Dock can cover it (see .domain-tour-fab's old
            history — don't bring back `position: fixed` here). */}
        <div className="flex min-h-8 items-center gap-3">
          {/* One button, not a pill pair: a second row of .sub-tab pills directly under the
              sub-tab bar would read as more navigation. The visible labels are decorative to
              assistive tech (aria-label wins over content), so it announces as one switch
              rather than as the string "Heatmap grid Histogram". It's named for the state it
              turns on, since a switch has to have an off side and "off" has to mean the
              default view. See `.view-switch` in moe.css.
              Its "Open all categories in one window" partner is NOT stacked under it here — that
              column was 55px tall and pushed this whole row (and every row below it) down on this
              one sub-tab. The link rides the control row instead, right-aligned, which lands it
              directly under the switch anyway. */}
          {subTab === 'histogram' && (
            <button
              type="button"
              role="switch"
              aria-checked={viewMode === 'histogram'}
              aria-label="Histogram view"
              className="view-switch domain-view-toggle"
              data-side={viewMode === 'histogram' ? '1' : '0'}
              onClick={() => setViewMode((v) => (v === 'grid' ? 'histogram' : 'grid'))}
            >
              <span className="view-switch-thumb" aria-hidden="true" />
              {VIEW_MODES.map((v) => (
                <span
                  key={v.id}
                  className={`view-switch-label${viewMode === v.id ? ' active' : ''}`}
                >
                  {v.label}
                </span>
              ))}
            </button>
          )}

          {!(loading || error || !data) && (
            <button
              type="button"
              className="play-btn domain-tour-start-btn"
              // Disabled while the tour card is open — it's already running, and this would only
              // restart it from step 1 underneath the reader.
              disabled={tourBusy || tourOpen}
              onClick={() => {
                tourDrag.reset();
                setTourOpen(true);
                runTourStep(0);
              }}
            >
              ▶ Guided tour
            </button>
          )}
        </div>
      </div>

      {workedExampleOpen && data && activeDemoCell && (
        <WorkedExampleModal
          data={data}
          umap={umap}
          subTab={subTab}
          demoCell={activeDemoCell}
          onShowOnChart={demoChartSelector(subTab, viewMode, activeDemoCell) ? showDemoOnChart : null}
          onClose={() => {
            setWorkedExampleOpen(false);
            if (reopenTourOnWorkedExampleClose.current) {
              reopenTourOnWorkedExampleClose.current = false;
              setTourOpen(true);
            }
          }}
        />
      )}

      {loading || error || !data ? (
        <p className="math-hint" style={{ margin: 0 }}>
          {loading
            ? 'Loading domain specialization data…'
            : `Failed to load domain specialization data${error ? `: ${error.message}` : '.'}`}
        </p>
      ) : (
        <DomainTabBody
          key={modelKey}
          ref={domainBodyRef}
          data={data}
          syncCategory={syncCategory}
          subTab={subTab}
          viewMode={viewMode}
          umap={umap}
          umapLoading={umapLoading}
          umapAnalysis={umapAnalysis}
          umapActive={umapActive}
          onUmapToggle={onUmapToggle}
          allOpen={allOpen}
          onOpenAll={() => setAllOpen(true)}
          onCloseAll={() => setAllOpen(false)}
          cell={cell}
          onSelectCell={(category, layer, expert) => setCell({ category, layer, expert })}
          onCloseCell={() => {
            setCell(null);
            if (reopenWorkedExampleOnCellClose.current) {
              reopenWorkedExampleOnCellClose.current = false;
              setWorkedExampleOpen(true);
            }
          }}
          primaryLabel={domainModel(modelKey).label}
          compare={compareColumns}
          modelKey={modelKey}
          onBlockedCompareChange={onBlockedCompareChange}
        />
      )}

      {/* Rendered above everything, including the tour card (z-index in moe.css), since its
          target can be anywhere on the page the card itself is covering. */}
      {tourGhost && (
        <div
          className="tour-click-ghost"
          style={{ left: tourGhost.x, top: tourGhost.y }}
          aria-hidden="true"
        >
          <span className="tour-click-ghost-ring" />
          <span className="tour-click-ghost-dot" />
        </div>
      )}

      {/* `tour-overlay-br`: this tab's tour starts the card in the bottom-right corner (plain
          `.tour-overlay` — shared with the Architecture tab's — centers it instead). Dragging
          still works the same from there; see tourDrag. */}
      <div className={`tour-overlay tour-overlay-br${tourOpen ? ' open' : ''}`}>
        {/* Draggable: grab anywhere on the card except its buttons and drop it wherever it's
            blocking the view underneath. `touch-action: none` stops touchscreens from scrolling
            the page instead of moving the card mid-drag. */}
        <div
          className="tour-card tour-card-draggable"
          style={{
            transform: `translate(${tourDrag.offset.x}px, ${tourDrag.offset.y}px)`,
            touchAction: 'none',
          }}
          onPointerDown={tourDrag.onPointerDown}
          onPointerMove={tourDrag.onPointerMove}
          onPointerUp={tourDrag.onPointerUp}
          onPointerCancel={tourDrag.onPointerUp}
        >
          <div className="flex items-start justify-between gap-3">
            <h3>{DOMAIN_TOUR_STEPS[tourStep].title}</h3>
            <span aria-hidden="true" title="Drag to move guided tour">⠿</span>
          </div>
          <p>
            {tourStep === 0 && umapAnalysis
              ? `${DOMAIN_TOUR_STEPS[0].text} ${umapFindingText(umapAnalysis)}`
              : DOMAIN_TOUR_STEPS[tourStep].text}
          </p>
          <div className="tour-controls domain-tour-controls">
            <button
              className="play-btn"
              type="button"
              onClick={() => {
                clearTourTimeout();
                setTourGhost(null);
                setTourBusy(false);
                setTourOpen(false);
              }}
            >
              Exit tour
            </button>
            {/* Opens the Worked Example card for whichever sub-tab this step is on — this is its
                only entry point (see WorkedExampleModal's own doc comment for why its old
                standalone button and Back/Next were removed). The tour card steps aside while
                it's open (same step-aside/reopen pattern WorkedExampleModal's own "Highlight it
                on the chart" uses for DomainCellModal) and comes back at this exact step once
                it's closed. */}
            <button
              className="play-btn"
              type="button"
              disabled={tourBusy}
              onClick={() => {
                reopenTourOnWorkedExampleClose.current = true;
                setTourOpen(false);
                setWorkedExampleOpen(true);
              }}
            >
              Σ Worked example
            </button>
            <div style={{ flex: '1 1 auto' }}></div>
            <button
              className="play-btn"
              type="button"
              disabled={tourStep === 0 || tourBusy}
              onClick={() => runTourStep(Math.max(0, tourStep - 1))}
            >
              ‹ Back
            </button>
            <button
              className="play-btn domain-tour-primary-btn"
              type="button"
              disabled={tourBusy}
              onClick={() => {
                if (tourStep < DOMAIN_TOUR_STEPS.length - 1) runTourStep(tourStep + 1);
                else setTourOpen(false);
              }}
            >
              {tourStep === DOMAIN_TOUR_STEPS.length - 1 ? 'Finish' : 'Next ›'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Imperative escape hatch for the one thing a parent outside this tree needs to reach into: the
 *  shared `layer` state is local to DomainTabBody (reset per model by its own `key={modelKey}`,
 *  same reason viewMode/allOpen/cell used to live here before they were lifted — see those
 *  comments), but WorkedExampleModal's "Show me on the chart" (DomainTab.tsx) has to navigate the
 *  Experts activation rates per layer sub-tab to its demo cell's own layer before it can find and
 *  click that cell's real tile. Mirrors the Model Architecture tab's own `archApiRef` pattern
 *  (ArchitectureTab.tsx), just as a plain React ref instead of a vanilla-JS engine's API object. */
export interface DomainTabBodyHandle {
  jumpToLayer: (layer: number) => void;
}

const DomainTabBody = forwardRef<
  DomainTabBodyHandle,
  {
    data: DomainSpecializationData;
    syncCategory: string;
    subTab: SubTab;
    /** Owned by DomainTab, because the switch that sets it lives in the sub-tab bar row. */
    viewMode: ViewMode;
    /** Owned by DomainTab (lifted out of this section — see DomainTab's own comment on the hook
     *  call) so the guided tour's UMAP step can read the exact same live analysis this sub-tab's
     *  hint text shows. */
    umap: UmapData | null;
    umapLoading: boolean;
    umapAnalysis: UmapAnalysis | null;
    /** Owned by MoeApp — it has to outlive this tab's unmount. See DomainTabProps. */
    umapActive: Set<string>;
    onUmapToggle: (category: string) => void;
    /** Likewise: "Open all categories in one window" is opened from this tab's control row. */
    allOpen: boolean;
    onOpenAll: () => void;
    onCloseAll: () => void;
    /** Also owned by DomainTab (same reason as allOpen): the guided tour's 'cell' step opens this
     *  with a representative cell, rather than whatever the reader last clicked. */
    cell: DomainCell | null;
    onSelectCell: (category: string, layer: number, expert: number) => void;
    onCloseCell: () => void;
    /** The dropdown model's name, shown as the first column's title once others are added. */
    primaryLabel: string;
    /** Extra models beside the primary, one side-by-side column each (sub-tabs 1-4 only). */
    compare: CompareColumnData[];
    modelKey: DomainModelKey;
    onBlockedCompareChange: (keys: DomainModelKey[]) => void;
  }
>(function DomainTabBody(
  {
    data,
    syncCategory,
    subTab,
    viewMode,
    umap,
    umapLoading,
    umapAnalysis,
    umapActive,
    onUmapToggle,
    allOpen,
    onOpenAll,
    onCloseAll,
    cell,
    onSelectCell,
    onCloseCell,
    primaryLabel,
    compare,
    modelKey,
    onBlockedCompareChange,
  },
  ref
) {
  // Starts with every category on for these two sub-tabs (as the UMAP sub-tab's own picker now
  // does too) — but unlike that one, this set still collapses to the synced category if the
  // reader picks a different prompt back in the Architecture tab.
  const shared = useCategoryMultiSelect(syncCategory, SHARED_PICKER_CATEGORIES);
  // Opens on the first routed layer (layer 1; the first MoE layer for DeepSeek), where the demo
  // cell for this sub-tab lives.
  const [layerState, setLayer] = useState(() => firstMoeLayer(data));
  // With comparison columns the shared layer's top end narrows to the shallowest model's last
  // layer, so every column always has that layer. The bottom end stays the main model's own: a
  // column whose model has no experts there (DeepSeek's dense layer 1) says so rather than
  // limiting the pager. Derived, not stored, so removing a column gives the reader their old
  // layer back.
  const compareData = compare.flatMap((c) => (c.data ? [c.data] : []));
  const numLayers = Math.min(data.num_layers, ...compareData.map((d) => d.num_layers));
  // Floor is the main model's own first routed layer only — a DeepSeek column (dense layer 1)
  // must not stop the reader paging back to layer 1; that column says so instead (CompareColumn).
  const minLayer = firstMoeLayer(data);
  const layer = Math.min(Math.max(layerState, minLayer), numLayers - 1);
  useImperativeHandle(ref, () => ({ jumpToLayer: setLayer }), []);

  // While the layer pager is on screen (this sub-tab), a model whose layer-`layer` is dense can't
  // be added as a column — adding it would silently push everyone to its first routed layer.
  const blockedKey = DOMAIN_MODELS.filter(
    (m) => m.key !== modelKey && m.firstRoutedLayer > layer
  )
    .map((m) => m.key)
    .join(',');
  const blockedForSubTab = subTab === 'histogram' ? blockedKey : '';
  useEffect(() => {
    onBlockedCompareChange(blockedForSubTab ? (blockedForSubTab.split(',') as DomainModelKey[]) : []);
  }, [blockedForSubTab, onBlockedCompareChange]);
  useEffect(() => () => onBlockedCompareChange([]), [onBlockedCompareChange]);

  const comparing = compare.length > 0;
  const panelSubTab = subTab === 'map' || subTab === 'prompts' ? null : subTab;

  const showsSharedPicker = subTab === 'rate' || subTab === 'histogram';

  return (
    <div>
      {showsSharedPicker &&
        (subTab === 'histogram' ? (
          // Pills, the ‹ layer › pager and the "open all" link on one 32px band — the same band
          // the other sub-tabs' picker rows sit on, so nothing below it shifts when the reader
          // lands here.
          <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            {/* `min-h-8`, not `h-8`: the pills wrap to a second line on narrow viewports and a
                fixed height would clip them. */}
            <div className="flex min-h-8 items-center">
              <CategoryTogglePicker
                categories={SHARED_PICKER_CATEGORIES}
                active={shared.active}
                onToggle={shared.toggle}
              />
            </div>
            <LayerSlider
              layer={layer}
              numLayers={numLayers}
              minLayer={minLayer}
              denseLayers={firstMoeLayer(data)}
              onChange={setLayer}
            />
            {/* Deliberately not a third pill: it opens a window, it doesn't change what the row
                below shows, so it is typed as a quiet link-weight action. `ml-auto` parks it in
                the right corner, directly under the view switch it belongs to. */}
            <button type="button" className="open-all-link ml-auto" onClick={onOpenAll}>
              <span aria-hidden="true">⤢</span> Open all categories in one window
            </button>
          </div>
        ) : (
          <div className="mb-4 flex min-h-8 items-center">
            <CategoryTogglePicker
              categories={SHARED_PICKER_CATEGORIES}
              active={shared.active}
              onToggle={shared.toggle}
            />
          </div>
        ))}

      {subTab === 'map' && (
        <ExpertsUmapSection
          umap={umap}
          loading={umapLoading}
          analysis={umapAnalysis}
          active={umapActive}
          onToggle={onUmapToggle}
          primaryLabel={primaryLabel}
          compare={compare}
        />
      )}

      {panelSubTab && comparing && (
        <>
          {panelSubTab === 'rate' && (
            <p className="math-hint" style={{ margin: '0 0 8px' }}>
              Each chart is scaled to its own model, and the rate averages that model's own top-k
              experts (8, 6 and 2 for OLMoE, DeepSeek and JetMoE) — compare the shape of the
              curves, not their absolute heights.
            </p>
          )}
          {panelSubTab === 'histogram' && viewMode === 'histogram' && (
            <p className="math-hint" style={{ margin: '0 0 8px' }}>
              Activation rate of every expert at layer {layer + 1}, per category — one bar per
              expert, numbered underneath. Click a bar for the numbers.
            </p>
          )}
          {panelSubTab === 'specialists' && (
            <p className="math-hint" style={{ margin: '0 0 8px' }}>
              Each model's own highest activation-rate (layer, expert) pairs per category — click
              a row in any column for that model's exact numbers.
            </p>
          )}
          <div className="domain-compare-row">
            <div className="domain-compare-col" data-compare-col="primary">
              <h4 className="domain-compare-col-title">
                {primaryLabel} · {data.num_experts} experts
              </h4>
              <ModelPanel
                data={data}
                subTab={panelSubTab}
                viewMode={viewMode}
                layer={layer}
                activeCategories={shared.active}
                onCellClick={(category, expert) => onSelectCell(category, layer, expert)}
                onSpecialistSelect={(category, selectedLayer, expert) => {
                  setLayer(selectedLayer);
                  onSelectCell(category, selectedLayer, expert);
                }}
                compact
              />
            </div>
            {compare.map((c) => (
              <CompareColumn
                key={c.key}
                column={c}
                subTab={panelSubTab}
                viewMode={viewMode}
                layer={layer}
                activeCategories={shared.active}
              />
            ))}
          </div>
        </>
      )}

      {panelSubTab && !comparing && (
        <ModelPanel
          data={data}
          subTab={panelSubTab}
          viewMode={viewMode}
          layer={layer}
          activeCategories={shared.active}
          onCellClick={(category, expert) => onSelectCell(category, layer, expert)}
          onSpecialistSelect={(category, selectedLayer, expert) => {
            setLayer(selectedLayer);
            onSelectCell(category, selectedLayer, expert);
          }}
          compact={false}
        />
      )}

      {subTab === 'prompts' && <PromptsSection data={data} />}

      {subTab === 'histogram' && allOpen && (
        <AllCategoriesModal
          data={data}
          layer={layer}
          minLayer={minLayer}
          onLayerChange={setLayer}
          viewMode={viewMode}
          onBarClick={(category, expert) => onSelectCell(category, layer, expert)}
          suppressEscape={cell !== null}
          onClose={onCloseAll}
        />
      )}

      {cell && <DomainCellModal data={data} cell={cell} onClose={onCloseCell} />}
    </div>
  );
});

/** Sub-tab 1 ("Experts UMAP") — the UMAP finale: all (layer, expert) points, colored by dominant
 *  category. Keeps its own independent picker, untouched by the shared one above — but that
 *  picker's state is held by MoeApp, which outlives both this section's unmount on every sub-tab
 *  switch and the whole tab's on every top-tab switch. Reads the same six-passage run as the other
 *  four sub-tabs, so the whole tab describes one measurement.
 *  `umap`/`loading`/`analysis` are owned by DomainTab now, not fetched here — see its own comment
 *  on the hook call — so this hint and the guided tour's first step always agree on the finding. */
function FittedClusterPlot({ umap, active, single }: {
  umap: UmapData;
  active: Set<string>;
  single: boolean;
}) {
  const [ref, box] = useViewportBox<HTMLDivElement>(true, true);
  const maxWidth = box
    ? Math.min(box.width, Math.max(0, box.height - box.chrome) * 640 / 440 + box.inset)
    : undefined;
  return (
    <div ref={ref} className={single ? 'domain-umap-single mx-auto' : undefined} style={{ maxWidth }}>
      <ClusterPlot umap={umap} activeCategories={active} />
    </div>
  );
}

function ExpertsUmapSection({
  umap,
  loading,
  analysis,
  active,
  onToggle,
  primaryLabel,
  compare,
}: {
  umap: UmapData | null;
  loading: boolean;
  analysis: UmapAnalysis | null;
  active: Set<string>;
  onToggle: (category: string) => void;
  primaryLabel: string;
  /** Extra models drawn beside the primary's map, each with its own projection. */
  compare: CompareColumnData[];
}) {
  const comparing = compare.length > 0;
  // The primary's count only, so it's left out once other models (with their own, different
  // pair counts) are on screen rather than implying it applies to every map.
  const pairCount = umap && !comparing ? umap.points.length.toLocaleString() : null;

  const plot = (u: UmapData | null, isLoading: boolean) =>
    u ? (
      <FittedClusterPlot umap={u} active={active} single={!comparing} />
    ) : (
      // Fixed-size placeholder matching ClusterPlot's 640:440 plot so the lazy load doesn't
      // reflow the panel when the data arrives.
      <div className="aspect-[640/440] w-full rounded-md border border-ink/10 bg-surface">
        <div className="flex h-full items-center justify-center">
          <p className="math-hint">
            {isLoading ? 'Loading the experts UMAP…' : 'Experts-UMAP data unavailable.'}
          </p>
        </div>
      </div>
    );

  return (
    <div>
      {/* Picker first, directly under the sub-tab bar, so it lands in the same place as the shared
          picker on sub-tabs 2-3 — the control row is a fixed landmark across the tab, and only the
          copy below it changes. */}
      <div className="mb-4 flex min-h-8 items-center">
        <CategoryTogglePicker categories={CATEGORIES} active={active} onToggle={onToggle} />
      </div>

      <p className="math-hint" style={{ margin: '0 0 8px' }}>
        {pairCount ? `${pairCount} ` : 'Every '}(layer, expert) pairs in 2D — experts with similar
        activation patterns sit close together.{' '}
        {comparing
          ? 'Each model has its own map, so compare how categories group, not positions. '
          : analysis && umapFindingText(analysis)}{' '}
        Hover a dot for details.
      </p>

      {comparing ? (
        <div className="domain-compare-row mt-4">
          <div className="domain-compare-col" data-compare-col="primary">
            <h4 className="domain-compare-col-title">{primaryLabel}</h4>
            {plot(umap, loading)}
          </div>
          {compare.map((c) => (
            <div key={c.key} className="domain-compare-col" data-compare-col={c.key}>
              <h4 className="domain-compare-col-title">{c.label}</h4>
              {plot(c.umap, c.umapLoading)}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4">{plot(umap, loading)}</div>
      )}
    </div>
  );
}
