import { expect, test, type Locator, type Page } from '@playwright/test';
import { CHANNELS, PERSON } from '../../src/data/site';
import { openFinished } from './finished';

// The page on a phone: one column, the set across the width, the words and the
// cable's band under it, and the rail as a strip along the bottom. Also the
// phone held sideways, a tablet, and the page turned between the two layouts.

test.skip(({ isMobile }) => !isMobile, 'Phone tests run in the phone project, which has touch.');

interface Size {
  width: number;
  height: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PHONE: Size = { width: 390, height: 844 };
const SIZES: Size[] = [
  PHONE,
  { width: 360, height: 740 },
  { width: 360, height: 620 },
  { width: 412, height: 915 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
];
const DESKTOP: Size = { width: 1440, height: 900 };

const key = (size: Size): string => `${size.width}×${size.height}`;

// The smallest lettering a visitor has to read, and the dial's numbers.
const READ_FLOOR = 10;
const DIAL_FLOOR = 9;
const TARGET = 44;

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`No box for ${locator}`);
  return box;
}

function intersect(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function open(page: Page, size: Size): Promise<void> {
  await page.setViewportSize(size);
  await openFinished(page);
  await page.evaluate(() => document.fonts.ready);
}

/** Every element that shows and is not inside something that clips it, off the screen. */
function offScreen(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const out: string[] = [];
    for (const element of Array.from(document.body.querySelectorAll('*'))) {
      // The rail and the screen clip what is in them; the rail's cards roll off by design.
      if (element.closest('[data-rail] > *, [data-screen] > *, .label, script')) continue;
      if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      const slack = 0.5;
      if (
        box.left < -slack ||
        box.top < -slack ||
        box.right > width + slack ||
        box.bottom > height + slack
      ) {
        out.push(`${element.tagName.toLowerCase()}.${element.getAttribute('class') ?? ''}`);
      }
    }
    return out;
  });
}

async function expectFits(page: Page): Promise<void> {
  const extent = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));
  expect(extent.scrollWidth).toBeLessThanOrEqual(extent.innerWidth);
  expect(extent.scrollHeight).toBeLessThanOrEqual(extent.innerHeight);
  expect(await offScreen(page)).toEqual([]);
}

/**
 * The drawn parts of whichever cable shows, and the boxes they must keep clear
 * of: points along its line, the boxes of its notes, drawings and plug.
 */
function cableAndRest(page: Page): Promise<{
  wire: { x: number; y: number }[];
  drawn: { name: string; box: Box }[];
  plug: Box | null;
  boxes: Record<'tv' | 'rail' | 'words' | 'top', Box>;
}> {
  return page.evaluate(() => {
    const plain = (rect: DOMRect): Box => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
    const shown = (element: Element): boolean =>
      element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    const drawing = Array.from(document.querySelectorAll('.cable svg')).find(shown);
    if (drawing === undefined) throw new Error('No cable drawing shows.');
    const wire = drawing.querySelector<SVGPathElement>('.wire');
    let points: { x: number; y: number }[] = [];
    if (wire !== null && shown(wire)) {
      const matrix = wire.getScreenCTM();
      if (matrix === null) throw new Error('The cable is not drawn.');
      const length = wire.getTotalLength();
      points = Array.from({ length: 600 }, (_, index) => {
        const point = wire.getPointAtLength((index / 599) * length);
        const at = new DOMPoint(point.x, point.y).matrixTransform(matrix);
        return { x: at.x, y: at.y };
      });
    }
    const drawn = Array.from(drawing.querySelectorAll('.doodle, .note tspan, .note:not(:has(tspan))'))
      .filter(shown)
      .map((element) => ({
        name: element.textContent?.trim() || element.getAttribute('class') || '',
        box: plain(element.getBoundingClientRect()),
      }));
    const plug = drawing.querySelector('.plug rect');
    const box = (selector: string): Box => {
      const found = document.querySelector(selector);
      if (found === null) throw new Error(selector);
      return plain(found.getBoundingClientRect());
    };
    return {
      wire: points,
      drawn,
      plug: plug === null ? null : plain(plug.getBoundingClientRect()),
      boxes: {
        tv: box('[data-tv]'),
        rail: box('.results'),
        words: box('[data-now]'),
        top: box('header'),
      },
    };
  });
}

