import { expect, test, type Locator, type Page } from '@playwright/test';
import { PERSON } from '../../src/data/site';
import { openFinished } from './finished';

// The finished page as it stands with nothing moving: what a visitor sees once the
// opening has played, with channel 1 on screen.

test.skip(({ isMobile }) => isMobile, 'The desktop arrangement; the phone has its own tests.');

const SIZES = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`No box for ${locator}`);
  return box;
}

function intersect(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  );
}

async function open(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await openFinished(page);
  await page.evaluate(() => document.fonts.ready);
}

for (const size of SIZES) {
  test.describe(`at ${size.width}×${size.height}`, () => {
    test('fits the viewport with no scrollbar in either direction', async ({ page }) => {
      await open(page, size);
      const extent = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      }));
      expect(extent.scrollWidth).toBeLessThanOrEqual(extent.innerWidth);
      expect(extent.scrollHeight).toBeLessThanOrEqual(extent.innerHeight);
    });

    test('keeps the rail, the set and the cable clear of each other and on screen', async ({
      page,
    }) => {
      await open(page, size);
      const rail = await boxOf(page.locator('[data-rail]'));
      const tv = await boxOf(page.locator('[data-tv]'));
      const cable = await boxOf(page.locator('[data-cable]'));

      for (const box of [rail, tv, cable]) {
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(size.width);
        expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      }

      expect(intersect(rail, tv)).toBe(false);
      expect(intersect(tv, cable)).toBe(false);
      expect(intersect(rail, cable)).toBe(false);
    });
  });
}

// The page as it is served, which is what a visitor with scripting off is left with.
test('is served already finished, on channel 1', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-stage', 'done');
  await expect(page.locator('html')).toHaveAttribute('data-channel', '1');
  await expect(page.locator('[data-now-title]')).toHaveText('Studio');
  // Nothing is waiting for an opening that will never play.
  for (const hook of ['[data-now-title]', '[data-rail]', '[data-hint]', '[data-cable]']) {
    await expect(page.locator(hook)).toBeVisible();
  }
  await expect(page.locator('[data-screen] video[data-on]')).toBeVisible();
  await expect(page.locator('[data-mascot]')).toBeHidden();
  await context.close();
});

test('shows Studio on the screen and loads every picture', async ({ page }) => {
  await openFinished(page);
  await expect(page.locator('[data-screen] video[data-on]')).toHaveAttribute(
    'poster',
    '/media/studio.jpg',
  );

  const pictures = page.locator('img');
  await expect(pictures).not.toHaveCount(0);
  for (const picture of await pictures.all()) {
    await expect(picture).toHaveJSProperty('complete', true);
    expect(await picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  }
});

test('has the three top links, each opening its target in a new tab', async ({ page }) => {
  await openFinished(page);
  const links = page.getByRole('banner').getByRole('link');
  await expect(links).toHaveText(['GitHub', 'LinkedIn', 'Resume']);

  const targets = [PERSON.github, PERSON.linkedin, PERSON.resume];
  for (const [index, href] of targets.entries()) {
    const link = links.nth(index);
    await expect(link).toHaveAttribute('href', href);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener');
  }
});

test('lists the four results in the rail', async ({ page }) => {
  await openFinished(page);
  const rail = page.locator('[data-rail]');
  const results = [
    ['HCLTech AMPLIfied', 'National Hackathon Winner'],
    ['HackerRank Orchestrate', '24 Hr Global Hackathon'],
    ['Amazon ML Challenge', 'Top 0.21% of 32,000+ Teams'],
    ['Codeforces Specialist', '28 Rated Contests'],
  ];
  for (const [name, line] of results) {
    await expect(rail).toContainText(name);
    await expect(rail).toContainText(line);
  }
});

test('carries both handwritten notes beside the cable', async ({ page }) => {
  await openFinished(page);
  const cable = page.locator('[data-cable]');
  await expect(cable).toContainText('tried a lot of things');
  await expect(cable).toContainText('stayed for the ones');
  await expect(cable).toContainText('that fix a real problem');
});

test('hides the mascot, the cable and the beam from screen readers', async ({ page }) => {
  await openFinished(page);
  for (const hook of ['[data-mascot]', '[data-cable]', '[data-beam]']) {
    await expect(page.locator(hook)).toHaveAttribute('aria-hidden', 'true');
  }
});
