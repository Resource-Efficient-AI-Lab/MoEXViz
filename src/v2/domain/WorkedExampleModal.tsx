import { useEffect } from 'react';
import { CATEGORY_LABELS } from '../../data/categories';
import { CATEGORY_COLOR_NAMES } from '../../components/ClusterPlot/categoryPalette';
import { cellMetrics, topKExperts, tokensForExpert } from '../../utils/domainStats';
import { SUB_TABS, type SubTab } from './subTabs';
import { useDraggable } from '../useDraggable';
import type { DomainCell } from './DomainCellModal';
import type { DomainSpecializationData, UmapData } from '../../data/types';

interface WorkedExampleModalProps {
  data: DomainSpecializationData;
  umap: UmapData | null;
  subTab: SubTab;
  /** The same representative (category, layer, expert) the guided tour's 'cell' steps use (see
   *  DomainTab's own `demoCell`) — one fixed, real example shared across both features, rather
   *  than a second arbitrary pick that could show a near-empty cell the tour's doesn't. */
  demoCell: DomainCell;
  /** Points the shared ghost animation at the real mark this example describes and either clicks
   *  it (histogram, specialists — opens the same pop-up this card already walked through) or
   *  hovers it (map, rate — both hover-only charts). `null` when this sub-tab has no one mark to
   *  point at (Prompts) — the button is hidden rather than shown disabled. */
  onShowOnChart: (() => void) | null;
  onClose: () => void;
}

/**
 * "Σ Worked example" — works one of the paper's §4.4 formulas end to end with this model's own
 * real numbers, for whichever sub-tab is currently open. Unlike DomainCellModal (which answers
 * "what is this cell I just clicked"), nothing here is clicked first: it exists so a reader can
 * see the arithmetic before they've clicked anything at all. Pinned to `demoCell` rather than the
 * sub-tab's own live layer/category selection so the example a reader works through here is the
 * same one every time, including across sub-tabs that aren't connected to the shared layer
 * (Experts UMAP, Top experts per category).
 *
 * Reached only from the guided tour's own "Σ Worked example" button, one sub-tab's step at a time
 * (see DomainTab.tsx) — it used to also be a standalone button with its own Back/Next across all
 * five sub-tabs, but that gave the reader two separate, overlapping ways to page through the same
 * five steps (its own Back/Next here, the tour's Back/Next on the card underneath); removed
 * 2026-10-10 in favor of the tour being the one place that drives sub-tab-to-sub-tab navigation.
 *
 * Floats bottom-right and is draggable, reusing the guided tour's own `.tour-overlay`/`.tour-card`
 * CSS (see DomainTab.tsx) rather than a centered, backdrop-blocking dialog: a reference card the
 * reader keeps open alongside the chart it explains shouldn't dim or block that chart the way a
 * modal does. Its own drag offset, not DomainTab's `tourDrag` — this card and the tour card can be
 * open at the same time (that's exactly the moment the tour card hides itself; see
 * reopenTourOnWorkedExampleClose), and dragging one must never move the other.
 */
