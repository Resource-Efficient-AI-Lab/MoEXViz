# MoEViz: A Mixture-of-Experts Visualizer [![MIT license](http://img.shields.io/badge/license-MIT-brightgreen.svg)](http://opensource.org/licenses/MIT)


MoEViz is an interactive visualization tool for learning how Mixture-of-Experts (MoE) language
models work. It runs on real pre-computed routing data from three different MoE models. Every
matrix, weight and expert selection you see is what the model actually did. 



## How to Use

### Quick start

1. Pick a **model** and a **prompt** from the dropdowns at the top.
2. Click **▶ Start tour** for a guided walkthrough of one transformer layer, then use
   **‹ Back** / **Next ›** / **Finish**.
3. Or explore freely: hover a block in the flow row to see what opens, click it for the full math.
4. Switch to **Domain Specialization Analysis** to see which experts specialize in which kind of
   text.

### Model Architecture tab

Shows one transformer layer as a left-to-right flow of blocks, with the real numbers for your prompt.

- **Click any block** (RMSNorm, Attention, Residual, MoE, Final Output) to open its math modal.
  Attention has step tabs (project Q/K/V, attention map, concat heads).
- **The MoE block has two click targets**: *Router (Expert Selection)* opens the Router view,
  *Combined Weighted Output* opens the expert-combination math.
- **Router view**: *Single token routing* shows one token choosing its experts; *All tokens
  routing* is a heatmap of every token against every expert. Page through layers with **Layer
  ‹ ›**, or let **▶ Step through layers** walk the stack for you.
- **‹ ›** beside the layer title moves to the next transformer layer. The card deck behind it is
  the rest of the stack.

### Domain Specialization Analysis tab

Five sub-tabs, all built from routing statistics over six text categories (code, math, biomedical,
legal, creative writing, conversational):

- **Experts UMAP**: every (layer, expert) pair as a dot, colored by its dominant category; toggle
  categories to compare.
- **Avg. Activation rate per layer**: how strongly each category activates experts, layer by layer.
- **Experts activation rates per layer**: the same numbers as a **Heatmap grid** or a
  **Histogram** (switch top right). Histogram bars open a detail modal with real tokens routed to
  that expert; grid cells are hover-only.
- **Top experts per category**: the most specialized experts per category. Click a row for detail.
- **Prompts**: the exact passages the statistics were computed from.


## Models

| Model | Layers | Experts | Top-k | Notes |
|---|---|---|---|---|
| OLMoE-1B-7B | 16 | 64 | 8 | 7B total params, ~1B active per token |
| JetMoE-8B | 24 | 8 | 2 | also routes attention (MoA) |
| DeepSeekMoE-16B | 28 | 64 | 6 | layer 1 is dense, plus 2 shared experts |

## How to run locally

#### Prerequisites

- Node.js v24 or higher
- npm v10 or higher

#### Steps

```bash
git clone https://github.com/Resource-Efficient-AI-Lab/MoEViz.git
cd MoEViz
npm install
npm run dev
```

Then open http://localhost:5173 in your browser.

## License

The software is available under the MIT License.
