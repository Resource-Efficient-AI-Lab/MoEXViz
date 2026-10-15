import { test, expect, type Page } from '@playwright/test';
import { expectedStepNumbers, expectedStops, traceFor, type Model } from '../traceFixtures';

const guide = (page: Page) => page.locator('#tour-overlay .tour-card');

test('expert output card stays hidden until the gate and up results finish', async ({ page }) => {
  await load(page, 'olmoe');
  await advanceTo(page, 'expert-router');
  const reveal = await page.evaluate(async () => {
    document.querySelector<HTMLButtonElement>('#tour-next-btn')!.click();
    let initialOpacity: number | undefined;
    let prerequisitesAtReveal: number[] = [];
    const start = performance.now();
    while (performance.now() - start < 6000) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const grid = document.querySelector('#math-subtab-expert [data-diagram]');
      if (!grid) continue;
      const blocks = [...grid.children];
      const opacity = Number(getComputedStyle(blocks[14]).opacity);
      initialOpacity ??= opacity;
      if (opacity > 0.01 && !prerequisitesAtReveal.length) {
        prerequisitesAtReveal = [blocks[4], blocks[9]].map(el => Number(getComputedStyle(el).opacity));
      }
      if (opacity >= 0.999 && prerequisitesAtReveal.length) {
        return { initialOpacity, prerequisitesAtReveal, complete: true, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches };
      }
    }
    return { initialOpacity, prerequisitesAtReveal, complete: false, reduced: false };
  });
  if (!reveal.reduced) expect(reveal.initialOpacity).toBe(0);
  expect(reveal.prerequisitesAtReveal).toEqual([1, 1]);
  expect(reveal.complete).toBe(true);
});

test('architecture computation and router popups drag by their headers', async ({ page }) => {
  await load(page, 'olmoe');
  for (const [step, backdrop, close] of [
    ['embedding-detail', '#math-backdrop', '#math-modal-close'],
    ['router-single', '#moe-grid-backdrop', '#moe-grid-close'],
  ]) {
    await advanceTo(page, step);
    const modal = page.locator(`${backdrop} .math-modal`);
    const header = page.locator(`${backdrop} .math-modal-header`);
    await expect(modal).toBeVisible();
    // Wait out the popup's entrance animation before measuring its position.
    await modal.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
    const before = (await modal.boundingBox())!;
    const handle = (await header.boundingBox())!;
    await page.mouse.move(handle.x + 8, handle.y + 8);
    await page.mouse.down();
    await page.mouse.move(handle.x + 38, handle.y + 33, { steps: 8 });
    await page.mouse.up();
    const after = (await modal.boundingBox())!;
    expect(after.x - before.x).toBeCloseTo(30, 0);
    expect(after.y - before.y).toBeCloseTo(25, 0);
    if (step === 'router-single') {
      await modal.getByRole('tab', { name: 'All tokens routing', exact: true }).click();
      await expect(modal.getByRole('tab', { name: 'All tokens routing', exact: true })).toHaveAttribute('aria-selected', 'true');
      expect((await modal.boundingBox())!.x).toBeCloseTo(after.x, 0);
    }
    await page.locator(close).click();
    await expect(modal).toBeHidden();
    await advanceTo(page, step);
    await expect(modal).toBeVisible();
    await expect(modal).toHaveCSS('translate', '0px');
    await page.locator(close).click();
  }
});

