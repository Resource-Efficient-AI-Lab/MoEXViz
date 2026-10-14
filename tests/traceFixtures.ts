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
    'what-is-moe', 'select-sample',
    'embedding', 'embedding-detail', 'norm-attention', 'norm-attention-detail',
    'attention', 'attention-proj', ...(model === 'jetmoe' ? ['attention-route'] : []),
    'attention-map', 'attention-concat', 'residual-attention', 'residual-attention-detail',
    'norm-ffn', 'norm-ffn-detail', ...(model === 'deepseek' ? ['dense', 'dense-detail'] : []),
    'moe', 'router-single', 'router-all', 'expert-router', 'expert-ffn',
    ...(model === 'deepseek' ? ['shared'] : []), 'combined', 'residual-ffn',
    'residual-ffn-detail', 'repeat', 'final-norm', 'final-norm-detail', 'final-output', 'final-output-detail',
  ];
}

/** Agreed numbering, including model-specific substeps and repetition at 9.2. */
export function expectedStepNumbers(model: Model): string[] {
  return [
    '1', '2', '3', '3.1', '4', '4.1',
    '5', '5.1', '5.2', '5.3', ...(model === 'jetmoe' ? ['5.4'] : []),
    '6', '6.1', '7', '7.1',
    '8', '8.1', '8.2', '8.3', '8.4', '8.5', ...(model === 'deepseek' ? ['8.6', '8.7', '8.8'] : []),
    '9', '9.1', '9.2', '10', '10.1', '11', '11.1',
  ];
}