/** The rail, the set, the cable, the words and the top bar keep clear of each other. */
async function expectClear(page: Page): Promise<void> {
  const { wire, drawn, plug, boxes } = await cableAndRest(page);
  const names = Object.keys(boxes) as (keyof typeof boxes)[];
  for (const [index, a] of names.entries()) {
    for (const b of names.slice(index + 1)) {
      expect(intersect(boxes[a], boxes[b]), `${a} clear of ${b}`).toBe(false);
    }
  }
  const within = (p: { x: number; y: number }, box: Box): boolean =>
    p.x > box.x + 1 && p.x < box.x + box.width - 1 && p.y > box.y + 1 && p.y < box.y + box.height - 1;
  for (const name of names) {
    expect(
      wire.some((p) => within(p, boxes[name])),
      `the cable's line clear of ${name}`,
    ).toBe(false);
    for (const each of drawn) {
      expect(intersect(each.box, boxes[name]), `${each.name} clear of ${name}`).toBe(false);
    }
  }
  // The plug meets the set's right side.
  expect(plug).not.toBeNull();
  if (plug !== null) {
    const right = boxes.tv.x + boxes.tv.width;
    expect(Math.abs(plug.x - right)).toBeLessThanOrEqual(3);
    expect(plug.y).toBeGreaterThan(boxes.tv.y);
    expect(plug.y + plug.height).toBeLessThan(boxes.tv.y + boxes.tv.height);
  }
}

/** How far the rail's track has rolled, in pixels: `x` leftward, `y` upward. */
function rolled(page: Page): Promise<{ x: number; y: number }> {
  return page.locator('[data-rail-track]').evaluate((track) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(track).transform);
    return { x: 0 - matrix.m41, y: 0 - matrix.m42 };
  });
}

/** A finger laid on a point, drawn along by `dx`, and lifted. */
async function swipe(page: Page, from: { x: number; y: number }, dx: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const touch = async (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    x: number,
    y: number,
  ): Promise<void> => {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    });
  };
  await touch('touchStart', from.x, from.y);
  for (let step = 1; step <= 8; step += 1) await touch('touchMove', from.x + (dx * step) / 8, from.y);
  await touch('touchEnd', from.x + dx, from.y);
  await cdp.detach();
}

function centreOf(box: Box): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const thrown = new WeakMap<Page, Error[]>();

test.beforeEach(({ page }) => {
  const errors: Error[] = [];
  thrown.set(page, errors);
  page.on('pageerror', (error) => errors.push(error));
});

test.afterEach(({ page }) => {
  expect(thrown.get(page) ?? []).toEqual([]);
});

