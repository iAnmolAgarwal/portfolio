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
    // The desktop's cable or the phone's, whichever shows.
    const drawing = Array.from(document.querySelectorAll('.cable')).find(shown);
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

    if (size.height > size.width) {
      test('keeps the cable inside the margins and paper under the last thing drawn', async ({
        page,
      }) => {
        await open(page, size);
        const { wire, plug } = await cableAndRest(page);
        const column = await boxOf(page.locator('header'));
        for (const p of wire) {
          expect(p.x).toBeGreaterThanOrEqual(column.x - 0.5);
          expect(p.x).toBeLessThanOrEqual(column.x + column.width + 0.5);
        }
        if (plug !== null) expect(plug.x + plug.width).toBeLessThanOrEqual(column.x + column.width);
        const lowest = await page.evaluate(() =>
          Math.max(
            ...Array.from(
              document.querySelectorAll(
                '[data-cable-phone] .wire, [data-cable-phone] .note, [data-cable-phone] .doodle, [data-now] *, [data-tv] *, .results',
              ),
            )
              .filter((element) => element.checkVisibility({ opacityProperty: true }))
              .map((element) => element.getBoundingClientRect().bottom),
          ),
        );
        expect(size.height - lowest).toBeGreaterThanOrEqual(16);
      });
    }

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
  test('runs the rail as a strip directly under the name, above the set', async ({ page }) => {
    await open(page, PHONE);
    const rail = await boxOf(page.locator('[data-rail]'));
    const strip = await boxOf(page.locator('.results'));
    const line = await boxOf(page.locator('[data-tagline]'));
    const logos = await boxOf(page.getByRole('banner').getByRole('navigation'));
    expect(rail.width).toBeGreaterThan(rail.height * 2);
    // A small, fixed gap under the line; nothing of the top bar over it.
    expect(strip.y - (line.y + line.height)).toBeGreaterThanOrEqual(14);
    expect(strip.y - (line.y + line.height)).toBeLessThanOrEqual(22);
    expect(intersect(strip, logos)).toBe(false);
    for (const hook of ['.antenna', '[data-tv]', '[data-now]', '[data-cable-phone]']) {
      const below = await boxOf(page.locator(hook));
      expect(below.y, hook).toBeGreaterThanOrEqual(strip.y + strip.height);
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

  test('shares the spare height evenly above the antenna and under the band', async ({ page }) => {
    await open(page, PHONE);
    const strip = await boxOf(page.locator('.results'));
    const antenna = await boxOf(page.locator('.antenna'));
    const band = await boxOf(page.locator('[data-cable-phone]'));
    const above = antenna.y - (strip.y + strip.height);
    const below = PHONE.height - (band.y + band.height);
    expect(Math.abs(above - below)).toBeLessThanOrEqual(4);
    expect(above).toBeLessThanOrEqual(57);
    expect(below).toBeLessThanOrEqual(57);
    // The set, the words and the band have more room between them than at their tightest.
    const tv = await boxOf(page.locator('[data-tv]'));
    const words = await boxOf(page.locator('[data-now]'));
    expect(words.y - (tv.y + tv.height)).toBeGreaterThan(26);
    expect(band.y - (words.y + words.height)).toBeGreaterThan(16);
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

  test('reads the band top to bottom: the first note, the five drawings, the second note', async ({
    page,
  }) => {
    await open(page, PHONE);
    await expect(page.locator('html')).toHaveAttribute('data-give', '0');
    const first = await boxOf(page.locator('[data-cable-phone] .note-run'));
    const drawings = await boxOf(page.locator('[data-cable-phone] .doodles'));
    const second = await boxOf(page.locator('[data-cable-phone] .note-tangle'));
    expect(first.y + first.height).toBeLessThanOrEqual(drawings.y + 1);
    expect(drawings.y + drawings.height).toBeLessThanOrEqual(second.y + 1);
    // The lines of writing share one left edge.
    expect(Math.abs(first.x - second.x)).toBeLessThanOrEqual(0.5);
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
  // Without the drawings the two notes still read as two, a clear gap apart.
  const first = await boxOf(page.locator('[data-cable-phone] .note-run'));
  const second = await boxOf(page.locator('[data-cable-phone] .note-tangle'));
  await expect(page.locator('[data-cable-phone] .note-tangle')).toBeVisible();
  expect(second.y - (first.y + first.height)).toBeGreaterThanOrEqual(8);
});

test.describe('what each size gives up', () => {
  // Every upright size the tests use, with an iPhone's Safari with its bars
  // shown (390×664) and hidden part-way (390×745), and the level each lands on.
  const LEVELS: [Size, number][] = [
    [PHONE, 0],
    [{ width: 360, height: 740 }, 0],
    [{ width: 360, height: 620 }, 1],
    [{ width: 412, height: 915 }, 0],
    [{ width: 768, height: 1024 }, 0],
    [{ width: 390, height: 664 }, 1],
    [{ width: 390, height: 745 }, 0],
  ];
  // How much too tall a level may be and still be kept (`GIVE_TOLERANCE_PX`).
  const TOLERANCE = 3;

  /** The column's height at each level, measured as the page measures it. */
  function needed(page: Page): Promise<number[]> {
    return page.evaluate(() => {
      const root = document.documentElement;
      const give = root.dataset.give;
      const kept = [root.style.getPropertyValue('--more'), root.style.getPropertyValue('--above')];
      root.style.removeProperty('--more');
      root.style.removeProperty('--above');
      root.setAttribute('data-measuring', '');
      const heights = [0, 1, 2, 3].map((level) => {
        root.dataset.give = String(level);
        return document.body.getBoundingClientRect().height;
      });
      root.removeAttribute('data-measuring');
      root.dataset.give = give;
      root.style.setProperty('--more', kept[0]);
      root.style.setProperty('--above', kept[1]);
      return heights;
    });
  }

  for (const [size, level] of LEVELS) {
    test(`at ${key(size)} it gives up level ${level}, with room to spare either way`, async ({
      page,
    }) => {
      await open(page, size);
      await expect(page.locator('html')).toHaveAttribute('data-give', String(level));
      const heights = await needed(page);
      // A few pixels' difference in lettering on a real phone does not change the level.
      expect(size.height + TOLERANCE - heights[level]).toBeGreaterThan(TOLERANCE + 2);
      if (level > 0) expect(heights[level - 1] - size.height).toBeGreaterThan(TOLERANCE + 1);
    });
  }

  test('a level a pixel or two too tall is kept, scaled down to fit', async ({ page }) => {
    // 390 wide, the cable without its drawings needs a little over 650.
    await open(page, { width: 390, height: 664 });
    const heights = await needed(page);
    const height = Math.floor(heights[1]) - 1;
    await page.setViewportSize({ width: 390, height });
    await expect(page.locator('html')).toHaveAttribute('data-give', '1');
    await expect(page.locator('[data-cable-phone] .note-run')).toBeVisible();
    await expectFits(page);
  });
});

test.describe('at 768×1024', () => {
  test('the paper above the antenna and under the band are even', async ({ page }) => {
    const size = { width: 768, height: 1024 };
    await open(page, size);
    const strip = await boxOf(page.locator('.results'));
    const antenna = await boxOf(page.locator('.antenna'));
    const band = await boxOf(page.locator('[data-cable-phone]'));
    const above = antenna.y - (strip.y + strip.height);
    const below = size.height - (band.y + band.height);
    expect(Math.abs(above - below)).toBeLessThanOrEqual(3);
  });
});

test('on a phone held sideways the rail starts well under the line beneath his name', async ({
  page,
}) => {
  await open(page, { width: 844, height: 390 });
  const line = await boxOf(page.locator('[data-tagline]'));
  const rail = await boxOf(page.locator('.results'));
  expect(rail.y - (line.y + line.height)).toBeGreaterThanOrEqual(24);
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
      .poll(() =>
        page
          .locator('[data-rail] .card .art')
          .first()
          .evaluate((el) => Number(getComputedStyle(el).opacity)),
      )
      .toBeCloseTo(0.62, 2);
  });
});

/**
 * Each of the rail's words in the first copy of the cards: its own colour, how
 * strongly it is drawn (its own opacity and every element's above it), and the
 * contrast that gives it against the paper.
 */
function railWords(
  page: Page,
): Promise<{ what: string; colour: string; strength: number; contrast: number }[]> {
  return page.evaluate(() => {
    const paper = [246, 246, 243];
    const luminance = (rgb: number[]): number => {
      const [r, g, b] = rgb.map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const words = Array.from(
      document.querySelectorAll<HTMLElement>('[data-rail] .cards:first-child .cap > *'),
    );
    return words.map((element) => {
      const colour = getComputedStyle(element).color;
      const rgb = (colour.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
      let strength = 1;
      for (let at: Element | null = element; at !== null; at = at.parentElement) {
        strength *= Number(getComputedStyle(at).opacity);
      }
      const seen = rgb.map((v, i) => v * strength + paper[i] * (1 - strength));
      const [light, dark] = [luminance(paper), luminance(seen)].sort((a, b) => b - a);
      return {
        what: `${element.tagName.toLowerCase()}${element.className ? `.${element.className}` : ''} ${element.textContent ?? ''}`,
        colour,
        strength,
        contrast: (light + 0.05) / (dark + 0.05),
      };
    });
  });
}

test.describe('the rail on a phone', () => {
  test('draws its words at full strength, readable on the paper, and dims only the pictures and outlines', async ({
    page,
  }) => {
    await open(page, PHONE);
    const words = await railWords(page);
    // A name, a line and a number on each of the four cards.
    expect(words).toHaveLength(12);
    for (const word of words) {
      expect(word.strength, word.what).toBe(1);
      expect(word.contrast, word.what).toBeGreaterThanOrEqual(4.5);
    }
    const colours = (tag: string): string[] =>
      words.filter((word) => word.what.startsWith(`${tag} `)).map((word) => word.colour);
    expect(new Set(colours('b'))).toEqual(new Set(['rgb(22, 22, 26)']));
    expect(new Set(colours('span.rank'))).toEqual(new Set(['rgb(22, 22, 26)']));
    expect(new Set(colours('span.sub'))).toEqual(new Set(['rgb(109, 109, 117)']));

    const card = page.locator('[data-rail] .card').first();
    for (const picture of await page.locator('[data-rail] .cards').first().locator('.art').all()) {
      await expect(picture).toHaveCSS('opacity', '0.62');
    }
    await expect(card).toHaveCSS('border-top-color', 'rgba(22, 22, 26, 0.62)');
    await expect(card.locator('.cap')).toHaveCSS('border-top-color', 'rgba(22, 22, 26, 0.62)');
  });

  for (const size of [
    { width: 844, height: 390 },
    { width: 900, height: 1300 },
  ]) {
    test(`at ${key(size)}, in the desktop arrangement, the rail is dimmed as a whole as before`, async ({
      page,
    }) => {
      await open(page, size);
      await expect(page.locator('html')).not.toHaveAttribute('data-phone');
      await expect(page.locator('[data-rail]')).toHaveCSS('opacity', '0.62');
      for (const word of await railWords(page)) expect(word.strength, word.what).toBeCloseTo(0.62, 2);
      await expect(page.locator('[data-rail] .card .art').first()).toHaveCSS('opacity', '1');
      await expect(page.locator('[data-rail] .card').first()).toHaveCSS(
        'border-top-color',
        'rgb(22, 22, 26)',
      );
    });
  }

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

  test('loops over exactly one copy of the cards, and still does after a resize', async ({
    page,
  }) => {
    await open(page, PHONE);
    const track = page.locator('[data-rail-track]');
    const loopLength = (): Promise<number> =>
      track.evaluate((element) => {
        const [first, second] = Array.from(element.children);
        return second.getBoundingClientRect().left - first.getBoundingClientRect().left;
      });
    // Park the roll at the very end of its loop, where the seam would show.
    const endOfLoop = (): Promise<number> =>
      track.evaluate((element) => {
        const [roll] = element.getAnimations();
        if (roll === undefined) throw new Error('The rail is not rolling.');
        const duration = Number(roll.effect?.getComputedTiming().duration);
        roll.pause();
        roll.currentTime = duration - 0.001;
        return -new DOMMatrixReadOnly(getComputedStyle(element).transform).m41;
      });
    const first = await loopLength();
    expect(first).toBeGreaterThan(0);
    expect(await endOfLoop()).toBeCloseTo(first, 1);
    await page.setViewportSize({ width: 412, height: 915 });
    await expect.poll(loopLength).toBeGreaterThan(first * 1.03);
    const wider = await loopLength();
    await expect.poll(endOfLoop).toBeCloseTo(wider, 1);
    await page.setViewportSize({ width: 360, height: 740 });
    await expect.poll(loopLength).toBeLessThan(first);
    await expect.poll(async () => (await endOfLoop()) - (await loopLength())).toBeCloseTo(0, 1);
  });

  test('a finger on the strip holds it, and it rolls on when lifted', async ({ page }) => {
    await open(page, PHONE);
    const strip = await boxOf(page.locator('[data-rail]'));
    const at = centreOf(strip);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
    await page.waitForTimeout(200);
    const held = (await rolled(page)).x;
    await page.waitForTimeout(600);
    expect((await rolled(page)).x).toBeCloseTo(held, 1);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await expect.poll(async () => (await rolled(page)).x).toBeGreaterThan(held + 2);
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

  /** One frame of the opening as the record keeps it; `clipTop` is where the scene is cut off above. */
  interface Frame {
    stage: string;
    mascot: Box | null;
    clipTop: number | null;
    beam: Box | null;
    beamOpacity: number;
  }

  interface Lit {
    wipe: { frames: string[]; duration: number; easing: string; start: number };
    sweep: { frames: string[]; offsets: number[]; duration: number; easing: string; start: number };
    tracks: string[][];
    pivot: { x: number; y: number };
    rail: Box;
  }

  /** Opens the page and keeps a record of the opening, frame by frame. */
  async function record(page: Page): Promise<void> {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await page.evaluate(() => {
      const root = document.documentElement;
      const mascot = document.querySelector<HTMLElement>('[data-mascot]');
      const torch = document.querySelector<HTMLElement>('[data-torch]');
      const beam = document.querySelector<HTMLElement>('[data-beam]');
      const rail = document.querySelector<HTMLElement>('[data-rail]');
      const scene = mascot?.parentElement;
      if (!mascot || !torch || !beam || !rail || !scene) throw new Error('A hook is missing.');
      const plain = (rect: DOMRect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
      const frames: unknown[] = [];
      const store = { frames, lit: null as unknown };
      Object.assign(window, { trace: store });

      const timing = (animation: Animation) => {
        const effect = animation.effect as KeyframeEffect;
        const { duration, easing } = effect.getTiming();
        return { duration: Number(duration), easing: String(easing) };
      };
      new MutationObserver(() => {
        if (root.dataset.stage !== 'lit' || store.lit !== null) return;
        const wipe = rail.getAnimations().find((each) => each.id === 'opening');
        const sweep = torch.getAnimations().at(-1);
        if (!wipe || !sweep) throw new Error('No wipe or sweep.');
        const m = mascot.getBoundingClientRect();
        const t = getComputedStyle(torch);
        const lit = {
          wipe: {
            frames: (wipe.effect as KeyframeEffect).getKeyframes().map((k) => String(k.clipPath)),
            ...timing(wipe),
            start: 0,
          },
          sweep: {
            frames: (sweep.effect as KeyframeEffect).getKeyframes().map((k) => String(k.transform)),
            offsets: (sweep.effect as KeyframeEffect).getKeyframes().map((k) => Number(k.computedOffset)),
            ...timing(sweep),
            start: 0,
          },
          tracks: Array.from(document.querySelectorAll('.results .trk')).map((track) =>
            ((track.getAnimations()[0]?.effect as KeyframeEffect | undefined)?.getKeyframes() ?? []).map(
              (k) => String(k.transform),
            ),
          ),
          // Where the torch turns: the middle of its near end, the mascot standing.
          pivot: {
            x: m.right - parseFloat(t.right),
            y: m.top + parseFloat(t.top) + parseFloat(t.height) / 2,
          },
          rail: plain(rail.getBoundingClientRect()),
        };
        store.lit = lit;
        void Promise.all([wipe.ready, sweep.ready]).then(() => {
          lit.wipe.start = Number(wipe.startTime);
          lit.sweep.start = Number(sweep.startTime);
        });
      }).observe(root, { attributeFilter: ['data-stage'] });

      const clipTop = (): number | null => {
        const clip = getComputedStyle(scene).clipPath;
        if (clip === 'none') return null;
        const inset = /^inset\((-?[\d.]+)px/.exec(clip);
        if (inset) return Number(inset[1]);
        const polygon = /^polygon\(\S+ (-?[\d.]+)px/.exec(clip);
        return polygon ? Number(polygon[1]) : null;
      };
      const sample = (): void => {
        const showing = getComputedStyle(mascot).visibility === 'visible';
        frames.push({
          stage: root.dataset.stage,
          mascot: showing ? plain(mascot.getBoundingClientRect()) : null,
          clipTop: clipTop(),
          beam: showing ? plain(beam.getBoundingClientRect()) : null,
          beamOpacity: Number(getComputedStyle(beam).opacity),
        });
        if (root.dataset.stage !== 'done') requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }

  test('the mascot peeks inside the screen, then lights the strip from its left end to its right end', async ({
    page,
  }) => {
    await record(page);
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'done', { timeout: 25_000 });
    const trace = (await page.evaluate(() => (window as unknown as { trace: unknown }).trace)) as {
      frames: Frame[];
      lit: Lit;
    };

    // The peek and the climb: all of the mascot on the screen, with paper to its left.
    const out = trace.frames.filter((frame) => frame.mascot !== null);
    expect(out.length).toBeGreaterThan(20);
    for (const { mascot } of out) {
      if (mascot === null) continue;
      expect(mascot.x).toBeGreaterThanOrEqual(2);
      expect(mascot.y).toBeGreaterThanOrEqual(0);
      expect(mascot.x + mascot.width).toBeLessThanOrEqual(PHONE.width);
    }

    // The light crosses the strip at an even pace from one end to the other: each
    // of the torch's turns aims the beam's middle at an evenly spaced point along
    // the strip's middle, from its left edge to its right edge.
    const { lit } = trace;
    const middle = lit.rail.y + lit.rail.height / 2;
    const hits = lit.sweep.frames.map((transform) => {
      const turn = (Number(/rotate\((-?[\d.]+)deg\)/.exec(transform)?.[1]) * Math.PI) / 180;
      const direction = { x: -Math.cos(turn), y: -Math.sin(turn) };
      const along = (middle - lit.pivot.y) / direction.y;
      expect(along).toBeGreaterThan(0);
      return lit.pivot.x + along * direction.x;
    });
    expect(hits.length).toBeGreaterThan(8);
    expect(hits[0]).toBeCloseTo(lit.rail.x, 0);
    expect(hits[hits.length - 1]).toBeCloseTo(lit.rail.x + lit.rail.width, 0);
    hits.forEach((x, index) => {
      const wanted = lit.rail.x + lit.rail.width * lit.sweep.offsets[index];
      expect(Math.abs(x - wanted)).toBeLessThanOrEqual(2);
    });
    // The strip opens from the left in step: the same time, length and easing.
    expect(lit.wipe.frames[0]).toBe('inset(0px 100% 0px 0px)');
    expect(lit.wipe.duration).toBe(lit.sweep.duration);
    expect(lit.wipe.easing).toBe(lit.sweep.easing);
    expect(Math.abs(lit.wipe.start - lit.sweep.start)).toBeLessThanOrEqual(20);
    for (const frames of lit.tracks) expect(frames[0]).toBe('scaleX(0)');

    // The light is never drawn above the strip's top edge, so never over the top
    // bar, and never reaches the words under the set.
    const strip = await boxOf(page.locator('.results'));
    const words = await boxOf(page.locator('[data-now]'));
    const top = await page.evaluate(() =>
      Math.max(
        ...['.name', '[data-tagline]', 'header nav'].map(
          (selector) => document.querySelector(selector)?.getBoundingClientRect().bottom ?? 0,
        ),
      ),
    );
    const lighting = trace.frames.filter((frame) => frame.beamOpacity > 0 && frame.beam !== null);
    expect(lighting.length).toBeGreaterThan(20);
    for (const frame of lighting) {
      expect(frame.clipTop).not.toBeNull();
      expect(frame.clipTop ?? 0).toBeGreaterThanOrEqual(strip.y - 0.5);
      expect(frame.clipTop ?? 0).toBeGreaterThan(top);
      const beam = frame.beam as Box;
      const shown = { ...beam, y: Math.max(beam.y, frame.clipTop ?? 0) };
      shown.height = beam.y + beam.height - shown.y;
      if (shown.height > 0) expect(intersect(shown, words)).toBe(false);
    }

    await expect(page.locator('[data-mascot]')).toBeHidden();
    await expect(page.locator('[data-rail]')).toHaveCSS('clip-path', 'none');
    await expect(page.locator('.mascot-scene')).toHaveCSS('clip-path', 'none');
    await expect(page.locator('[data-rail]')).toHaveAttribute('data-axis', 'x');
    await expect(page.locator('[data-hint]')).toBeVisible();
    await expectFits(page);
  });

  test("the cable's notes and drawings come in in reading order", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'cable', { timeout: 5000 });
    const delays = await page.evaluate(() => {
      const delay = (element: Element): number =>
        Number(element.getAnimations()[0]?.effect?.getTiming().delay ?? Number.NaN);
      const band = document.querySelector('[data-cable-phone]');
      if (band === null) throw new Error('No band.');
      return {
        first: delay(band.querySelector('.note-run') as Element),
        drawings: Array.from(band.querySelectorAll('.doodle')).map(delay),
        second: delay(band.querySelector('.note-tangle') as Element),
      };
    });
    expect(delays.drawings).toHaveLength(5);
    expect(delays.first).toBeLessThan(delays.drawings[0]);
    for (let index = 1; index < 5; index += 1) {
      expect(delays.drawings[index]).toBeGreaterThan(delays.drawings[index - 1]);
    }
    expect(delays.drawings[4]).toBeLessThan(delays.second);
  });

  test('turning the phone while the mascot is out ends on the finished page', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'mascot', { timeout: 20_000 });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'done', { timeout: 3000 });
    await expect(page.locator('[data-mascot]')).toBeHidden();
    await expect(page.locator('.mascot-scene')).toHaveCSS('clip-path', 'none');
    await expect(page.locator('[data-rail]')).toHaveAttribute('data-axis', 'y');
    await page.waitForTimeout(500);
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