test('introductions keep the architecture visible and selection changes preserve the agreed position', async ({ page }, testInfo) => {
  await page.goto('');
  await at(page, 'what-is-moe');
  await expect(page.locator('#pdf-flow-row')).toBeVisible();
  await expect(guide(page).locator('.tour-step-label')).toHaveCount(0);
  await expect(guide(page).locator('.tour-toolbar #tour-title')).toHaveText('What is Mixture-of-Experts?');
  await expect(guide(page).locator('#tour-title')).toHaveCount(1);
  await expect(page.locator('#tour-title')).toHaveText('What is Mixture-of-Experts?');
  await expect(page.locator('.tour-prose')).toContainText('Choose a model and sample prompt, or keep the current selections.');
  await expect(page.getByLabel('Tutorial token')).toBeHidden();
  await expect(page.locator('#tour-text strong')).toHaveText(['Mixture of Experts (MoE)', 'feed-forward network (FFN)', 'experts', 'router', 'top-k', 'small subset of experts is active per token', 'sparse activation']);
  await page.screenshot({ path: testInfo.outputPath('introduction.png') });
  await expect.poll(() => page.locator('#model-select').evaluate(el => getComputedStyle(el).animationName))
    .toBe(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'none' : 'sample-picker-pulse');
  await next(page, 'embedding');
  await expect(page.locator('.tour-step-label')).toHaveText('Step 1 of 9 · Transformer Block 1');
  await expect(page.locator('#tour-title')).toHaveText('1. Embedding');
  await advanceTo(page, 'attention-map');
  await page.locator('#prompt-select').selectOption('1');
  await at(page, 'attention-map');
  await expect(page.locator('#math-backdrop')).toBeVisible();
  await expect(page.locator('#prompt-text')).toContainText('A loop');

  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/jetmoe_routing_trace/prompt-1.json', async route => {
    await gate;
    await route.continue();
  });
  await page.locator('#model-select').selectOption('jetmoe');
  await at(page, 'what-is-moe');
  await expect(page.locator('#tour-next-btn')).toBeDisabled();
  await expect(page.locator('#pdf-flow-row')).toBeVisible();
  await expect(page.locator('#math-backdrop')).toBeHidden();
  release();
  await expect(page.locator('#tour-next-btn')).toBeEnabled();
  await at(page, 'what-is-moe');
  await next(page, 'embedding');
  await advanceTo(page, 'attention-map');
  await checkNumbering(page, '3.3');
  await page.locator('#prompt-select').selectOption('0');
  await expect(page.locator('#tour-next-btn')).toBeEnabled();
  await expect(page.locator('#prompt-text')).toContainText('The most popular');
  await at(page, 'attention-map');
  await expect(page.locator('#attn-subtab-map')).toBeVisible();
});

test('full-viewport popup dims parameters and leaves the floating guide interactive', async ({ page }) => {
  await load(page, 'olmoe');
  const parameter = page.locator('#param-count-panel');
  await expect(parameter).not.toHaveAttribute('inert');
  await next(page, 'embedding-detail');
  await expect(parameter).toHaveAttribute('inert');
  expect(await page.evaluate(() => {
    const guide = document.querySelector('#tour-overlay .tour-card')!.getBoundingClientRect();
    const backdrop = document.querySelector('#math-backdrop')!.getBoundingClientRect();
    return backdrop.bottom === innerHeight && !!document.elementFromPoint(guide.x + 20, guide.y + 20)?.closest('.tour-card');
  })).toBe(true);
  await page.locator('#math-modal-close').click();
  await expect(parameter).not.toHaveAttribute('inert');
  await advanceTo(page, 'router-single');
  await expect(parameter).toHaveAttribute('inert');
  await page.locator('#moe-grid-close').click();
  await expect(parameter).not.toHaveAttribute('inert');
});

