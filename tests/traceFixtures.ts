import { readFileSync } from 'node:fs';
import type { PromptFlow } from '../src/v2/arch/types';

export type Model = 'olmoe' | 'jetmoe' | 'deepseek';
export function traceFor(model: Model): PromptFlow {
  const path = model === 'olmoe'
    ? 'OLMoE/moe_routing_trace.json'
    : model === 'jetmoe' ? 'JETMoe/jetmoe_routing_trace/prompt-0.json' : 'DeepSeek/deepseek_routing_trace/prompt-0.json';
  const data = JSON.parse(readFileSync(new URL(`../public/data/${path}`, import.meta.url), 'utf8'));
  return model === 'olmoe' ? data.prompts[0] : data;
}

/** Expected user-visible itinerary, independent of the step builder. */
export function expectedStops(model: Model): string[] {
  return [
    'what-is-moe',
    'embedding', 'embedding-detail', 'norm-attention', 'norm-attention-detail',
    'attention', 'attention-proj', ...(model === 'jetmoe' ? ['attention-route'] : []),
    'attention-map', 'attention-concat', 'residual-attention', 'residual-attention-detail',
    'norm-ffn', 'norm-ffn-detail', ...(model === 'deepseek' ? ['dense', 'dense-detail'] : []),
    'moe', 'router-single', 'router-all', 'expert-router', 'expert-ffn',
    ...(model === 'deepseek' ? ['shared'] : []), 'combined', 'residual-ffn',
    'residual-ffn-detail', 'repeat', 'final-norm', 'final-norm-detail', 'final-output', 'final-output-detail',
  ];
}

/** Agreed numbering, including model-specific substeps and repetition at 7.2. */
export function expectedStepNumbers(model: Model): string[] {
  return [
    '0', '1', '1.1', '2', '2.1',
    '3', '3.1', '3.2', '3.3', ...(model === 'jetmoe' ? ['3.4'] : []),
    '4', '4.1', '5', '5.1',
    '6', '6.1', '6.2', '6.3', '6.4', '6.5', ...(model === 'deepseek' ? ['6.6', '6.7', '6.8'] : []),
    '7', '7.1', '7.2', '8', '8.1', '9', '9.1',
  ];
}
