import { CATEGORY_LABELS } from '../../data/categories';
import { useLayoutEffect } from 'react';
import { CATEGORY_PALETTE } from '../../components/ClusterPlot/categoryPalette';
import { useViewportBox } from '../useViewportBox';
import type { DomainSpecializationData } from '../../data/types';

interface TopExpertsSectionProps {
  data: DomainSpecializationData;
  /** Jumps the shared layer there and opens DomainCellModal for the exact numbers. */
  onSelect: (category: string, layer: number, expert: number) => void;
  /** One of several side-by-side model columns: a single column of category cards and no hint
   *  (the shared one above the columns covers it). The default grid's `sm:`/`lg:` breakpoints key
   *  off the viewport, not the column, so they would still try three-wide inside a narrow column. */
  compact?: boolean;
}

/**
 * Sub-tab 5 — each category's top 8 (layer, expert) pairs by raw activation_rate, ranked
 * directly (no baseline comparison). Not filtered by the shared picker — all six always show.
 */
export function TopExpertsSection({ data, onSelect, compact = false }: TopExpertsSectionProps) {
  const [gridRef, box] = useViewportBox<HTMLDivElement>(true, true);
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.style.zoom = '';
    grid.style.width = '';
    if (!box) return;
    const fit = (scale: number) => {
      grid.style.zoom = String(scale);
      grid.style.width = `${box.width / scale}px`;
      return grid.getBoundingClientRect().height;
    };
    let low = 0.35, high = box.width / (compact ? 340 : 1100);
    for (let attempt = 0; attempt < 12; attempt++) {
      const candidate = (low + high) / 2;
      if (fit(candidate) <= box.height) low = candidate;
      else high = candidate;
    }
    fit(low);
  }, [box, compact, gridRef]);
  return (
    <div>
      {!compact && (
        <p className="math-hint" style={{ margin: '0 0 8px' }}>
          Each category's 8 highest activation-rate (layer, expert) pairs. Click a row for the
          numbers.
        </p>
      )}

      <div
        ref={gridRef}
        className={`domain-specialists grid grid-cols-1 gap-4 ${compact ? '' : 'mt-4 sm:grid-cols-2 lg:grid-cols-3'}`}
      >
        {data.domains.map((category) => {
          const color = CATEGORY_PALETTE[category] ?? 'var(--color-muted)';
          const label = CATEGORY_LABELS[category] ?? category;
          return (
            <div key={category} className="rounded-md border p-3.5" style={{ borderColor: color }}>
              <h4 className="mb-2 font-title text-sm font-semibold" style={{ color }}>
                {label}
              </h4>
              <div>
                {data.top_specialists[category].slice(0, 8).map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    // Targeted by WorkedExampleModal's "Show me on the chart" (see DomainTab.tsx)
                    // to find and click this exact row for its own fixed demo cell.
                    data-specialist-category={category}
                    data-specialist-layer={s.layer}
                    data-specialist-expert={s.expert}
                    onClick={() => onSelect(category, s.layer, s.expert)}
                    className="flex w-full items-baseline justify-between border-t border-ink/10 py-1.5 font-label text-xs first:border-t-0 hover:bg-surface"
                  >
                    <span className="text-muted">
                      layer {s.layer + 1} · e{s.expert + 1}
                    </span>
                    <span className="font-semibold" style={{ color }}>
                      {(s.activation_rate * 100).toFixed(1)}%
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