for (const size of SIZES) {
  test.describe(`at ${key(size)}`, () => {
    test('fits with no scrollbar and nothing off the screen', async ({ page }) => {
      await open(page, size);
      await expectFits(page);
    });

    test('keeps the rail, the set, the cable, the words and the top bar clear of each other', async ({
      page,
    }) => {
      await open(page, size);
      await expectClear(page);
    });

    test('sets nothing to be read below 10px, and gives a finger room on every control', async ({
      page,
    }) => {
      await open(page, size);
      const small = await page.evaluate(
        ({ floor }) => {
          const out: string[] = [];
          for (const element of Array.from(document.body.querySelectorAll('*'))) {
            if (element.closest('[data-screen], .label, [aria-hidden="true"] p')) continue;
            if (element.matches('.dial-num')) continue;
            const own = Array.from(element.childNodes).some(
              (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
            );
            if (!own) continue;
            if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
            let px = parseFloat(getComputedStyle(element).fontSize);
            if (element instanceof SVGGraphicsElement) {
              const matrix = element.getScreenCTM();
              if (matrix !== null) px *= Math.hypot(matrix.a, matrix.b);
            }
            if (px < floor - 0.01) out.push(`${element.textContent?.trim()} ${px.toFixed(1)}px`);
          }
          return out;
        },
        { floor: READ_FLOOR },
      );
      expect(small).toEqual([]);
      for (const number of await page.locator('.dial-num').all()) {
        const px = await number.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        expect(px).toBeGreaterThanOrEqual(DIAL_FLOOR);
      }

      // Each control's target: its own box, or the margin a finger is given round it.
      const controls = page.locator('header a, [data-now-links] a, [data-dial]');
      const targets: Box[] = [];
      for (const control of await controls.all()) {
        targets.push(
          await control.evaluate((element) => {
            const own = element.getBoundingClientRect();
            const margin = getComputedStyle(element, '::before');
            let box = { x: own.x, y: own.y, width: own.width, height: own.height };
            if (margin.content !== 'none' && margin.position === 'absolute') {
              const top = parseFloat(margin.top);
              const left = parseFloat(margin.left);
              box = {
                x: own.x + left,
                y: own.y + top,
                width: own.width - left - parseFloat(margin.right),
                height: own.height - top - parseFloat(margin.bottom),
              };
            }
            return box;
          }),
        );
      }
      for (const target of targets) {
        expect(target.width).toBeGreaterThanOrEqual(TARGET - 0.5);
        expect(target.height).toBeGreaterThanOrEqual(TARGET - 0.5);
      }
      for (const [index, a] of targets.entries()) {
        for (const b of targets.slice(index + 1)) {
          // Touching edges are fine; a thumb cannot be on two at once if they do not overlap.
          const shrunk = { x: a.x + 0.5, y: a.y + 0.5, width: a.width - 1, height: a.height - 1 };
          expect(intersect(shrunk, b)).toBe(false);
        }
      }
    });
  });
}

test.describe('at 390×844', () => {
  test('runs the rail as a strip along the bottom, below everything else', async ({ page }) => {
    await open(page, PHONE);
    const rail = await boxOf(page.locator('[data-rail]'));
    const strip = await boxOf(page.locator('.results'));
    expect(rail.width).toBeGreaterThan(rail.height * 2);
    expect(PHONE.height - (strip.y + strip.height)).toBeLessThanOrEqual(24);
    for (const hook of ['[data-tv]', '[data-now]', '[data-cable-phone]']) {
      const above = await boxOf(page.locator(hook));
      expect(above.y + above.height, hook).toBeLessThanOrEqual(strip.y);
    }
    // The tracks lie along it, above and below.
    const tracks = await page.locator('.results .trk').all();
    expect(tracks).toHaveLength(2);
    for (const track of tracks) {
      const box = await boxOf(track);
      expect(box.width).toBeGreaterThan(box.height * 50);
    }
    await expect(page.locator('[data-rail]')).toHaveAttribute('data-axis', 'x');
  });

  test('shows the top links as logos, named for screen readers', async ({ page }) => {
    await open(page, PHONE);
    const banner = page.getByRole('banner');
    for (const name of ['GitHub', 'LinkedIn', 'Resume']) {
      const link = banner.getByRole('link', { name, exact: true });
      await expect(link).toBeVisible();
      await expect(link.locator('svg')).toBeVisible();
      // The name itself is not drawn.
      const label = await link.locator('.label').boundingBox();
      expect(label === null || label.width <= 1).toBe(true);
    }
  });

  test('says what he is on one line under his name', async ({ page }) => {
    await open(page, PHONE);
    const tagline = page.locator('[data-tagline]');
    await expect(tagline).toHaveText(PERSON.tagline);
    const lines = await tagline.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
    });
    expect(lines).toBe(1);
    const name = await boxOf(page.locator('.name'));
    expect((await boxOf(tagline)).y).toBeGreaterThanOrEqual(name.y + name.height - 1);
  });

  test('says "tap the dial" under the set, with its arrow pointing at the dial', async ({
    page,
  }) => {
    await open(page, PHONE);
    const hint = page.locator('[data-hint]');
    await expect(hint).toHaveText('tap the dial', { useInnerText: true });
    const tv = await boxOf(page.locator('[data-tv]'));
    const note = await boxOf(hint);
    expect(note.y).toBeGreaterThanOrEqual(tv.y + tv.height);
    expect(note.x + note.width).toBeLessThanOrEqual(tv.x + tv.width);
    expect(note.x).toBeGreaterThan(tv.x + tv.width / 2);

    const aim = await page.evaluate(() => {
      const shaft = Array.from(document.querySelectorAll<SVGPathElement>('[data-hint] path')).find(
        (path) => path.checkVisibility(),
      );
      const dial = document.querySelector('[data-dial]')?.getBoundingClientRect();
      if (!shaft || !dial) throw new Error('No arrow or dial.');
      const matrix = shaft.getScreenCTM();
      if (matrix === null) throw new Error('The arrow is not drawn.');
      const at = (length: number): DOMPoint => {
        const point = shaft.getPointAtLength(length);
        return new DOMPoint(point.x, point.y).matrixTransform(matrix);
      };
      const end = shaft.getTotalLength();
      const tip = at(end);
      const before = at(end - 3);
      return {
        tip: { x: tip.x, y: tip.y },
        direction: { x: tip.x - before.x, y: tip.y - before.y },
        dial: { x: dial.x, y: dial.y, width: dial.width, height: dial.height },
      };
    });
    const { tip, direction, dial } = aim;
    const centre = centreOf(dial);
    const toCentre = { x: centre.x - tip.x, y: centre.y - tip.y };
    const length = Math.hypot(direction.x, direction.y);
    const along = (toCentre.x * direction.x + toCentre.y * direction.y) / length;
    const off = Math.abs(toCentre.x * direction.y - toCentre.y * direction.x) / length;
    expect(along).toBeGreaterThan(0);
    expect(off).toBeLessThanOrEqual(dial.width);
  });

  test('draws the cable to the set and its notes in reading order beside the tangle', async ({
    page,
  }) => {
    await open(page, PHONE);
    await expect(page.locator('html')).toHaveAttribute('data-give', '0');
    const first = await boxOf(page.locator('[data-cable-phone] .note-run'));
    const second = await boxOf(page.locator('[data-cable-phone] .note-tangle'));
    expect(first.y + first.height).toBeLessThanOrEqual(second.y + 1);
    await expect(page.locator('[data-cable-phone] .doodle')).toHaveCount(5);
    for (const doodle of await page.locator('[data-cable-phone] .doodle').all()) {
      await expect(doodle).toBeVisible();
    }
    // The line runs beside the words, not across them.
    const words = await boxOf(page.locator('[data-now]'));
    const { wire } = await cableAndRest(page);
    const alongside = wire.filter((p) => p.y > words.y && p.y < words.y + words.height);
    expect(alongside.length).toBeGreaterThan(0);
    for (const p of alongside) expect(p.x).toBeGreaterThan(words.x + words.width);
  });

  test('puts the clips on the screen ready for a phone: muted, inline, with a poster', async ({
    page,
  }) => {
    await open(page, PHONE);
    for (const clip of await page.locator('[data-screen] video').all()) {
      await expect(clip).toHaveJSProperty('muted', true);
      await expect(clip).toHaveAttribute('playsinline', '');
      await expect(clip).toHaveAttribute('muted', '');
      await expect(clip).toHaveAttribute('poster', /\.(jpg|png|webp)$/);
    }
  });
});