export function WorkedExampleModal({
  data,
  umap,
  subTab,
  demoCell,
  onShowOnChart,
  onClose,
}: WorkedExampleModalProps) {
  const drag = useDraggable();

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const { category, layer, expert } = demoCell;
  const label = CATEGORY_LABELS[category] ?? category;
  const title = SUB_TABS.find((t) => t.id === subTab)?.label ?? subTab;

  return (
    <div className="tour-overlay tour-overlay-br open">
      <div
        className="tour-card tour-card-draggable max-h-[70vh] overflow-y-auto"
        style={{
          transform: `translate(${drag.offset.x}px, ${drag.offset.y}px)`,
          touchAction: 'none',
        }}
        role="dialog"
        aria-label={`Worked example: ${title}`}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerUp}
      >
        <div className="flex items-start justify-between gap-3">
          <h3>Worked example — {title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-sm p-1 font-body text-sm text-muted hover:bg-surface hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-2 font-body text-sm leading-relaxed text-ink">
          {subTab === 'map' && <UmapExample data={data} umap={umap} layer={layer} expert={expert} />}
          {subTab === 'rate' && <RateExample data={data} category={category} layer={layer} label={label} />}
          {subTab === 'histogram' && <HistogramExample data={data} category={category} layer={layer} expert={expert} label={label} />}
          {subTab === 'specialists' && <SpecialistsExample data={data} category={category} label={label} />}
          {subTab === 'prompts' && <PromptsExample data={data} category={category} label={label} />}
        </div>

        <div className="tour-controls domain-tour-controls">
          {/* Same action as the ✕ in the header — onClose already reopens the guided tour card at
              this exact step (see reopenTourOnWorkedExampleClose in DomainTab.tsx), since that
              tour button is this card's only entry point. Spelled out as its own button, not just
              the corner ✕, so the way back is as visible as the tour card's own "Exit tour". */}
          <button type="button" className="play-btn" onClick={onClose}>
            ‹ Back to tour
          </button>
          {onShowOnChart && (
            <button type="button" className="play-btn" onClick={onShowOnChart}>
              ▶ Highlight it on the chart
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function UmapExample({
  data,
  umap,
  layer,
  expert,
}: {
  data: DomainSpecializationData;
  umap: UmapData | null;
  layer: number;
  expert: number;
}) {
  const point = umap?.points.find((p) => p.layer_id === layer && p.expert_id === expert);
  const vector = data.domains.map((d) => ({
    domain: d,
    label: CATEGORY_LABELS[d] ?? d,
    rate: data.activation_rate[d][layer][expert] * 100,
  }));
  const dominant = vector.reduce((a, b) => (b.rate > a.rate ? b : a));

  return (
    <>
      <p className="font-semibold">
        Take one real (layer, expert) pair — layer {layer + 1}, expert #{expert + 1}. Its
        activation rate against all six domains is a vector{' '}
        <code>v(l, e)</code> — one per expert e in layer l:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        {vector.map((v) => (
          <li key={v.domain}>
            {v.label}: <span className="font-label font-semibold">{v.rate.toFixed(2)}%</span>
          </li>
        ))}
      </ul>
      <p className="mt-3">
        v({layer + 1}, {expert + 1}) = (
        {vector.map((v) => v.rate.toFixed(1)).join(', ')}) — six numbers, one per domain.
      </p>
      {point ? (
        <p className="mt-2">
          UMAP compresses that 6-dimensional vector down to the one 2D point you see on the plot:{' '}
          <span className="font-label font-semibold">
            (x = {point.x.toFixed(2)}, y = {point.y.toFixed(2)})
          </span>
          . It's colored{' '}
          <span className="font-semibold">
            {CATEGORY_COLOR_NAMES[dominant.domain] ?? 'its'} ({dominant.label})
          </span>{' '}
          because {dominant.label} has the highest value in the vector above — the point's
          dominant domain.
        </p>
      ) : (
        <p className="mt-2 text-muted">
          (The UMAP projection for this exact pair hasn't loaded yet — open the Experts UMAP
          sub-tab once to fetch it.)
        </p>
      )}
    </>
  );
}

function RateExample({
  data,
  category,
  layer,
  label,
}: {
  data: DomainSpecializationData;
  category: string;
  layer: number;
  label: string;
}) {
  const k = data.top_k_experts;
  const topExperts = topKExperts(data.activation_rate[category][layer], k);
  const rates = topExperts.map((e) => data.activation_rate[category][layer][e] * 100);
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;

  return (
    <>
      <p className="font-semibold">
        {label}'s top-{k} most-used experts at layer {layer + 1}, by activation rate:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        {topExperts.map((e, i) => (
          <li key={e}>
            expert #{e + 1}: <span className="font-label font-semibold">{rates[i].toFixed(2)}%</span>
          </li>
        ))}
      </ul>
      <p className="mt-3">
        Average rate = ({rates.map((r) => r.toFixed(1)).join(' + ')}) ÷ {k} ={' '}
        <span className="font-label font-semibold">{mean.toFixed(2)}%</span>
      </p>
      <p className="mt-2 text-muted">
        That's the value plotted on {label}'s line at layer {layer + 1} — the mean of just its
        own top-{k} experts, never all {data.num_experts}.
      </p>
    </>
  );
}

function HistogramExample({
  data,
  category,
  layer,
  expert,
  label,
}: {
  data: DomainSpecializationData;
  category: string;
  layer: number;
  expert: number;
  label: string;
}) {
  const { total, count, rate, normalized, avgProb, specScore, fold } = cellMetrics(data, category, layer, expert);
  // The same real, score-ranked tokens the hover tooltip and DomainCellModal both read off this
  // exact cell — quoted here rather than asserted about, so the "what is it actually keying on"
  // claim below stays true to whatever this model and data file actually show, not a guess at
  // what a "math expert" should look like.
  const topTokens = tokensForExpert(data, category, layer, expert, 3).map((t) => t.token.trim());

  return (
    <>
      <p className="font-semibold">
        {label} at layer {layer + 1}, expert #{expert + 1} — {count} of {total} tokens chose it:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        <li>
          activation rate = hits ÷ total = {count} ÷ {total} ={' '}
          <span className="font-label font-semibold">{(rate * 100).toFixed(2)}%</span>
        </li>
        <li>
          normalized rate = activation rate ÷ top-{data.top_k_experts} ={' '}
          <span className="font-label font-semibold">{normalized.toFixed(2)}%</span>
        </li>
        <li>
          avg. softmax probability ={' '}
          <span className="font-label font-semibold">{avgProb.toFixed(2)}%</span>
        </li>
        <li>
          specialization score = log₂[(rate + ε) ÷ (6-domain average + ε)], ε = 0.0001 ={' '}
          <span className="font-label font-semibold">{specScore.toFixed(3)}</span>, shown as{' '}
          <span className="font-label font-semibold">{fold.toFixed(2)}×</span> the average
        </li>
      </ul>
      {topTokens.length > 0 && (
        <>
          <p className="mt-3">
            <span className="font-bold">Takeaway:</span> a high specialization score alone doesn't
            prove this expert has "learned" {label} — check the actual tokens it handles by
            highlighting it on the chart. If it is a {label} specialist, then pruning it, shrinking it
            (quantizing), or sending its traffic elsewhere should mainly hurt {label} — not every
            category equally.
          </p>
          <p className="mt-2">
            That {fold.toFixed(2)}× score just means {label} leans on this expert much more than
            other categories do — it doesn't say what the expert is actually doing. The real proof
            is the tokens: clicking the expert shows the 40 real samples routed to it, including{' '}
            <span className="font-label font-semibold">
              {topTokens.map((t) => `"${t}"`).join(', ')}
            </span>
            .
          </p>
        </>
      )}
    </>
  );
}

function SpecialistsExample({
  data,
  category,
  label,
}: {
  data: DomainSpecializationData;
  category: string;
  label: string;
}) {
  const top8 = (data.top_specialists[category] ?? []).slice(0, 8);

  return (
    <>
      <p className="font-semibold">
        {label}'s ranking is just its (layer, expert) pairs sorted by raw activation rate, highest
        first:
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-4">
        {top8.map((s, i) => (
          <li key={i}>
            layer {s.layer + 1}, expert #{s.expert + 1} —{' '}
            <span className="font-label font-semibold">{(s.activation_rate * 100).toFixed(2)}%</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-muted">
        No normalization and no comparison to other domains here — purely "how often did {label}{' '}
        use this expert," which is why it can disagree with the specialization score's ranking.
      </p>
    </>
  );
}

function PromptsExample({
  data,
  category,
  label,
}: {
  data: DomainSpecializationData;
  category: string;
  label: string;
}) {
  const n = data.example_prompts[category]?.length ?? 0;
  const total = data.token_counts[category];

  return (
    <>
      <p className="font-semibold">
        {label} ships {n} prompts. Every one of them is run through the model, and their tokens are
        pooled into a single count:
      </p>
      <p className="mt-2">
        T({label}) = {n} prompts, pooled ={' '}
        <span className="font-label font-semibold">{total.toLocaleString()} tokens</span>
      </p>
      <p className="mt-2 text-muted">
        T({label}) is the denominator in every activation-rate formula on this tab — it's why the
        same expert's rate can shift slightly if the prompt set changes, even when the expert's
        behavior doesn't.
      </p>
    </>
  );
}
