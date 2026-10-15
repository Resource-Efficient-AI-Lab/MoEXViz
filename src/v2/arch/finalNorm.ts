import type { PromptFlow } from './types.ts';
import { FINAL_NORM_CHECKPOINTS, type FinalNormCheckpoint } from './finalNormWeights.ts';

export interface FinalNormData {
  layerIndex: number;
  input: number[][];
  combinedOutput: number[][];
  weight: number[];
  output: number[][];
  checkpoint: FinalNormCheckpoint;
}

export type FinalNormResult =
  | { data: FinalNormData; error?: never }
  | { data: null; error: string };

function vector(value: unknown, width: number, name: string): number[] {
  if (!Array.isArray(value) || value.length !== width || value.some((cell) => typeof cell !== 'number' || !Number.isFinite(cell))) {
    throw new Error('Missing or invalid ' + name + '.');
  }
  return value;
}

function matrix(value: unknown, rows: number, width: number, name: string): number[][] {
  if (!Array.isArray(value) || value.length !== rows) throw new Error('Missing or invalid ' + name + '.');
  value.forEach((row, index) => vector(row, width, name + ' row ' + index));
  return value;
}

/**
 * The final saved layer_output is outputs.hidden_states[-1]: the output AFTER
 * model.norm, not the final block's residual sum. The saved last moe_output was
 * obtained by subtracting after_attn_residual from that normalized state, so it
 * also crosses this boundary and cannot supply the final feed-forward output.
 *
 * Reconstruct the pre-norm stream from saved full-dimensional expert computations
 * that were subsequently bucketed, and the saved post-attention residual. Taking
 * bucket means commutes with the weighted sum, although stored rounding and the
 * CPU-float32 expert replay limit agreement with the original execution. DeepSeek
 * adds its shared experts; JetMoE normalizes the selected gates and adds mlp.bias.
 * Keep full-softmax routing probabilities in the trace unchanged for other views.
 *
 * Use the recorded normalized output directly. RMS and x * gamma cannot be
 * recovered from separate bucket means, so no RMS scalars or new y are computed.
 * This always reads the final layer, independent of the selected explorer layer.
 */
export function buildFinalNormData(flow: PromptFlow): FinalNormResult {
  try {
    const checkpoint = FINAL_NORM_CHECKPOINTS.find((entry) => entry.modelId === flow.model_id);
    if (!checkpoint || checkpoint.hiddenSize !== flow.hidden_size) throw new Error('Final RMSNorm weights are unavailable for this model.');
    const layerIndex = flow.num_layers - 1;
    const layer = flow.layer_flow.per_layer[layerIndex];
    const routes = flow.layers[layerIndex]?.tokens;
    const rows = flow.tokens.length, width = checkpoint.bucketCount;
    if (!layer || !routes || routes.length !== rows) throw new Error('Final-layer routing data is unavailable.');
    const residual = matrix(layer.after_attn_residual, rows, width, 'final post-attention residual');
    const output = matrix(layer.layer_output, rows, width, 'final normalized output');
    const weight = vector(checkpoint.normWeight.values, width, 'final RMSNorm gains');
    const bias = checkpoint.outputBias ? vector(checkpoint.outputBias.values, width, 'final feed-forward bias') : null;
    const combinedOutput = routes.map((route, tokenIndex) => {
      const count = route.top_experts?.length;
      if (!count || count !== flow.top_k_experts || route.top_weights?.length !== count) throw new Error('Final-layer selected experts are unavailable.');
      const probabilities = vector(route.top_weights, count, 'selected routing probabilities');
      if (probabilities.some((p) => p < 0)) throw new Error('Invalid selected routing probabilities.');
      const sum = probabilities.reduce((total, p) => total + p, 0);
      if (sum <= 0) throw new Error('Invalid selected routing probability sum.');
      const divisor = checkpoint.selectedGateNormalization === 'sum' ? sum : 1;
      const combined = bias ? [...bias] : Array<number>(width).fill(0);
      route.top_experts.forEach((expert, k) => {
        if (!Number.isInteger(expert) || expert < 0 || expert >= flow.num_experts) throw new Error('Invalid selected expert index.');
        const expertOutput = vector(flow.expert_outputs[tokenIndex + '_' + layerIndex + '_' + expert], width, 'selected expert output');
        const gate = probabilities[k] / divisor;
        expertOutput.forEach((cell, column) => { combined[column] += gate * cell; });
      });
      if (flow.shared_experts) {
        const shared = vector(flow.shared_expert_outputs?.[tokenIndex + '_' + layerIndex], width, 'shared expert output');
        shared.forEach((cell, column) => { combined[column] += cell; });
      }
      return combined;
    });
    const input = residual.map((row, tokenIndex) => row.map((cell, column) => cell + combinedOutput[tokenIndex][column]));
    return { data: { layerIndex, input, combinedOutput, weight, output, checkpoint } };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Final RMSNorm data is unavailable.' };
  }
}

/** Keep the last residual-add and combined-output views on the same side of norm. */
export function layerFeedForwardGrids(flow: PromptFlow, layerIndex: number, finalNorm: FinalNormData | null): { combinedOutput: number[][]; output: number[][] } | null {
  if (layerIndex === flow.num_layers - 1) {
    return finalNorm ? { combinedOutput: finalNorm.combinedOutput, output: finalNorm.input } : null;
  }
  const layer = flow.layer_flow.per_layer[layerIndex];
  return layer ? { combinedOutput: layer.moe_output, output: layer.layer_output } : null;
}
