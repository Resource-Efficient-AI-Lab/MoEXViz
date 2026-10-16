import { test, expect, type Page } from '@playwright/test';

const laptop = { width: 1440, height: 900 };
const monitors = [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
];

async function expectHeightFit(page: Page, selector: string) {
  await expect.poll(() => page.locator(selector).first().evaluate(element => {
    return innerHeight - element.getBoundingClientRect().bottom;
  }), { message: 'content uses the height with a normal bottom margin' }).toBeGreaterThanOrEqual(20);
  await expect.poll(() => page.locator(selector).first().evaluate(element => {
    return innerHeight - element.getBoundingClientRect().bottom;
  })).toBeLessThanOrEqual(50);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight),
    { message: 'the fitted page does not require vertical scrolling' }).toBeLessThanOrEqual(1);
}

for (const model of ['olmoe', 'jetmoe', 'deepseek']) {
  test(`${model}: height fit removes the parameter gap and restores the laptop layout`, async ({ page }) => {
    await page.goto('');
    await page.locator('#model-select').selectOption(model);
    await expect(page.locator('#pdf-flow-row .layer-card')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await resize(page, laptop);
    const parameters = page.locator('#param-count-panel');
    const original = (await parameters.boundingBox())!;
    const laptopBlock = (await page.locator('.moe-block').boundingBox())!;
    const laptopAspect = laptopBlock.height / laptopBlock.width;
    for (const viewport of monitors) {
      await resize(page, viewport);
      await expectHeightFit(page, '#param-count-panel');
      const block = (await page.locator('.moe-block').boundingBox())!;
      expect(Math.abs(block.height / block.width - laptopAspect), 'cards grow proportionally without becoming tall columns').toBeLessThan(0.01);
    }
    await resize(page, { width: 2560, height: 1440 });
    await resize(page, { width: 2560, height: 1800 });
    await expectHeightFit(page, '#param-count-panel');
    const tallerBlock = (await page.locator('.moe-block').boundingBox())!;
    expect(Math.abs(tallerBlock.height / tallerBlock.width - laptopAspect)).toBeLessThan(0.01);
    // Rebuilding the deck while tall must not save the fitted height as its natural height.
    await page.locator('#flow-block-label button').last().click();
    await expectHeightFit(page, '#param-count-panel');
    await resize(page, laptop);
    await page.locator('#flow-block-label button').first().click();
    await expect.poll(async () => Math.abs((await parameters.boundingBox())!.y - original.y)).toBeLessThan(1);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
  });
}

test('domain plots use tall windows without enlarging the controls or adding page scroll', async ({ page }) => {
  await page.goto('');
  await page.getByRole('button', { name: 'Domain Specialization Analysis', exact: true }).click();
  const map = page.getByRole('img', { name: /^UMAP scatter/ });
  await expect(map).toBeVisible();
  await resize(page, laptop);
  const laptopMap = (await map.boundingBox())!;
  const tab = page.getByRole('button', { name: 'Experts UMAP', exact: true });
  const tabFont = await tab.evaluate(element => getComputedStyle(element).fontSize);
  const views = ['Experts UMAP', 'Avg. Activation rate per layer', 'Experts activation rates per layer', 'Top experts per category'];
  for (const viewport of monitors) {
    await resize(page, viewport);
    for (const name of views) {
      await page.getByRole('button', { name, exact: true }).click();
      await expectHeightFit(page, '.moe-wrap > .panel');
      await expect(tab).toHaveCSS('font-size', tabFont);
      if (name === 'Experts activation rates per layer') {
        await page.getByRole('switch', { name: 'Histogram view' }).click();
        await expectHeightFit(page, '.moe-wrap > .panel');
      }
    }
  }
  await page.getByRole('button', { name: 'Experts UMAP', exact: true }).click();
  await resize(page, laptop);
  await expect.poll(async () => Math.abs((await map.boundingBox())!.height - laptopMap.height)).toBeLessThan(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
});

async function resize(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  // Viewport units and the diagram's ResizeObserver settle on separate frames.
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function expectFullWidthPanel(page: Page, selector: string) {
  const content = page.locator(selector).first();
  await expect.poll(() => content.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return Math.abs(rect.left - (innerWidth - rect.right));
  }), { message: 'content has equal left and right margins' }).toBeLessThan(2);
  const panel = (await content.boundingBox())!;
  expect(panel.width).toBeGreaterThan(await page.evaluate(() => innerWidth * 0.9));
  await expect(page.locator('header.full-bleed')).toHaveCSS('width', `${await page.evaluate(() => innerWidth)}px`);
  await expect.poll(() => page.locator('.project-links').evaluate(element => {
    return Math.abs(innerWidth - element.getBoundingClientRect().right - 48);
  })).toBeLessThan(2);
}

test('both tabs fill large monitors while the header and resource icons stay aligned', async ({ page }) => {
  await page.goto('');
  await expect(page.locator('#pdf-flow-row')).toBeVisible();
  for (const viewport of [laptop, ...monitors]) {
    await resize(page, viewport);
    await expectFullWidthPanel(page, '[data-architecture] .panel');
    await page.getByRole('button', { name: 'Domain Specialization Analysis', exact: true }).click();
    await expect(page.getByRole('img', { name: /^UMAP scatter/ })).toBeVisible();
    await expectFullWidthPanel(page, '.moe-wrap > .panel');
    await page.getByRole('button', { name: 'Model Architecture', exact: true }).click();
  }
});

for (const model of ['olmoe', 'jetmoe', 'deepseek']) {
  test(`${model}: architecture grows, stays centered, and keeps its arrows above parameters`, async ({ page }) => {
    await page.goto('');
    await page.locator('#model-select').selectOption(model);
    const layers = model === 'olmoe' ? 16 : model === 'jetmoe' ? 24 : 28;
    await expect(page.locator('#flow-block-label .title')).toHaveText(`Transformer Block 1 of ${layers}`);
    await expect(page.locator('#pdf-flow-row .layer-card')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await resize(page, laptop);
    const heading = page.locator('.embed-narrow h4');
    const laptopHeight = (await heading.boundingBox())!.height;

    for (const viewport of monitors.slice(1)) {
      await resize(page, viewport);
      await expect.poll(async () => (await heading.boundingBox())!.height)
        .toBeGreaterThan(laptopHeight * 1.1);
      await expect.poll(() => page.evaluate(() => {
        const embed = document.querySelector('.embed-narrow')!.getBoundingClientRect();
        const output = document.querySelector('.out-narrow')!.getBoundingClientRect();
        const dock = document.querySelector('#param-count-panel')!.getBoundingClientRect();
        const diagram = document.querySelector('.pdf-scroll')!.getBoundingClientRect();
        const arcs = [...document.querySelectorAll('.skip-overlay, .loop-overlay')]
          .map(element => element.getBoundingClientRect());
        return {
          centered: Math.abs((embed.left + output.right) / 2 - innerWidth / 2) < 2,
          fits: [diagram, ...arcs].every(rect => rect.left >= 0 && rect.right <= innerWidth
            && rect.top >= 0 && rect.bottom <= dock.top),
        };
      })).toEqual({ centered: true, fits: true });
      await expect(page.locator('#tour-next-btn')).toBeInViewport();
      await page.locator('.out-narrow').click();
      await expect(page.locator('#math-backdrop')).toBeVisible();
      await expect(page.locator('.prediction-row').first()).toBeVisible();
      await page.locator('#math-modal-close').click();
      await expect(page.locator('#math-backdrop')).toBeHidden();
    }

    // Moving the same window back to a laptop must restore the original size.
    await resize(page, laptop);
    await expect.poll(async () => Math.abs((await heading.boundingBox())!.height - laptopHeight))
      .toBeLessThan(1);
  });
}

test('domain UMAP grows on large monitors and returns to laptop size', async ({ page }) => {
  await page.goto('');
  await page.getByRole('button', { name: 'Domain Specialization Analysis', exact: true }).click();
  const plot = page.getByRole('img', { name: /^UMAP scatter/ });
  await expect(plot).toBeVisible();
  await resize(page, laptop);
  const laptopWidth = (await plot.boundingBox())!.width;

  for (const viewport of monitors.slice(1)) {
    await resize(page, viewport);
    const rect = (await plot.boundingBox())!;
    expect(rect.width).toBeGreaterThan(laptopWidth * 1.2);
    expect(Math.abs(rect.x + rect.width / 2 - viewport.width / 2)).toBeLessThan(2);
    expect(rect.y + rect.height).toBeLessThan(viewport.height);
  }

  await resize(page, laptop);
  expect((await plot.boundingBox())!.width).toBeCloseTo(laptopWidth, 0);
});

test('domain heatmaps and histograms grow proportionally and keep detail and fit-to-window controls working', async ({ page }) => {
  await page.goto('');
  await page.getByRole('button', { name: 'Domain Specialization Analysis', exact: true }).click();
  await page.getByRole('button', { name: 'Experts activation rates per layer', exact: true }).click();
  await resize(page, laptop);
  const grid = page.locator('[data-category-tile="code"] svg');
  await expect(grid).toBeVisible();
  const laptopGridWidth = (await grid.boundingBox())!.width;
  const histogram = page.locator('[data-hist-card][data-category-chart="code"]');
  await page.getByRole('switch', { name: 'Histogram view' }).click();
  const laptopHistogramWidth = (await histogram.boundingBox())!.width;
  await page.getByRole('switch', { name: 'Histogram view' }).click();

  for (const viewport of monitors.slice(1)) {
    await resize(page, viewport);
    expect((await grid.boundingBox())!.width).toBeGreaterThan(laptopGridWidth * 1.2);
    await grid.locator('rect[data-expert-num="0"]').click();
    const detail = page.getByRole('dialog', { name: /expert 1, layer 1 detail/ });
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByRole('button', { name: 'Open all categories in one window', exact: false }).click();
    const allCategories = page.getByRole('dialog', { name: 'All categories, layer 1' });
    await expect(allCategories).toBeVisible();
    await expect(allCategories.locator('[data-category-tile]')).toHaveCount(6);
    await expect.poll(() => allCategories.locator('[data-category-tile] svg').evaluateAll(elements => {
      return elements.every(element => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
      });
    })).toBe(true);
    await allCategories.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByRole('switch', { name: 'Histogram view' }).click();
    expect((await histogram.boundingBox())!.width).toBeGreaterThan(laptopHistogramWidth);
    await page.getByRole('switch', { name: 'Histogram view' }).click();
  }

  await resize(page, laptop);
  expect((await grid.boundingBox())!.width).toBeCloseTo(laptopGridWidth, 0);
});
