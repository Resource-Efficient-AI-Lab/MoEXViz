import { test, expect, type Page } from '@playwright/test';
import { expectedStepNumbers, expectedStops, traceFor, type Model } from '../traceFixtures';

const guide = (page: Page) => page.locator('.tour-card');

test('introductions keep the architecture visible and selection changes preserve the agreed position', async ({ page }, testInfo) => {
  await page.goto('');
  await at(page, 'what-is-moe');
  await expect(page.locator('#pdf-flow-row')).toBeVisible();
  await expect(page.locator('.tour-step-label')).toHaveText('Step 1 of 11');
  await expect(page.locator('#tour-title')).toHaveText('1 What is Mixture of Experts?');
  await expect(page.locator('.tour-prose')).toContainText('not assigned subjects');
  await expect(page.getByLabel('Tutorial token')).toBeHidden();
  await expect(page.locator('.tour-prose')).toContainText('Attention lets each token gather context');
  await page.screenshot({ path: testInfo.outputPath('introduction.png') });
  await next(page, 'select-sample');
  await checkNumbering(page, '2');
  await expect.poll(() => page.locator('#model-select').evaluate(el => getComputedStyle(el).animationName))
    .toBe(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'none' : 'sample-picker-pulse');
  await next(page, 'embedding');
  await expect(page.locator('.tour-step-label')).toHaveText('Step 3 of 11 · Transformer Block 1');
  await expect(page.locator('#tour-title')).toHaveText('3 Embedding');
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
  await at(page, 'select-sample');
  await expect(page.locator('#tour-next-btn')).toBeDisabled();
  await expect(page.locator('#pdf-flow-row')).toBeVisible();
  await expect(page.locator('#math-backdrop')).toBeHidden();
  release();
  await expect(page.locator('#tour-next-btn')).toBeEnabled();
  await at(page, 'select-sample');
  await next(page, 'embedding');
  await advanceTo(page, 'attention-map');
  await checkNumbering(page, '5.3');
  await page.locator('#prompt-select').selectOption('0');
  await expect(page.locator('#tour-next-btn')).toBeEnabled();
  await expect(page.locator('#prompt-text')).toContainText('The most popular');
  await at(page, 'attention-map');
  await expect(page.locator('#attn-subtab-map')).toBeVisible();
});

test('popup dims and blocks the parameter panel while the guide stays usable', async ({ page }, testInfo) => {
  await load(page, 'olmoe');
  const dock = page.locator('.tour-overlay'), parameter = page.locator('#param-count-panel');
  await expect(parameter).not.toHaveAttribute('inert');
  await next(page, 'embedding-detail');
  await expect(dock).toHaveClass(/popup-focused/);
  await expect(parameter).toHaveAttribute('inert');
  const layering = await page.evaluate(() => {
    const dock = document.querySelector('.tour-overlay')!;
    const parameter = document.querySelector('#param-count-panel')!.getBoundingClientRect();
    const guide = document.querySelector('.tour-card')!.getBoundingClientRect();
    return {
      sameShade: getComputedStyle(dock, '::after').backgroundColor === getComputedStyle(document.querySelector('#math-backdrop')!).backgroundColor,
      parameterBlocked: document.elementFromPoint(parameter.x + 20, parameter.y + 20) === dock,
      guideAccessible: !!document.elementFromPoint(guide.x + 20, guide.y + 20)?.closest('.tour-card'),
    };
  });
  expect(layering).toEqual({ sameShade: true, parameterBlocked: true, guideAccessible: true });
  await page.screenshot({ path: testInfo.outputPath('consistent-dim.png') });
  await page.locator('#math-modal-close').click();
  await expect(parameter).not.toHaveAttribute('inert');
  await expect(dock).not.toHaveClass(/popup-focused/);
  await advanceTo(page, 'router-single');
  await expect(parameter).toHaveAttribute('inert');
  await expect(dock).toHaveClass(/popup-focused/);
  await next(page, 'router-all');
  await expect(parameter).toHaveAttribute('inert');
  await page.locator('#moe-grid-close').click();
  await expect(parameter).not.toHaveAttribute('inert');
  await expect(dock).not.toHaveClass(/popup-focused/);
});