test('entire architecture flow fits above the full-width parameter panel', async ({ page }, testInfo) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1024, height: 768 }, { width: 1440, height: 640 }]) {
    await page.setViewportSize(viewport);
    for (const model of ['olmoe', 'jetmoe', 'deepseek'] as Model[]) {
      await load(page, model);
      await expect.poll(() => page.evaluate(() => {
        const dock = document.querySelector('#param-count-panel')!.getBoundingClientRect();
        const flow = document.querySelector('.pdf-scroll')!.getBoundingClientRect();
        const arrows = [...document.querySelectorAll('.skip-overlay, .loop-overlay')].map(el => el.getBoundingClientRect());
        return {
          fits: [flow, ...arrows].every(rect => rect.top >= 0 && rect.bottom <= dock.top && rect.left >= 0 && rect.right <= innerWidth),
          noPageScroll: document.documentElement.scrollHeight <= innerHeight + 1,
          atTop: window.scrollY === 0,
        };
      }), { message: `${model} at ${viewport.width}×${viewport.height}` }).toEqual({ fits: true, noPageScroll: true, atTop: true });
      if (viewport.width === 1366 && model === 'olmoe') {
        await page.screenshot({ path: testInfo.outputPath('compact-flow.png') });
      }
    }
  }
});
async function at(page: Page, id: string) {
  await expect(guide(page)).toHaveAttribute('data-tour-step', id);
  await expect(page.locator('#tour-overlay')).toBeVisible();
}
async function checkNumbering(page: Page, number: string) {
  if (number === '0') {
    await expect(page.locator('#tour-title')).toHaveText('What is Mixture-of-Experts?');
    return;
  }
  await expect(guide(page).locator('.tour-step-label')).toContainText(`Step ${number.split('.')[0]} of 9`);
  const titleNumber = number.includes('.') ? number : `${number}.`;
  await expect(guide(page).locator('#tour-title')).toHaveText(new RegExp(`^${titleNumber.replaceAll('.', '\\.')} `));
}
async function next(page: Page, id: string) {
  await page.locator('#tour-next-btn').click();
  await at(page, id);
}
async function advanceTo(page: Page, id: string) {
  for (let i = 0; i < 35; i++) {
    if (await guide(page).getAttribute('data-tour-step') === id) return;
    await page.locator('#tour-next-btn').click();
  }
  throw new Error(`Did not reach ${id}`);
}
async function load(page: Page, model: Model) {
  await page.goto('');
  await at(page, 'what-is-moe');
  if (model !== 'olmoe') {
    const loaded = page.waitForResponse((res) => res.url().endsWith('/prompt-0.json'));
    await page.locator('#model-select').selectOption(model);
    await loaded;
  }
  const flow = traceFor(model);
  await expect(page.locator('#prompt-text')).toHaveText(`"${flow.prompt}"`);
  await expect(page.locator('.pdf-token-chip')).toHaveCount(flow.tokens.length);
  await expect(page.locator('#flow-block-label .title')).toHaveText(`Transformer Block 1 of ${flow.num_layers}`);
  await advanceTo(page, 'embedding');
  return flow;
}
async function checkLayout(page: Page) {
  await expect(page.locator('#tour-next-btn')).toBeInViewport();
  await expect(page.locator('#tour-back-btn')).toBeInViewport();
  const bounds = await guide(page).boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
}
async function checkView(page: Page, id: string) {
  const overview = ['what-is-moe', 'embedding', 'norm-attention', 'attention', 'residual-attention', 'norm-ffn', 'dense', 'moe', 'residual-ffn', 'repeat', 'final-norm', 'final-output'].includes(id);
  const router = id.startsWith('router-'), expert = id.startsWith('expert-');
  if (overview || router) await expect(page.locator('#math-backdrop')).toBeHidden();
  else await expect(page.locator('#math-backdrop')).toBeVisible();
  if (router || expert) await expect(page.locator('#moe-grid-backdrop')).toBeVisible();
  else await expect(page.locator('#moe-grid-backdrop')).toBeHidden();
  if (id.startsWith('attention-')) {
    const tab = id.slice('attention-'.length);
    await expect(page.locator(`#attn-subtab-${tab}`)).toBeVisible();
    await expect(page.locator(`#attn-sub-tabs .active`)).toHaveAttribute('data-atab', tab);
  }
  if (expert) {
    const tab = id === 'expert-router' ? 'router' : 'expert';
    await expect(page.locator(`#math-subtab-${tab}`)).toBeVisible();
    await expect(page.locator('#math-sub-tabs .active')).toHaveAttribute('data-mtab', tab);
  }
  if (!overview && !router) await expect(page.locator('#math-content .math-hint').first()).toBeHidden();
}

