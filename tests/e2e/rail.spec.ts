import { expect, test, type Locator, type Page } from '@playwright/test';
import { CHANNELS } from '../../src/data/site';
import { openFinished } from './finished';

// The rail rolling and the links answering the pointer and the keyboard, on the
// finished page with channel 1 on screen.

test.skip(({ isMobile }) => isMobile, 'The desktop arrangement; the phone has its own tests.');

async function open(page: Page): Promise<void> {
  await openFinished(page);
  await page.evaluate(() => document.fonts.ready);
}

/** How far the track has rolled, in pixels: `x` leftward, `y` upward. */
async function rolled(page: Page): Promise<{ x: number; y: number }> {
  return page.locator('[data-rail-track]').evaluate((track) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(track).transform);
    // Subtracting from 0 keeps a track that has not moved at 0, not -0.
    return { x: 0 - matrix.m41, y: 0 - matrix.m42 };
  });
}

/** One copy of the cards measured along the vertical: the distance of one loop. */
async function loopLength(page: Page): Promise<number> {
  return page.locator('[data-rail-track]').evaluate((track) => {
    const [first, second] = Array.from(track.children);
    if (first === undefined || second === undefined) throw new Error('The rail has no copy.');
    return second.getBoundingClientRect().top - first.getBoundingClientRect().top;
  });
}

async function opacity(locator: Locator): Promise<number> {
  return locator.evaluate((element) => Number(getComputedStyle(element).opacity));
}

async function topOf(locator: Locator): Promise<number> {
  return locator.evaluate((element) => element.getBoundingClientRect().top);
}

/** The underline's horizontal scale (0 hidden, 1 full width), its colour and strength. */
async function underline(
  locator: Locator,
): Promise<{ scale: number; colour: string; opacity: number }> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element, '::after');
    return {
      scale: new DOMMatrixReadOnly(style.transform).a,
      colour: style.backgroundColor,
      opacity: Number(style.opacity),
    };
  });
}

function rgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgb(${value >> 16}, ${(value >> 8) & 255}, ${value & 255})`;
}

const INK = 'rgb(22, 22, 26)';

test.describe('the rail', () => {
  test('rolls upward by itself as one animation', async ({ page }) => {
    await open(page);
    const before = await rolled(page);
    await page.waitForTimeout(1000);
    const after = await rolled(page);

    expect(after.y).toBeGreaterThan(before.y + 5);
    expect(after.x).toBe(0);
    expect(
      await page.locator('[data-rail-track]').evaluate((track) => track.getAnimations().length),
    ).toBe(1);
  });

  test('stands still and comes to full strength under the pointer, then rolls on', async ({
    page,
  }) => {
    await open(page);
    const rail = page.locator('[data-rail]');
    await expect.poll(() => opacity(rail)).toBeCloseTo(0.62, 2);

    await rail.hover();
    await expect.poll(() => opacity(rail)).toBe(1);
    const held = await rolled(page);
    await page.waitForTimeout(1000);
    expect((await rolled(page)).y).toBe(held.y);

    await page.mouse.move(720, 450);
    await expect.poll(() => opacity(rail)).toBeCloseTo(0.62, 2);
    await page.waitForTimeout(1000);
    expect((await rolled(page)).y).toBeGreaterThan(held.y + 5);
  });

  test('loops over exactly one copy of the cards, and still does after a resize', async ({
    page,
  }) => {
    await open(page);
    const track = page.locator('[data-rail-track]');
    // Park the roll at the very end of its loop, where the seam would show.
    const endOfLoop = (): Promise<number> =>
      track.evaluate((element) => {
        const [roll] = element.getAnimations();
        if (roll === undefined) throw new Error('The rail is not rolling.');
        const duration = Number(roll.effect?.getComputedTiming().duration);
        roll.pause();
        roll.currentTime = duration - 0.001;
        return -new DOMMatrixReadOnly(getComputedStyle(element).transform).m42;
      });

    const wide = await loopLength(page);
    expect(wide).toBeGreaterThan(0);
    expect(await endOfLoop()).toBeCloseTo(wide, 1);

    await page.setViewportSize({ width: 1000, height: 620 });
    const narrow = await loopLength(page);
    expect(narrow).toBeLessThan(wide * 0.8);
    await expect.poll(endOfLoop).toBeCloseTo(narrow, 1);
  });
});

test.describe('the rail with reduced motion', () => {
  test('does not roll, shows the cards once, and scrolls by hand to the last card', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    const rail = page.locator('[data-rail]');
    const track = rail.locator('[data-rail-track]');

    const before = await rolled(page);
    await page.waitForTimeout(1000);
    expect(await rolled(page)).toEqual(before);
    expect(before).toEqual({ x: 0, y: 0 });
    expect(await track.evaluate((element) => element.getAnimations().length)).toBe(0);

    await expect(rail.locator('.cards').nth(0)).toBeVisible();
    await expect(rail.locator('.cards').nth(1)).toBeHidden();

    const last = rail.locator('.card', { hasText: 'Codeforces Specialist' }).first();
    await expect(last).not.toBeInViewport({ ratio: 1 });
    await rail.hover();
    await page.mouse.wheel(0, 4000);
    await expect(last).toBeInViewport({ ratio: 1 });

    // The page itself still does not scroll.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});

test.describe('the top links', () => {
  for (const [index, label] of ['GitHub', 'LinkedIn', 'Resume'].entries()) {
    test(`${label} rises 2 px, draws its underline and tilts its logo under the pointer`, async ({
      page,
    }) => {
      await open(page);
      const link = page.getByRole('banner').getByRole('link').nth(index);
      await expect(link).toHaveText(label);
      const logo = link.locator('svg');

      const restTop = await topOf(link);
      const layout = await link.evaluate((element: HTMLElement) => [
        element.offsetTop,
        element.offsetLeft,
        element.offsetWidth,
      ]);
      expect((await underline(link)).scale).toBe(0);
      await expect(logo).toHaveCSS('transform', 'none');

      await link.hover();
      await expect.poll(() => topOf(link)).toBeCloseTo(restTop - 2, 1);
      await expect.poll(async () => (await underline(link)).scale).toBe(1);
      expect((await underline(link)).colour).toBe(INK);
      await expect(logo).not.toHaveCSS('transform', 'none');
      await expect(link).toHaveCSS('outline-style', 'none');

      // A reaction, not a reflow: the link's place in the layout has not changed.
      expect(
        await link.evaluate((element: HTMLElement) => [
          element.offsetTop,
          element.offsetLeft,
          element.offsetWidth,
        ]),
      ).toEqual(layout);

      await page.mouse.move(720, 450);
      await expect.poll(() => topOf(link)).toBeCloseTo(restTop, 1);
      await expect.poll(async () => (await underline(link)).scale).toBe(0);
    });
  }

  test('react the same way to keyboard focus', async ({ page }) => {
    await open(page);
    const link = page.getByRole('banner').getByRole('link').first();
    const restTop = await topOf(link);

    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    await expect.poll(() => topOf(link)).toBeCloseTo(restTop - 2, 1);
    await expect.poll(async () => (await underline(link)).scale).toBe(1);
    await expect(link.locator('svg')).not.toHaveCSS('transform', 'none');
  });
});

test.describe('the project links', () => {
  const studio = CHANNELS[0];

  test('rise 2 px and strengthen their underline in the channel colour', async ({ page }) => {
    await open(page);
    const link = page.locator('[data-now-links] a').first();
    await expect(link).toHaveText(studio.links[0].label);
    await expect(link).toHaveCSS('color', rgb(studio.accent));

    const restTop = await topOf(link);
    const rest = await underline(link);
    expect(rest.scale).toBe(1);
    expect(rest.colour).toBe(rgb(studio.accent));
    expect(rest.opacity).toBeLessThan(1);

    await link.hover();
    await expect.poll(() => topOf(link)).toBeCloseTo(restTop - 2, 1);
    await expect
      .poll(() => underline(link))
      .toEqual({ scale: 1, colour: rgb(studio.accent), opacity: 1 });
    await expect(link).toHaveCSS('color', rgb(studio.accent));
    await expect(link).toHaveCSS('outline-style', 'none');
    await expect(link).toHaveText(studio.links[0].label);
  });

  test('react the same way to keyboard focus', async ({ page }) => {
    await open(page);
    const link = page.locator('[data-now-links] a').first();
    const restTop = await topOf(link);

    await link.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    await expect.poll(() => topOf(link)).toBeCloseTo(restTop - 2, 1);
    await expect.poll(async () => (await underline(link)).opacity).toBe(1);
  });
});