test('entire architecture flow fits above the pinned cards without page scrolling', async ({ page }, testInfo) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1024, height: 768 }, { width: 1440, height: 640 }]) {
    await page.setViewportSize(viewport);
    for (const model of ['olmoe', 'jetmoe', 'deepseek'] as Model[]) {
      await load(page, model);
      await expect.poll(() => page.evaluate(() => {
        const dock = document.querySelector('.tour-overlay')!.getBoundingClientRect();
        const flow = document.querySelector('.pdf-scroll')!.getBoundingClientRect();
        const arrows = [...document.querySelectorAll('.skip-overlay, .loop-overlay')].map(el => el.getBoundingClientRect());
        return {
          fits: [flow, ...arrows].every(rect => rect.top >= 0 && rect.bottom <= dock.top - 8 && rect.left >= 0 && rect.right <= innerWidth),
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
  await expect(page.locator('.tour-overlay')).toBeVisible();
}
async function checkNumbering(page: Page, number: string) {
  await expect(page.locator('.tour-step-label')).toContainText(`Step ${number.split('.')[0]} of 11`);
  await expect(page.locator('#tour-title')).toHaveText(new RegExp(`^${number.replace('.', '\\.')} `));
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
  const bounds = await page.evaluate(() => {
    const card = document.querySelector('.tour-overlay')!.getBoundingClientRect();
    const modals = [...document.querySelectorAll<HTMLElement>('.math-modal-backdrop.open .math-modal')].map((modal) => {
      const rect = modal.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    return { guideTop: card.top, guideBottom: card.bottom, height: innerHeight, modals };
  });
  expect(bounds.guideBottom).toBeLessThanOrEqual(bounds.height);
  for (const modal of bounds.modals) {
    expect(modal.top).toBeGreaterThanOrEqual(0);
    expect(modal.bottom).toBeLessThanOrEqual(bounds.guideTop - 7);
  }
}
async function checkView(page: Page, id: string) {
  const overview = ['what-is-moe', 'select-sample', 'embedding', 'norm-attention', 'attention', 'residual-attention', 'norm-ffn', 'dense', 'moe', 'residual-ffn', 'repeat', 'final-norm', 'final-output'].includes(id);
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
    await page.locator('.pdf-block.final-output').click();
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
    await checkNumbering(page, model === 'jetmoe' ? '5.3' : '5.2');
    await page.locator('#pdf-head-next').click();
    await at(page, 'attention-map');
    await page.locator('#math-modal-close').click();
    await at(page, 'attention');
    await checkNumbering(page, '5');
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
      await checkNumbering(page, '8');
      await expect(page.locator('#moe-grid-backdrop')).toBeHidden();
      await next(page, 'dense-detail');
      await checkNumbering(page, '8.1');
      await next(page, 'moe');
      await checkNumbering(page, '8.2');
      await expect(page.locator('#flow-block-label .title')).toHaveText(`Transformer Block 2 of ${flow.num_layers}`);
    } else {
      await page.locator('#moe-grid-close').click();
      await at(page, 'moe');
    }
    await page.getByRole('button', { name: 'Domain Specialization Analysis', exact: true }).click();
    await expect(page.locator('.tour-overlay')).toBeHidden();
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
  await at(page, 'select-sample');
  await expect(page.locator('#math-backdrop')).toBeHidden();
  await expect(page.locator('#flow-block-label .title')).toHaveText('Transformer Block 1 of 24');
});

test('persistent dock splits evenly and stacks in narrow windows', async ({ page }) => {
  await load(page, 'olmoe');
  await expect(page.locator('#start-tour-btn, #tour-exit-btn')).toHaveCount(0);
  const parameter = page.locator('#param-count-panel');
  await expect(parameter).toBeVisible();
  const left = (await parameter.boundingBox())!, right = (await guide(page).boundingBox())!;
  expect(Math.abs(left.width - right.width)).toBeLessThan(2);
  expect(right.x).toBeGreaterThan(left.x + left.width);
  await page.setViewportSize({ width: 390, height: 844 });
  await next(page, 'embedding-detail');
  await checkLayout(page);
  const top = (await parameter.boundingBox())!, bottom = (await guide(page).boundingBox())!;
  expect(bottom.y).toBeGreaterThanOrEqual(top.y + top.height);
  await expect(page.locator('#tour-next-btn')).toBeInViewport();
  await expect(page.locator('#tour-back-btn')).toBeInViewport();
});
