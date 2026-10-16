import { useMemo, useState } from 'react';
import { CATEGORY_LABELS } from '../../data/categories';
import { CATEGORY_PALETTE } from '../../components/ClusterPlot/categoryPalette';
import { firstMoeLayer } from '../../utils/domainStats';
import { useViewportBox } from '../useViewportBox';
import type { DomainSpecializationData } from '../../data/types';

const VIEW_W = 640;
const VIEW_H = 280;
const PAD_L = 40;
const PAD_R = 16;
const PAD_T = 12;
const PAD_B = 40;

interface HoverState {
  category: string;
  layer: number;
  value: number;
  x: number;
  y: number;
}

interface DomainRateChartProps {
  data: DomainSpecializationData;
  activeCategories: Set<string>;
}

/**
 * Sub-tab 2 — domain_rate per toggled category across the model's MoE layers, ported from the
 * prototype's renderLineChart. Dense layers are dropped rather than plotted: their domain_rate is
 * a structural 0, which would draw as a collapse to 0% at the left edge of every line.
 */
export function DomainRateChart({ data, activeCategories }: DomainRateChartProps) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const [chartRef, box] = useViewportBox<HTMLDivElement>();
  // Only the plotting area gains height; labels retain the existing horizontal scale.
  const viewH = box ? Math.max(140, (box.height - box.chrome) * VIEW_W / Math.max(1, box.width - 24)) : VIEW_H;
  const numLayers = data.num_layers;
  const minLayer = firstMoeLayer(data);
  // Real layer indices, so hover labels and axis ticks keep saying what the model calls them.
  const layers = useMemo(
    () => Array.from({ length: numLayers - minLayer }, (_, i) => minLayer + i),
    [numLayers, minLayer]
  );

  const series = useMemo(() => {
    const list: { category: string; values: number[] }[] = [];
    for (const category of data.domains) {
      if (activeCategories.has(category)) list.push({ category, values: data.domain_rate[category] });
    }
    return list;
  }, [data, activeCategories]);

  const yMax = useMemo(() => {
    let max = 0.1;
    series.forEach((s) =>
      layers.forEach((li) => {
        if (s.values[li] > max) max = s.values[li];
      })
    );
    return Math.ceil(max * 12) / 10;
  }, [series, layers]);

  const plotW = VIEW_W - PAD_L - PAD_R;
  const plotH = viewH - PAD_T - PAD_B;
  const lx = (layer: number) =>
    PAD_L + ((layer - minLayer) / Math.max(1, layers.length - 1)) * plotW;
  const ly = (v: number) => PAD_T + plotH - (v / yMax) * plotH;
  const yTicks = [0, yMax / 2, yMax];

  return (
    <div>
      <p className="math-hint" style={{ margin: '0 0 8px' }}>
        Mean activation rate of each category's {data.top_k_experts} most-used experts, by layer —
        how strongly it leans on a small set of specialists as depth grows.
        {minLayer > 0 && (
          <strong>
            {minLayer > 1
              ? ` Layers 1–${minLayer} are dense feed-forward layers with no experts, so the chart starts at layer ${minLayer + 1}.`
              : ' Layer 1 is a dense feed-forward layer with no experts, so the chart starts at layer 2.'}
          </strong>
        )}
      </p>

      <div ref={chartRef} className="domain-rate-chart relative mt-4 rounded-md border border-ink/10 bg-paper p-3">
        <svg
          viewBox={`0 0 ${VIEW_W} ${viewH}`}
          className="w-full"
          role="img"
          aria-label="Domain rate by layer line chart"
          onMouseLeave={() => setHover(null)}
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={PAD_L}
                x2={VIEW_W - PAD_R}
                y1={ly(v)}
                y2={ly(v)}
                stroke="var(--color-ink)"
                strokeOpacity={0.07}
                strokeWidth={1}
              />
              <text
                x={PAD_L - 6}
                y={ly(v) + 4}
                textAnchor="end"
                className="font-label"
                fontSize={11}
                fill="var(--color-muted)"
              >
                {(v * 100).toFixed(0)}%
              </text>
            </g>
          ))}
          {layers
            .filter((li) => layers.length <= 12 || (li - minLayer) % 2 === 0)
            .map((li) => (
              <text
                key={li}
                x={lx(li)}
                y={viewH - PAD_B + 16}
                textAnchor="middle"
                className="font-label"
                fontSize={11}
                fill="var(--color-muted)"
              >
                {li + 1}
              </text>
            ))}
          <text
            x={PAD_L + plotW / 2}
            y={viewH - 4}
            textAnchor="middle"
            className="font-label"
            fontSize={11}
            fill="var(--color-muted)"
          >
            Layer
          </text>
          <text
            x={12}
            y={PAD_T + plotH / 2}
            textAnchor="middle"
            className="font-label"
            fontSize={10}
            fill="var(--color-muted)"
            transform={`rotate(-90 12 ${PAD_T + plotH / 2})`}
          >
            Avg. Activation rate
          </text>

          {series.map(({ category, values }) => {
            const color = CATEGORY_PALETTE[category] ?? 'var(--color-muted)';
            const d = layers
              .map(
                (li, i) =>
                  `${i === 0 ? 'M' : 'L'} ${lx(li).toFixed(2)} ${ly(values[li]).toFixed(2)}`
              )
              .join(' ');
            return (
              <g key={category}>
                <path d={d} fill="none" stroke={color} strokeWidth={2} />
                {layers.map((li) => (
                  <circle
                    key={li}
                    cx={lx(li)}
                    cy={ly(values[li])}
                    r={2.8}
                    fill={color}
                    // WorkedExampleModal's "Show me on the chart" target (see DomainTab.tsx) —
                    // dispatches a real `mousemove` here to pop this same tooltip.
                    data-rate-category={category}
                    data-rate-layer={li}
                    onMouseMove={(e) => {
                      const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                      setHover({
                        category,
                        layer: li,
                        value: values[li],
                        x: (lx(li) / VIEW_W) * rect.width,
                        y: (ly(values[li]) / viewH) * rect.height,
                      });
                    }}
                    onMouseLeave={() => setHover(null)}
                  />
                ))}
              </g>
            );
          })}
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-md bg-paper p-2.5 shadow-overlay-float"
            style={{ left: hover.x, top: hover.y - 10 }}
            role="tooltip"
          >
            <p className="font-label text-xs text-ink">
              {CATEGORY_LABELS[hover.category] ?? hover.category} · layer {hover.layer + 1}
            </p>
            <p className="mt-0.5 font-body text-sm text-ink">
              rate: {(hover.value * 100).toFixed(2)}%
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