test('on a short phone it gives up the small drawings first, and keeps the set, the words and the rail', async ({
  page,
}) => {
  await open(page, { width: 360, height: 620 });
  const give = Number(await page.locator('html').getAttribute('data-give'));
  expect(give).toBeGreaterThanOrEqual(1);
  for (const hook of ['[data-tv]', '[data-now-title]', '[data-now-links]', '[data-rail]', 'header']) {
    await expect(page.locator(hook)).toBeVisible();
  }
  await expect(page.locator('[data-cable-phone] .doodle').first()).toBeHidden();
  await expect(page.locator('[data-cable-phone] .plug')).toBeVisible();
});

test.describe('the dial on a phone', () => {
  test('a tap changes the channel', async ({ page }) => {
    await open(page, PHONE);
    await page.locator('[data-dial]').tap();
    await expect(page.locator('html')).toHaveAttribute('data-channel', '2');
    await expect(page.locator('[data-now-title]')).toHaveText(CHANNELS[1].title);
    await expect(page.locator('html')).toHaveAttribute('data-touched', '');
  });

  test('a drag on it changes nothing, by finger or by mouse', async ({ page }) => {
    await open(page, PHONE);
    const dial = centreOf(await boxOf(page.locator('[data-dial]')));
    await swipe(page, dial, 40);
    await page.waitForTimeout(400);
    await expect(page.locator('html')).toHaveAttribute('data-channel', '1');

    await page.mouse.move(dial.x, dial.y);
    await page.mouse.down();
    await page.mouse.move(dial.x + 30, dial.y + 4, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    await expect(page.locator('html')).toHaveAttribute('data-channel', '1');
    await expect(page.locator('[data-dial]')).not.toHaveAttribute('style', /rotate\(/);
  });
});

test.describe('touch does not leave anything stuck', () => {
  test('a tap on the words does not hold the channel', async ({ page }) => {
    await page.clock.install({ time: 0 });
    await open(page, PHONE);
    await page.locator('[data-now-title]').tap();
    await page.clock.runFor(7100);
    await expect(page.locator('html')).toHaveAttribute('data-channel', '2');
  });

  test('a tapped link and the touched rail do not stay lit', async ({ page, context }) => {
    await open(page, PHONE);
    const link = page.locator('[data-now-links] a').first();
    const popup = context.waitForEvent('page');
    await link.tap();
    await (await popup).close();
    await expect(link).toHaveCSS('transform', 'none');
    await page.locator('[data-rail]').tap();
    await expect
      .poll(() => page.locator('[data-rail]').evaluate((el) => Number(getComputedStyle(el).opacity)))
      .toBeCloseTo(0.62, 2);
  });
});

test.describe('the rail on a phone', () => {
  test('rolls leftward', async ({ page }) => {
    await open(page, PHONE);
    const from = await rolled(page);
    await expect.poll(async () => (await rolled(page)).x, { timeout: 5000 }).toBeGreaterThan(from.x + 2);
    expect((await rolled(page)).y).toBe(0);
  });

  test('turns its axis when the page changes layout, and back', async ({ page }) => {
    await open(page, PHONE);
    const rail = page.locator('[data-rail]');
    const rolls = (): Promise<number> =>
      rail.evaluate((el) => el.querySelector('[data-rail-track]')?.getAnimations().length ?? 0);
    await expect(rail).toHaveAttribute('data-axis', 'x');
    await page.setViewportSize(DESKTOP);
    await expect(rail).toHaveAttribute('data-axis', 'y');
    // One roll, along the new axis: the old one was stopped.
    await expect.poll(rolls).toBe(1);
    const down = await rolled(page);
    await expect.poll(async () => (await rolled(page)).y).toBeGreaterThan(down.y + 2);
    expect((await rolled(page)).x).toBe(0);
    await page.setViewportSize(PHONE);
    await expect(rail).toHaveAttribute('data-axis', 'x');
    await expect.poll(rolls).toBe(1);
    const across = await rolled(page);
    await expect.poll(async () => (await rolled(page)).x).toBeGreaterThan(across.x + 2);
  });

  test('a resize within the phone layout does not start it again', async ({ page }) => {
    await open(page, PHONE);
    const animation = (): Promise<string> =>
      page.locator('[data-rail-track]').evaluate((track) => {
        const [roll] = track.getAnimations();
        const tag = (roll as Animation & { tag?: string }).tag ?? String(Math.random());
        (roll as Animation & { tag?: string }).tag = tag;
        return tag;
      });
    const before = await animation();
    await page.setViewportSize({ width: 412, height: 915 });
    await expect(page.locator('[data-rail]')).toHaveAttribute('data-axis', 'x');
    expect(await animation()).toBe(before);
  });
});

test.describe('changing layout', () => {
  test('from the desktop to a phone and back, nothing overlaps at either size', async ({ page }) => {
    await open(page, DESKTOP);
    await expect(page.locator('html')).not.toHaveAttribute('data-phone', '');
    await expectClear(page);
    await page.setViewportSize(PHONE);
    await expect(page.locator('html')).toHaveAttribute('data-phone', '');
    await expectClear(page);
    await expectFits(page);
    await page.setViewportSize(DESKTOP);
    await expect(page.locator('html')).not.toHaveAttribute('data-phone', '');
    await expectClear(page);
    await expectFits(page);
  });

  test('turning the phone during the opening still ends on the finished page, nothing clipped', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'cable', { timeout: 5000 });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'done', { timeout: 3000 });
    await expect(page.locator('[data-mascot]')).toBeHidden();
    await page.waitForTimeout(500);
    await expectFits(page);
    await expect(page.locator('[data-rail]')).toHaveAttribute('data-axis', 'y');
  });
});

