import { useState } from 'react';
import { DomainCellModal, type DomainCell } from './DomainCellModal';
import { DomainRateChart } from './DomainRateChart';
import { ExpertGridSection } from './ExpertGridSection';
import { HistogramSection } from './HistogramSection';
import { TopExpertsSection } from './TopExpertsSection';
import type { SubTab } from './subTabs';
import type { DomainModelKey } from './models';
import { firstMoeLayer } from '../../utils/domainStats';
import type { DomainSpecializationData, UmapData } from '../../data/types';

/** One extra model shown beside the primary one, as DomainTab fetched it. */
export interface CompareColumnData {
  key: DomainModelKey;
  label: string;
  data: DomainSpecializationData | null;
  loading: boolean;
  error: Error | null;
  umap: UmapData | null;
  umapLoading: boolean;
}

interface ModelPanelProps {
  data: DomainSpecializationData;
  subTab: Exclude<SubTab, 'map' | 'prompts'>;
  viewMode: 'grid' | 'histogram';
  layer: number;
  activeCategories: Set<string>;
  onCellClick: (category: string, expert: number) => void;
  onSpecialistSelect: (category: string, layer: number, expert: number) => void;
  /** Side-by-side column rather than the full panel: single-column layouts, no repeated hint. */
  compact: boolean;
}

/**
 * The chart for sub-tabs 2-4 (rate, histogram/grid, specialists) over one model's data — the same
 * section components the tab always used, just parameterized by `data` so the primary model and
 * each comparison column render through one code path and can't drift apart.
 */
export function ModelPanel({
  data,
  subTab,
  viewMode,
  layer,
  activeCategories,
  onCellClick,
  onSpecialistSelect,
  compact,
}: ModelPanelProps) {
  if (subTab === 'rate') return <DomainRateChart data={data} activeCategories={activeCategories} />;

  if (subTab === 'histogram') {
    // Conditional render, never a CSS hide: ExpertGrid's GSAP pop measures real SVG geometry and
    // would read zero under display:none. It also means the pop replays on every flip back, which
    // is the point of having the two views one click apart.
    return viewMode === 'grid' ? (
      <ExpertGridSection
        data={data}
        activeCategories={activeCategories}
        layer={layer}
        onCellClick={onCellClick}
      />
    ) : (
      <HistogramSection
        data={data}
        activeCategories={activeCategories}
        layer={layer}
        onBarClick={onCellClick}
        compact={compact}
      />
    );
  }

  return <TopExpertsSection data={data} onSelect={onSpecialistSelect} compact={compact} />;
}

interface CompareColumnProps {
  column: CompareColumnData;
  subTab: Exclude<SubTab, 'map' | 'prompts'>;
  viewMode: 'grid' | 'histogram';
  layer: number;
  activeCategories: Set<string>;
}

/**
 * A non-primary model's column. Read-only comparison panel: it owns only its own click-for-numbers
 * pop-up (so a tile clicked here shows *this* model's counts), never the guided tour, Worked
 * Example or "open all categories" window, which describe the primary model.
 */
export function CompareColumn({
  column,
  subTab,
  viewMode,
  layer,
  activeCategories,
}: CompareColumnProps) {
  const [cell, setCell] = useState<DomainCell | null>(null);
  const { data } = column;

  return (
    <div className="domain-compare-col" data-compare-col={column.key}>
      <h4 className="domain-compare-col-title">
        {column.label}
        {data ? ` · ${data.num_experts} experts` : ''}
      </h4>
      {data && subTab === 'histogram' && layer < firstMoeLayer(data) ? (
        // Shared layer is one this model has no experts in (DeepSeek's layer 1 is a dense
        // feed-forward layer) — say so, rather than draw its all-zero arrays as if they were data.
        <p className="math-hint" style={{ margin: 0 }}>
          <strong>
            {column.label} has no experts in layer {layer + 1}
          </strong>{' '}
          — it is a dense feed-forward layer. Go to layer {firstMoeLayer(data) + 1} or later to see
          its experts.
        </p>
      ) : data ? (
        <ModelPanel
          data={data}
          subTab={subTab}
          viewMode={viewMode}
          layer={layer}
          activeCategories={activeCategories}
          onCellClick={(category, expert) => setCell({ category, layer, expert })}
          onSpecialistSelect={(category, selectedLayer, expert) =>
            setCell({ category, layer: selectedLayer, expert })
          }
          compact
        />
      ) : (
        <p className="math-hint" style={{ margin: 0 }}>
          {column.loading
            ? `Loading ${column.label}…`
            : `Failed to load ${column.label}${column.error ? `: ${column.error.message}` : '.'}`}
        </p>
      )}
      {cell && data && <DomainCellModal data={data} cell={cell} onClose={() => setCell(null)} />}
    </div>
  );
}