for (const model of ['olmoe', 'jetmoe', 'deepseek'] as Model[]) {
  test(`${model}: architecture equations center graphics and complete rows`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await load(page, model);
    const stops = expectedStops(model);
    let checked = 0;
    for (const id of stops.slice(stops.indexOf('embedding') + 1)) {
      await next(page, id);
      // Finish the current reveal before measuring layout; the separate output-reveal test
      // exercises its actual timing, rather than confusing tween scale with alignment.
      const geometry = await page.evaluate(() => {
        const visible = (el: Element) => (el as HTMLElement).offsetWidth > 0 && (el as HTMLElement).offsetHeight > 0;
        document.querySelectorAll<HTMLElement>('#math-content .mm-staged, #math-content .math-subtab-panel').forEach(el => {
          if (visible(el)) el.click();
        });
        return [...document.querySelectorAll<HTMLElement>('#math-content .mm-equation')].filter(visible).map(eq => {
          const rows = new Map<string, number[]>();
          [...eq.children].forEach(block => {
            const key = getComputedStyle(block).gridRowStart;
            const visuals = block.matches('.mm-operand, .mm-operator')
              ? [block.querySelector('.mm-visual, .mm-symbol')!]
              : block.matches('.mm-equation-group') ? [...block.querySelectorAll('.mm-visual, .mm-symbol')] : [];
            for (const visual of visuals) {
              const rect = visual.getBoundingClientRect();
              const centers = rows.get(key) || [];
              centers.push(rect.y + rect.height / 2);
              rows.set(key, centers);
            }
          });
          const scroller = eq.parentElement!;
          const rect = eq.getBoundingClientRect(), scroll = scroller.getBoundingClientRect();
          const previousScroll = scroller.scrollLeft;
          scroller.scrollLeft = 0;
          const start = eq.getBoundingClientRect();
          scroller.scrollLeft = scroller.scrollWidth;
          const end = eq.getBoundingClientRect();
          scroller.scrollLeft = previousScroll;
          return {
            rowSpreads: [...rows.values()].map(values => Math.max(...values) - Math.min(...values)),
            centerError: rect.width <= scroll.width ? Math.abs(rect.x + rect.width / 2 - scroll.x - scroll.width / 2) : 0,
            overflowReachable: rect.width <= scroll.width || (start.left >= scroll.left - 1 && end.right <= scroll.right + 1),
          };
        });
      });
      for (const equation of geometry) {
        checked++;
        for (const spread of equation.rowSpreads) expect(spread, `${model} ${id}: graphic centerlines`).toBeLessThanOrEqual(1);
        expect(equation.centerError, `${model} ${id}: horizontal center`).toBeLessThanOrEqual(1);
        expect(equation.overflowReachable, `${model} ${id}: scroll reach`).toBe(true);
      }
      if (['norm-attention-detail', 'expert-ffn', 'attention-map', 'attention-concat'].includes(id)) {
        await page.screenshot({ path: testInfo.outputPath(`${id}.png`), style: '#tour-overlay { visibility: hidden; }' });
      }
    }
    expect(checked).toBeGreaterThanOrEqual(10);
    expect(errors).toEqual([]);
  });

  test(`${model}: complete tutorial forwards and backwards`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const flow = await load(page, model), stops = expectedStops(model), numbers = expectedStepNumbers(model);
    await at(page, 'embedding');
    await expect(page.getByLabel('Tutorial token')).toHaveValue(String(flow.tokens.length - 1));
    for (let i = 0; i < stops.indexOf('embedding'); i++) await page.locator('#tour-back-btn').click();
    await at(page, 'what-is-moe');
    await expect(page.locator('#tour-back-btn')).toBeDisabled();
    for (const id of stops.slice(1)) {
      await next(page, id);
      await checkNumbering(page, numbers[stops.indexOf(id)]);
      await checkView(page, id);
      await checkLayout(page);
      await expect(page.locator('.tour-prose')).not.toHaveText('');
      if (['router-single', 'router-all', 'expert-router', 'expert-ffn'].includes(id)) {
        await expect(page.locator('#moe-grid-backdrop')).toBeVisible();
        await expect(page.locator('#play-btn')).toBeEnabled();
      }
      if (id === 'attention-map' && model === 'olmoe') {
        await expect(page.locator('#math-content .diagram-legend')).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('attention-map.png') });
      }
      if (id === 'router-all' && model === 'olmoe') await page.screenshot({ path: testInfo.outputPath('router-all.png') });
      if (id === 'repeat') await expect(page.locator('#flow-block-label .title')).toHaveText(`Transformer Block ${flow.num_layers} of ${flow.num_layers}`);
      if (id === 'final-norm-detail') {
        await expect(page.locator('.conceptual-norm')).toBeVisible();
        await expect(page.locator('#math-content .diagram-legend')).toContainText('Conceptual illustration');
        await expect(page.locator('#math-content .mm-cell')).toHaveCount(0);
      }
      if (id === 'final-output-detail') {
        await expect(page.locator('.prediction-row')).toHaveCount(flow.next_token_candidates.length);
        const best = [...flow.next_token_candidates].sort((a, b) => b.prob - a.prob)[0];
        await expect(page.locator('.prediction-row').first().locator('code')).toHaveText(best.token);
        await expect(page.locator('.prediction-row').first().locator('.prediction-prob')).toHaveText(`${(best.prob * 100).toFixed(2)}%`);
        await page.screenshot({ path: testInfo.outputPath('final-output.png') });
      }
    }
    for (const id of [...stops].reverse().slice(1)) {
      await page.locator('#tour-back-btn').click();
      await at(page, id);
      await checkNumbering(page, numbers[stops.indexOf(id)]);
      await checkView(page, id);
      await checkLayout(page);
    }
    await expect(page.locator('#flow-block-label .title')).toHaveText(`Transformer Block 1 of ${flow.num_layers}`);
    await page.locator('.out-narrow').click();
    await at(page, 'final-output-detail');
    await page.locator('#tour-next-btn').click();
    await at(page, 'what-is-moe');
    await expect(page.locator('#math-backdrop')).toBeHidden();
    await expect(page.locator('#moe-grid-backdrop')).toBeHidden();
    await expect(page.locator('#flow-block-label .title')).toHaveText(`Transformer Block 1 of ${flow.num_layers}`);
    expect(errors).toEqual([]);
  });

  test(`${model}: manual controls synchronize and closing returns one level`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const flow = await load(page, model);
    await next(page, 'embedding-detail');
    await page.getByLabel('Tutorial token').selectOption('0');
    await expect(page.locator('#math-content')).toContainText(flow.tokens[0].text.trim());
    await advanceTo(page, 'attention-proj');
    await page.locator('[data-atab="map"]').click();
    await at(page, 'attention-map');
    await checkNumbering(page, model === 'jetmoe' ? '3.3' : '3.2');
    await page.locator('#pdf-head-next').click();
    await at(page, 'attention-map');
    await page.locator('#math-modal-close').click();
    await at(page, 'attention');
    await checkNumbering(page, '3');
    await next(page, 'attention-proj');
    await page.keyboard.press('Escape');
    await at(page, 'attention');
    await advanceTo(page, 'router-single');
    await expect(page.locator('.ptr-chip.active')).toHaveText(flow.tokens[0].text.trim());
    await page.getByRole('tab', { name: 'All tokens routing', exact: true }).click();
    await at(page, 'router-all');
    const firstRouted = flow.layers.findIndex((layer) => !!layer.tokens);
    const activeExpert = flow.layers[firstRouted].tokens[0].top_experts[0];
    await page.locator(`.expert-cell[data-token="0"][data-expert="${activeExpert}"]`).click();
    await at(page, 'expert-router');
    await page.locator('[data-mtab="expert"]').click();
    await at(page, 'expert-ffn');
    await page.locator('#math-modal-close').click();
    await at(page, 'router-all');
    await page.locator('#moe-grid-backdrop .layer-tab').nth(firstRouted + 1).click();
    await at(page, 'router-all');
    await expect(page.locator('.tour-step-label')).toContainText(`Transformer Block ${firstRouted + 2}`);
    await expect(page.locator('#play-btn')).toBeEnabled();
    await page.waitForTimeout(3700);
    await expect(page.locator('#moe-grid-backdrop .layer-tab.active')).toHaveText(String(firstRouted + 2));
    if (model === 'deepseek') {
      await page.locator('#moe-grid-backdrop .layer-tab').first().click();
      await at(page, 'dense');
      await checkNumbering(page, '6');
      await expect(page.locator('#moe-grid-backdrop')).toBeHidden();
      await next(page, 'dense-detail');
      await checkNumbering(page, '6.1');
      await next(page, 'moe');
      await checkNumbering(page, '6.2');
      await expect(page.locator('#flow-block-label .title')).toHaveText(`Transformer Block 2 of ${flow.num_layers}`);
    } else {
      await page.locator('#moe-grid-close').click();
      await at(page, 'moe');
    }
    await page.getByRole('button', { name: 'Domain Specialization Analysis', exact: true }).click();
    await expect(page.locator('#tour-overlay')).toBeHidden();
    await page.getByRole('button', { name: 'Model Architecture', exact: true }).click();
    await at(page, 'moe');
    await advanceTo(page, 'final-output-detail');
    await expect(page.locator('#tour-next-btn')).toHaveText('Restart tour');
    await page.locator('#tour-next-btn').click();
    await at(page, 'what-is-moe');
    await expect(page.locator('#flow-block-label .title')).toHaveText(`Transformer Block 1 of ${flow.num_layers}`);
    await advanceTo(page, 'embedding');
    await expect(page.getByLabel('Tutorial token')).toHaveValue(String(flow.tokens.length - 1));
    await page.locator('#prompt-select').selectOption('1');
    await at(page, 'embedding');
    await expect(page.locator('#math-backdrop')).toBeHidden();
    expect(errors).toEqual([]);
  });
}

