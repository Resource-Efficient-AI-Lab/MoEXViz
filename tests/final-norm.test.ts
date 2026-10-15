import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFinalNormData, layerFeedForwardGrids } from '../src/v2/arch/finalNorm.ts';
import type { PromptFlow } from '../src/v2/arch/types.ts';
import { traceFor, type Model } from './traceFixtures.ts';

const models: Model[] = ['olmoe', 'jetmoe', 'deepseek'];
const traces = Object.fromEntries(models.map((model) => [model, traceFor(model)])) as Record<Model, PromptFlow>;
const row = (value: number) => Array<number>(20).fill(value);

/** Distinct pre/post-norm values detect accidental reuse of hidden_states[-1]. */
function syntheticFlow(model: Model): PromptFlow {
  const flow = traces[model], last = flow.num_layers - 1;
  return {
    ...flow,
    tokens: [{ index: 0, text: 'test' }],
    top_k_experts: 2,
    layers: flow.layers.map((layer, index) => index === last
      ? { ...layer, tokens: [{ top_experts: [0, 1], top_weights: [0.2, 0.3], all_probs: [] }] }
      : layer),
    expert_outputs: { ['0_' + last + '_0']: row(10), ['0_' + last + '_1']: row(20) },
    shared_expert_outputs: model === 'deepseek' ? { ['0_' + last]: row(4) } : undefined,
    layer_flow: {
      ...flow.layer_flow,
      per_layer: flow.layer_flow.per_layer.map((layer, index) => index === last ? {
        ...layer, after_attn_residual: [row(3)], moe_output: [row(999)], layer_output: [row(41)],
      } : layer),
    },
  };
}

for (const model of models) {
  test(`${model}: reconstructs the final residual using the model's combining rule`, () => {
    const flow = syntheticFlow(model), result = buildFinalNormData(flow);
    assert.ok(result.data, result.error);
    const final = result.data, last = flow.num_layers - 1;
    const expectedWeightedOutput = model === 'jetmoe' ? 16 : 8;
    const expectedSharedOutput = model === 'deepseek' ? 4 : 0;
    for (let column = 0; column < 20; column++) {
      const bias = final.checkpoint.outputBias?.values[column] ?? 0;
      assert.ok(Math.abs(final.combinedOutput[0][column] - expectedWeightedOutput - expectedSharedOutput - bias) < 1e-12);
      assert.ok(Math.abs(final.input[0][column] - expectedWeightedOutput - expectedSharedOutput - bias - 3) < 1e-12);
    }
    assert.equal(final.layerIndex, last);
    assert.equal(final.output, flow.layer_flow.per_layer[last].layer_output, 'retain the recorded post-norm output');
    assert.equal(final.weight, final.checkpoint.normWeight.values, 'use separate checkpoint final gains');
    assert.deepEqual(flow.layers[last].tokens[0].top_weights, [0.2, 0.3], 'leave the raw router probabilities unchanged');
    assert.deepEqual(final.output, [row(41)]);
    assert.notDeepEqual(final.input, final.output);
    assert.notEqual(final.weight, flow.layer_flow.per_layer[last].ln2_weight);
  });

  test(`${model}: the last residual and final norm share one grid; intermediate layers retain their data`, () => {
    const flow = syntheticFlow(model), result = buildFinalNormData(flow);
    assert.ok(result.data, result.error);
    const final = result.data;
    const lastView = layerFeedForwardGrids(flow, flow.num_layers - 1, final)!;
    assert.equal(lastView.output, final.input);
    assert.equal(lastView.combinedOutput, final.combinedOutput);
    for (const layerIndex of [0, 1, flow.num_layers - 2]) {
      const view = layerFeedForwardGrids(flow, layerIndex, final)!;
      assert.equal(view.output, flow.layer_flow.per_layer[layerIndex].layer_output);
      assert.equal(view.combinedOutput, flow.layer_flow.per_layer[layerIndex].moe_output);
    }
    assert.equal(layerFeedForwardGrids(flow, flow.num_layers - 1, null), null, 'never substitute post-norm values for missing pre-norm data');
  });

  test(`${model}: saved final moe_output does not participate in reconstruction`, () => {
    const flow = syntheticFlow(model), first = buildFinalNormData(flow);
    assert.ok(first.data, first.error);
    flow.layer_flow.per_layer[flow.num_layers - 1].moe_output = [row(-12345)];
    const second = buildFinalNormData(flow);
    assert.ok(second.data, second.error);
    assert.deepEqual(second.data.input, first.data.input);
    assert.deepEqual(second.data.combinedOutput, first.data.combinedOutput);
    assert.equal(second.data.output, first.data.output);
  });
}

