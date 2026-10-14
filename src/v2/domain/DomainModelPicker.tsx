import { DOMAIN_MODELS, type DomainModelKey } from './models';

interface DomainModelPickerProps {
  modelKey: DomainModelKey;
  onModelChange: (key: DomainModelKey) => void;
  /** Non-primary models currently shown as extra columns, in column order. */
  compareKeys: DomainModelKey[];
  onToggleCompare: (key: DomainModelKey) => void;
  /** Models that cannot be added right now: the layer on screen does not exist for them (it is a
   *  dense feed-forward layer there). Already-added models are never blocked, so they stay
   *  removable. */
  blockedKeys: DomainModelKey[];
}

/**
 * The Domain Specialization tab's Model dropdown. Rendered by MoeApp *above* the top-tab bar (not
 * inside the tab panel), mirroring ArchPromptPicker: the reader picks what they're looking at
 * before picking which view of it they want.
 *
 * Beside it, one toggle per model that is *not* the dropdown's selection: clicking one adds that
 * model as a side-by-side column in every sub-tab except Prompts, clicking it again removes it.
 * The dropdown's own model is never offered as a button (it is always shown), so the set of
 * buttons re-derives from the dropdown value.
 *
 * The prototype's "Expert specialization by domain" `<h2>` sat beside the dropdown here and was
 * removed 2026-08-02 by request — a deliberate divergence from `index_v2.html` (line 554), so keep
 * it out when diffing. The tab bar's own "Domain Specialization" label already names the panel,
 * and the sub-tab bar directly below names the view.
 */
export function DomainModelPicker({
  modelKey,
  onModelChange,
  compareKeys,
  onToggleCompare,
  blockedKeys,
}: DomainModelPickerProps) {
  const others = DOMAIN_MODELS.filter((m) => m.key !== modelKey);

  return (
    <div className="prompt-picker">
      <label htmlFor="domain-model-select">Model</label>
      <select
        id="domain-model-select"
        style={{ minWidth: 190, fontWeight: 700 }}
        value={modelKey}
        onChange={(e) => onModelChange(e.target.value as DomainModelKey)}
      >
        {DOMAIN_MODELS.map((m) => (
          <option key={m.key} value={m.key}>
            {m.label}
          </option>
        ))}
      </select>

      <span className="domain-compare-label">Compare with:</span>
      {others.map((m) => {
        const on = compareKeys.includes(m.key);
        const blocked = !on && blockedKeys.includes(m.key);
        // The hint lives on a wrapping span, not the button: a disabled button swallows hover in
        // some browsers, so a `title` on it itself would never show.
        return (
          <span
            key={m.key}
            title={
              blocked
                ? `${m.label} has no layer 1 with experts — its layer 1 is a dense feed-forward layer. Go to layer 2 or later to compare.`
                : undefined
            }
          >
            <button
              type="button"
              className={`domain-compare-btn${on ? ' active' : ''}`}
              aria-pressed={on}
              disabled={blocked}
              onClick={() => onToggleCompare(m.key)}
            >
              {on ? '✓ ' : '+ '}
              {m.label}
            </button>
          </span>
        );
      })}
    </div>
  );
}