test('manual operation detours, inactive experts and model reset', async ({ page }) => {
  const flow = await load(page, 'olmoe');
  await page.locator('.layer-card .pdf-block').first().click();
  await at(page, 'norm-attention-detail');
  await next(page, 'attention');
  await page.locator('.pdf-token-chip').nth(2).click();
  await at(page, 'embedding-detail');
  await expect(page.getByLabel('Tutorial token')).toHaveValue('2');
  await page.keyboard.press('Escape');
  await at(page, 'embedding');
  await advanceTo(page, 'router-all');
  const inactive = flow.layers[0].tokens[2].all_probs.findIndex((_, expert) => !flow.layers[0].tokens[2].top_experts.includes(expert));
  await page.locator(`.expert-cell[data-token="2"][data-expert="${inactive}"]`).click();
  await at(page, 'expert-router');
  await next(page, 'expert-ffn');
  await expect(page.locator('#math-subtab-expert')).toContainText('skipped');
  await page.keyboard.press('Escape');
  await at(page, 'router-all');
  await page.locator('#moe-grid-backdrop .layer-tab').nth(2).click();
  await expect(page.locator('#math-backdrop')).toBeHidden();
  await expect(page.locator('#flow-block-label .title')).toHaveText(`Transformer Block 3 of ${flow.num_layers}`);
  await page.locator('#moe-grid-close').click();
  await page.locator('.pdf-block.final-norm').click();
  await expect(page.locator('.conceptual-norm')).toBeVisible();
  await page.locator('#math-modal-close').click();
  await page.locator('#model-select').selectOption('jetmoe');
  await at(page, 'what-is-moe');
  await expect(page.locator('#math-backdrop')).toBeHidden();
  await expect(page.locator('#flow-block-label .title')).toHaveText('Transformer Block 1 of 24');
});