test('missing tensors fail explicitly instead of inventing grid values', () => {
  const flow = syntheticFlow('olmoe'), last = flow.num_layers - 1;
  delete flow.expert_outputs['0_' + last + '_0'];
  assert.match(buildFinalNormData(flow).error!, /selected expert output/);
  flow.expert_outputs['0_' + last + '_0'] = row(10).slice(1);
  assert.match(buildFinalNormData(flow).error!, /selected expert output/);
  flow.expert_outputs['0_' + last + '_0'] = row(10);
  flow.layer_flow.per_layer[last].layer_output = undefined;
  assert.match(buildFinalNormData(flow).error!, /final normalized output/);
  const shared = syntheticFlow('deepseek');
  shared.shared_expert_outputs = undefined;
  assert.match(buildFinalNormData(shared).error!, /shared expert output/);
  assert.match(buildFinalNormData({ ...syntheticFlow('jetmoe'), model_id: 'unknown' }).error!, /weights are unavailable/);
});

test('invalid gates are rejected and no model execution is needed', () => {
  const flow = syntheticFlow('jetmoe'), last = flow.num_layers - 1;
  for (const gates of [[0, 0], [-0.1, 0.3], [NaN, 0.3]]) {
    flow.layers[last].tokens[0].top_weights = gates;
    assert.equal(buildFinalNormData(flow).data, null);
  }
});

test('all 36 shipped prompts contain the tensors needed for Final RMSNorm', () => {
  for (const model of models) {
    const prompts: PromptFlow[] = model === 'olmoe'
      ? JSON.parse(readFileSync(new URL('../public/data/OLMoE/moe_routing_trace.json', import.meta.url), 'utf8')).prompts
      : Array.from({ length: 12 }, (_, index) => JSON.parse(readFileSync(new URL(
        `../public/data/${model === 'jetmoe' ? 'JETMoe/jetmoe' : 'DeepSeek/deepseek'}_routing_trace/prompt-${index}.json`, import.meta.url), 'utf8')));
    assert.equal(prompts.length, 12);
    prompts.forEach((flow, promptIndex) => {
      const predictions = JSON.stringify(flow.next_token_candidates);
      const rawRoutes = JSON.stringify(flow.layers.at(-1)!.tokens);
      const result = buildFinalNormData(flow);
      assert.ok(result.data, `${model} prompt ${promptIndex}: ${result.error}`);
      const final = result.data;
      assert.equal(final.input.length, flow.tokens.length);
      assert.equal(final.output.length, flow.tokens.length);
      assert.equal(final.weight.length, 20);
      assert.match(final.checkpoint.revision, /^[a-f0-9]{40}$/);
      assert.ok(final.input.flat().every(Number.isFinite));
      assert.ok(final.combinedOutput.flat().every(Number.isFinite));
      assert.equal(final.output, flow.layer_flow.per_layer.at(-1)!.layer_output);
      assert.equal(JSON.stringify(flow.next_token_candidates), predictions);
      assert.equal(JSON.stringify(flow.layers.at(-1)!.tokens), rawRoutes);
    });
  }
});
