import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTutorial, feedForwardOverview, supportsTutorialView, tutorialViewMatches } from '../src/v2/arch/tutorial.ts';
import { expectedStepNumbers, expectedStops, traceFor, type Model } from './traceFixtures.ts';

for (const model of ['olmoe', 'jetmoe', 'deepseek'] as Model[]) {
  test(`${model}: the shipped trace supports the entire agreed itinerary`, () => {
    const flow = traceFor(model), steps = buildTutorial(flow);
    assert.deepEqual(steps.map((step) => step.id), expectedStops(model));
    assert.equal(new Set(steps.map((step) => step.id)).size, steps.length);
    for (const step of steps) {
      const layer = step.phase === 'final' ? flow.num_layers - 1
        : step.phase === 'routed' ? flow.layers.findIndex((layer) => !!layer.tokens) : 0;
      assert.ok(supportsTutorialView(flow, layer, step.view), `${step.id} must have data at its representative block`);
    }
    const repeated = steps.findIndex((step) => step.id === 'repeat');
    assert.equal(steps[repeated - 1].id, 'residual-ffn-detail');
    assert.equal(steps[repeated + 1].id, 'final-norm');
    assert.deepEqual([...new Set(steps.map((step) => step.block))], [null, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test(`${model}: an unnumbered introduction precedes nine main flow steps`, () => {
    const steps = buildTutorial(traceFor(model));
    assert.deepEqual(steps.map((step) => `${step.mainStep}${step.substep ? `.${step.substep}` : ''}`), expectedStepNumbers(model));
    assert.deepEqual(steps.filter((step) => step.substep === 0).map((step) => step.id), [
      'what-is-moe', 'embedding', 'norm-attention', 'attention',
      'residual-attention', 'norm-ffn', model === 'deepseek' ? 'dense' : 'moe',
      'residual-ffn', 'final-norm', 'final-output',
    ]);
    assert.equal(steps.at(-1)!.mainStep, 9);
    const introduction = steps[0];
    assert.equal(introduction.mainStep, 0);
    assert.equal(steps[1].mainStep, 1);
    assert.equal(steps[1].id, 'embedding');
    assert.equal(introduction.title, 'What is Mixture-of-Experts?');
    assert.match(introduction.text, /Choose a model and sample prompt, or keep the current selections/);
    assert.match(introduction.text, /\*\*feed-forward network \(FFN\)\*\*/);
    assert.match(introduction.text, /outputs of the selected experts are combined, weighted by their router scores/);
  });
}

test('dense block fallback distinguishes the whole Transformer Block from expert/head selection', () => {
  const flow = traceFor('deepseek'), steps = buildTutorial(flow);
  assert.equal(steps[feedForwardOverview(steps, flow, 0)].id, 'dense');
  assert.equal(steps[feedForwardOverview(steps, flow, 1)].id, 'moe');
  for (const view of [{ kind: 'router', tab: 'all-tokens' }, { kind: 'expert', tab: 'expert' }, { kind: 'stage', stageKey: 'shared-experts' }] as const) {
    assert.equal(supportsTutorialView(flow, 0, view), false);
    assert.equal(supportsTutorialView(flow, 1, view), true);
  }
  assert.equal(supportsTutorialView(flow, 1, { kind: 'stage', stageKey: 'dense-ffn' }), false);
  assert.equal(supportsTutorialView(flow, 0, { kind: 'stage', stageKey: 'attn-only', tab: 'map' }), true);
});

test('manual sub-tab matching uses operation and semantic tab names', () => {
  assert.equal(tutorialViewMatches({ kind: 'stage', stageKey: 'attn-only', tab: 'map' }, { kind: 'stage', stageKey: 'attn-only', tab: 'map' }), true);
  assert.equal(tutorialViewMatches({ kind: 'stage', stageKey: 'attn-only', tab: 'map' }, { kind: 'stage', stageKey: 'attn-only', tab: 'concat' }), false);
  assert.equal(tutorialViewMatches({ kind: 'router', tab: 'per-token' }, { kind: 'expert', tab: 'router' }), false);
  assert.equal(tutorialViewMatches({ kind: 'stage', stageKey: 'ln1' }, { kind: 'stage', stageKey: 'ln2' }), false);
});
