interface LayerSliderProps {
  layer: number;
  numLayers: number;
  /** First layer that routes between experts — 1 for DeepSeek, whose layer 0 is a dense FFN.
   *  Below this the per-expert arrays are all zeros and every view would show fabricated
   *  structure, so the ‹ button simply stops there instead of stepping into it. */
  minLayer?: number;
  /** How many leading layers are dense in the *main* model — the only thing the explanatory note
   *  is about. Separate from `minLayer`, which also rises when a comparison column (DeepSeek) is
   *  added to a model with no dense layers; the note must not appear then. 0 = no note. */
  denseLayers?: number;
  onChange: (layer: number) => void;
}

/**
 * The layer control for the "Experts activation rates per layer" sub-tab. It sits outside that sub-tab's
 * heat-grid/histogram toggle so flipping the view compares the same layer rather than resetting
 * it, and it holds its layer for the Top-experts sub-tab to jump to.
 *
 * A ‹ / › pair either side of the readout, not a `<input type="range">` or a button-per-layer row:
 * reuses `.flow-nav-btn`, the exact pager the Model Architecture tab already steps through its
 * transformer blocks with (see archExplorer.ts's "‹ Transformer Block N of L ›"), so the two
 * layer-at-a-time controls in the app look and behave the same way.
 */
export function LayerSlider({
  layer,
  numLayers,
  minLayer = 0,
  denseLayers = 0,
  onChange,
}: LayerSliderProps) {
  return (
    <div className="layer-bar" style={{ margin: 0 }}>
      <span className="label">Layer</span>
      <button
        type="button"
        className="flow-nav-btn"
        aria-label="Previous layer"
        disabled={layer <= minLayer}
        onClick={() => onChange(layer - 1)}
      >
        ‹
      </button>
      <span className="font-label whitespace-nowrap text-xs text-ink">
        {layer + 1} <span className="text-muted">/ {numLayers}</span>
      </span>
      <button
        type="button"
        className="flow-nav-btn"
        aria-label="Next layer"
        disabled={layer >= numLayers - 1}
        onClick={() => onChange(layer + 1)}
      >
        ›
      </button>
      {denseLayers > 0 && (
        <p
          className="max-w-md font-label text-[0.7rem] font-bold leading-snug text-ink"
          title="Dense layers route every token through one shared feed-forward network, so there are no per-expert rates to show."
        >
          {denseLayers > 1
            ? `Layers 1–${denseLayers} are dense feed-forward layers: no experts, so the pager starts at layer ${denseLayers + 1}.`
            : 'Layer 1 is a dense feed-forward layer: no expert section, so the pager starts at layer 2.'}
        </p>
      )}
    </div>
  );
}
