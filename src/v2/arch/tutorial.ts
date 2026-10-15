import type { PromptFlow } from './types';

export type TutorialPhase = 'initial' | 'routed' | 'final';
export type TutorialView =
  | { kind: 'intro' }
  | { kind: 'overview' }
  | { kind: 'stage'; stageKey: string; tab?: string }
  | { kind: 'router'; tab: 'per-token' | 'all-tokens' }
  | { kind: 'expert'; tab: 'router' | 'expert' }
  | { kind: 'repeat' };

export interface TutorialStep {
  id: string;
  /** The introduction is unnumbered (0); flow operations are numbered 1–9. */
  mainStep: number;
  /** Zero is the main overview; subsequent views use dotted substep numbers. */
  substep: number;
  block: number | null;
  phase: TutorialPhase;
  title: string;
  text: string;
  view: TutorialView;
}

/** Keep every view as a stop, grouped into one introduction and nine flow blocks. */
export function buildTutorial(flow: PromptFlow): TutorialStep[] {
  const steps: TutorialStep[] = [];
  const add = (id: string, block: number | null, phase: TutorialPhase, title: string, text: string, view: TutorialView) => {
    const previous = steps.at(-1);
    const mainStep = view.kind === 'intro' ? 0 : previous && block !== null && previous.block === block
      ? previous.mainStep : (previous?.mainStep ?? 0) + 1;
    const substep = previous && mainStep === previous.mainStep ? previous.substep + 1 : 0;
    steps.push({ id, mainStep, substep, block, phase, title, text, view });
  };
  add('what-is-moe', null, 'initial', 'What is Mixture-of-Experts?', '**Mixture of Experts (MoE)** is a neural network architecture that replaces the dense **feed-forward network (FFN)** layer in a Transformer with a collection of independent sub-networks called **experts**. A small learned **router** (or gating network) scores every expert for each token and sends the token to only the **top-k** highest-scoring ones, typically 2 to 8 out of dozens or hundreds. The outputs of the selected experts are combined, weighted by their router scores. Because only a **small subset of experts is active per token**, the compute per token is a fraction of that of a dense model with the same total parameter count. This **sparse activation** lets language models scale to hundreds of billions of parameters while keeping inference cost close to that of a much smaller model. Choose a model and sample prompt, or keep the current selections.', { kind: 'intro' });
  const pair = (id: string, block: number, title: string, text: string, stageKey: string) => {
    add(id, block, 'initial', title, text, { kind: 'overview' });
    add(`${id}-detail`, block, 'initial', title, '', { kind: 'stage', stageKey });
  };
  pair('embedding', 0, 'Embedding', `A token is a small piece of text, often a word or part of one. Each piece becomes a vector of ${flow.hidden_size} numbers. Next opens the selected piece’s embedding.`, 'embed');
  pair('norm-attention', 1, 'RMSNorm before Attention', 'Normalize a copy of each token’s vector. Attention reads this copy while the original residual stream continues alongside it.', 'ln1');
  const attentionOverview = flow.layer_flow.is_moa && flow.attention_routing
    ? `JetMoE uses Mixture-of-Attention: a router selects ${flow.attention_routing.top_k} of ${flow.attention_routing.num_experts} attention experts for each token. Each selected expert gathers context from earlier tokens and itself, and their outputs are combined using the router’s weights.`
    : 'Attention combines information from earlier tokens. Next takes you through its sub-tabs; you can also select the tabs and attention heads yourself.';
  add('attention', 2, 'initial', 'Attention', attentionOverview, { kind: 'overview' });
  const attentionTabs = [
    ['proj', 'Project to Q/K/V'],
    ...(flow.layer_flow.is_moa && flow.attention_routing ? [['route', 'Expert routing']] : []),
    ['map', 'Attention Map'], ['concat', 'Concatenate & project'],
  ];
  attentionTabs.forEach(([tab, title]) => add(`attention-${tab}`, 2, 'initial', `Attention · ${title}`, '', { kind: 'stage', stageKey: 'attn-only', tab }));
  pair('residual-attention', 3, 'Residual after Attention', 'Add Attention’s contribution back to the stream it read. The result keeps the earlier information as well as the new contribution.', 'add1');
  pair('norm-ffn', 4, 'RMSNorm before the feed-forward operation', 'Normalize another copy, with its own learned gains, before the feed-forward computation.', 'ln2');
  const startsDense = !flow.layers[0]?.tokens;
  if (startsDense) {
    add('dense', 5, 'initial', 'Dense FFN', 'This Transformer Block has one dense feed-forward network. Every token uses it; there is no expert selection here.', { kind: 'overview' });
    add('dense-detail', 5, 'initial', 'Dense FFN · feed-forward computation', '', { kind: 'stage', stageKey: 'dense-ffn' });
  }
  const routedPhase = startsDense ? 'routed' : 'initial';
  if (flow.layers.some((layer) => !!layer.tokens)) {
    add('moe', 5, routedPhase, 'MoE · expert selection', `${startsDense ? 'We now move to the first Transformer Block with routed experts. ' : ''}The router selects ${flow.top_k_experts} of ${flow.num_experts} routed experts for each token. Next opens the Router.`, { kind: 'overview' });
    add('router-single', 5, routedPhase, 'Router · Single token routing', 'Choose a token with the token buttons. The router scores all experts and selects the strongest matches. These weights come from the full softmax and are not rescaled to sum to 100%.', { kind: 'router', tab: 'per-token' });
    add('router-all', 5, routedPhase, 'Router · All tokens routing', 'Each row is a token and each column an expert. Click a row label to isolate or restore it; click a cell to inspect its calculation. Darkness is scaled within each row, so use the percentages to compare rows. Next inspects an active expert for the selected piece.', { kind: 'router', tab: 'all-tokens' });
    add('expert-router', 5, routedPhase, 'Selected expert · Router', 'The hidden vector and router weights produce scores for every expert. Softmax converts the scores to probabilities; the strongest experts are selected.', { kind: 'expert', tab: 'router' });
    add('expert-ffn', 5, routedPhase, 'Selected expert · Expert feed-forward', 'This view shows the selected expert’s computation and its weighted contribution. An expert outside the selected set is skipped; you can inspect those cells manually too.', { kind: 'expert', tab: 'expert' });
    if (flow.shared_experts) add('shared', 5, routedPhase, 'Shared experts', '', { kind: 'stage', stageKey: 'shared-experts' });
    add('combined', 5, routedPhase, 'Combined Weighted Output', '', { kind: 'stage', stageKey: 'moe-combine-all' });
  }
  add('residual-ffn', 6, routedPhase, 'Residual after the feed-forward operation', 'Add the feed-forward contribution back to the residual stream. This becomes the next Transformer Block’s input.', { kind: 'overview' });
  add('residual-ffn-detail', 6, routedPhase, 'Residual after the feed-forward operation', '', { kind: 'stage', stageKey: 'add2' });
  add('repeat', 6, 'final', 'The Transformer Blocks repeat', `The whole Transformer Block card repeats these operations through Block ${flow.num_layers}. We have moved directly to that last card. The model still processed every preceding block in order. Next introduces the operations after the repeated blocks.`, { kind: 'repeat' });
  add('final-norm', 7, 'final', 'Final RMSNorm', `After all ${flow.num_layers} Transformer Blocks, normalize the stream once more with separate learned gains. This operation sits outside the repeating card.`, { kind: 'overview' });
  add('final-norm-detail', 7, 'final', 'Final RMSNorm · conceptual illustration', '', { kind: 'stage', stageKey: 'final-norm' });
  add('final-output', 8, 'final', 'Final Output', 'The model projects the normalized final state into vocabulary scores and applies softmax. Next shows its recorded probabilities for the next token after the complete prompt.', { kind: 'overview' });
  add('final-output-detail', 8, 'final', 'Final Output · next-token predictions', '', { kind: 'stage', stageKey: 'final-output' });
  return steps;
}