test('full-width parameters and floating tour drag, resume, visit reset and phone controls', async ({ page }, testInfo) => {
  await load(page, 'olmoe');
  const parameter = page.locator('#param-count-panel');
  const diagram = page.locator('.flow-viewport');
  const left = (await parameter.boundingBox())!, flow = (await diagram.boundingBox())!;
  expect(left.width).toBeGreaterThan(flow.width);
  expect(left.y).toBeGreaterThanOrEqual(flow.y + flow.height);
  await expect(page.getByLabel('Expand guided tour')).toHaveCount(0);
  const before = (await guide(page).boundingBox())!;
  const handle = (await page.locator('.tour-drag-handle').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 70, handle.y + handle.height / 2 - 80, { steps: 8 });
  await page.mouse.up();
  const moved = (await guide(page).boundingBox())!;
  expect(moved.x - before.x).toBeCloseTo(70, 0);
  expect(moved.y - before.y).toBeCloseTo(-80, 0);
  await next(page, 'embedding-detail');
  expect((await guide(page).boundingBox())!.x).toBeCloseTo(moved.x, 0);
  await page.locator('#tour-exit-btn').click();
  await expect(page.locator('#tour-overlay')).toBeHidden();
  await expect(page.locator('#math-content .math-hint').first()).toBeVisible();
  await page.locator('#math-modal-close').click();
  await page.locator('#start-tour-btn').click();
  await at(page, 'embedding-detail');
  expect((await guide(page).boundingBox())!.x).toBeCloseTo(moved.x, 0);
  await page.locator('#math-modal-close').click();
  await page.getByRole('button', { name: 'Domain Specialization Analysis', exact: true }).click();
  await page.getByRole('button', { name: 'Model Architecture', exact: true }).click();
  expect((await guide(page).boundingBox())!.x).toBeCloseTo(before.x, 0);
  await page.screenshot({ path: testInfo.outputPath('floating-tour-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await next(page, 'embedding-detail');
  await checkLayout(page);
  await page.screenshot({ path: testInfo.outputPath('floating-tour-phone.png') });
});