test.describe('with reduced motion on a phone', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the finished page at once, no mascot, and a still rail that scrolls sideways by hand', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'done');
    await expect(page.locator('html')).toHaveAttribute('data-reduced', '');
    await expect(page.locator('[data-mascot]')).toBeHidden();
    const rail = page.locator('[data-rail]');
    await expect(rail).toHaveAttribute('data-axis', 'x');
    await expect(rail).toHaveAttribute('data-motion', 'still');
    await page.waitForTimeout(600);
    expect(await rolled(page)).toEqual({ x: 0, y: 0 });

    // A finger drawn leftward along it brings the last card into view.
    const box = await boxOf(rail);
    for (let pass = 0; pass < 4; pass += 1) {
      await swipe(page, { x: box.x + box.width - 20, y: box.y + box.height / 2 }, -(box.width - 60));
    }
    await expect.poll(() => rail.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    const last = rail.locator('.cards').first().locator('.card').last();
    await expect
      .poll(async () => {
        const card = await boxOf(last);
        return card.x + card.width <= box.x + box.width + 1;
      })
      .toBe(true);
  });
});

test.describe('the opening on a phone', () => {
  // The mascot's scene is made of Web Animations, which Playwright's clock does
  // not move, so these run in real time, as `mascot.spec.ts` does.
  test.setTimeout(60_000);

  /** Where the mascot stands against the set's top edge, in its own units. */
  function stance(page: Page): Promise<{ feet: number; left: number; u: number }> {
    return page.evaluate(() => {
      const mascot = document.querySelector<HTMLElement>('[data-mascot]');
      const tv = document.querySelector<HTMLElement>('[data-tv]');
      if (!mascot || !tv) throw new Error('A hook is missing.');
      const m = mascot.getBoundingClientRect();
      const t = tv.getBoundingClientRect();
      return { feet: m.bottom - t.top, left: m.left - t.left, u: mascot.offsetWidth / 54 };
    });
  }

  test('the mascot stands on the set and lights the strip from left to right', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    // Read at the moment the rail is lit, before anything has painted.
    await page.evaluate(() => {
      const root = document.documentElement;
      new MutationObserver(() => {
        if (root.dataset.stage !== 'lit') return;
        const rail = document.querySelector('[data-rail]');
        const wipe = rail?.getAnimations().find((each) => each.id === 'opening');
        const tracks = Array.from(document.querySelectorAll('.results .trk')).map((track) =>
          (track.getAnimations()[0]?.effect as KeyframeEffect | undefined)?.getKeyframes(),
        );
        const torch = document.querySelector('[data-torch]')?.getAnimations().at(-1);
        Object.assign(window, {
          lit: {
            wipe: (wipe?.effect as KeyframeEffect | undefined)?.getKeyframes().map((k) => k.clipPath),
            tracks: tracks.map((frames) => frames?.map((k) => k.transform)),
            sweep: (torch?.effect as KeyframeEffect | undefined)
              ?.getKeyframes()
              .map((k) => String(k.transform)),
          },
        });
      }).observe(root, { attributeFilter: ['data-stage'] });
    });

    await expect(page.locator('html')).toHaveAttribute('data-stage', 'lit', { timeout: 20_000 });
    const lit = (await page.evaluate(() => (window as unknown as { lit: unknown }).lit)) as {
      wipe: string[];
      tracks: string[][];
      sweep: string[];
    };
    expect(lit.wipe[0]).toBe('inset(0px 100% 0px 0px)');
    for (const frames of lit.tracks) expect(frames[0]).toBe('scaleX(0)');
    // The torch turns from pointing down at the strip's near end to its far end.
    const angles = lit.sweep.map((transform) => Number(/rotate\((-?[\d.]+)deg\)/.exec(transform)?.[1]));
    expect(angles[0]).toBeLessThan(-60);
    expect(angles[0]).toBeGreaterThan(-100);
    expect(angles[1]).toBeLessThan(angles[0]);
    expect(angles[1]).toBeGreaterThan(-160);

    // Standing on the top-left of the set, its feet just behind the top edge.
    const standing = await stance(page);
    expect(standing.feet).toBeGreaterThanOrEqual(0);
    expect(standing.feet).toBeLessThanOrEqual(4 * standing.u);
    expect(standing.left).toBeGreaterThanOrEqual(0);

    await expect(page.locator('html')).toHaveAttribute('data-stage', 'done', { timeout: 20_000 });
    await expect(page.locator('[data-mascot]')).toBeHidden();
    await expect(page.locator('[data-rail]')).toHaveCSS('clip-path', 'none');
    await expect(page.locator('[data-rail]')).toHaveAttribute('data-axis', 'x');
    await expect(page.locator('[data-hint]')).toBeVisible();
    await expectFits(page);
  });

  test('a resize while the mascot is out keeps it on the set', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'lit', { timeout: 20_000 });
    const before = await stance(page);
    await page.setViewportSize({ width: 412, height: 915 });
    await expect(page.locator('html')).toHaveAttribute('data-phone', '');
    await page.waitForTimeout(100);
    const after = await stance(page);
    expect(after.u).toBeGreaterThan(before.u);
    expect(after.feet).toBeGreaterThanOrEqual(0);
    expect(after.feet).toBeLessThanOrEqual(4 * after.u);
    expect(Math.abs(after.left / after.u - before.left / before.u)).toBeLessThanOrEqual(1);
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'done', { timeout: 20_000 });
    await expectFits(page);
  });
});

test.describe('with no script', () => {
  for (const size of [PHONE, { width: 360, height: 620 }]) {
    test(`is a finished page that fits at ${key(size)}`, async ({ browser }) => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
        viewport: size,
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-stage', 'done');
      for (const hook of ['header', '[data-tv]', '[data-now-title]', '[data-now-links]', '[data-rail]']) {
        await expect(page.locator(hook)).toBeVisible();
      }
      await expect(page.locator('[data-hint]')).toHaveText('tap the dial', { useInnerText: true });
      await expectFits(page);
      await expectClear(page);
      await context.close();
    });
  }
});