export function tutorialViewMatches(a: TutorialView, b: TutorialView): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'stage' && b.kind === 'stage') return a.stageKey === b.stageKey && (a.tab ?? 'proj') === (b.tab ?? 'proj');
  if (a.kind === 'router' && b.kind === 'router') return a.tab === b.tab;
  if (a.kind === 'expert' && b.kind === 'expert') return a.tab === b.tab;
  return true;
}

export function supportsTutorialView(flow: PromptFlow, layer: number, view: TutorialView): boolean {
  const routed = !!flow.layers[layer]?.tokens;
  if (view.kind === 'router' || view.kind === 'expert') return routed;
  if (view.kind !== 'stage') return true;
  if (view.stageKey === 'dense-ffn') return !routed && !!flow.dense_ffn?.[layer];
  if (view.stageKey === 'shared-experts') return routed && !!flow.shared_expert_weights?.[layer];
  if (view.stageKey === 'moe-combine-all') return routed;
  return true;
}

export function feedForwardOverview(steps: TutorialStep[], flow: PromptFlow, layer: number): number {
  const id = flow.layers[layer]?.tokens ? 'moe' : 'dense';
  const index = steps.findIndex((step) => step.id === id);
  return index >= 0 ? index : steps.findIndex((step) => step.block === 5 && step.view.kind === 'overview');
}

/** Extract only prose from the visible sub-tab. Legends and equations stay beside the diagram.
 *  Check ancestors' inline display: the prose itself is hidden by tutorial CSS. */
export function visibleGuideProse(content: HTMLElement): string {
  return [...content.querySelectorAll<HTMLElement>('.math-hint')].filter((hint) => {
    for (let parent = hint.parentElement; parent && parent !== content; parent = parent.parentElement) {
      if (parent.style.display === 'none') return false;
    }
    return true;
  }).map((hint) => `<p>${hint.innerHTML}</p>`).join('');
}
