import { expect, test, type Locator, type Page } from '@playwright/test';
import { CHANNELS, NOTES, PERSON } from '../../src/data/site';
import { openFinished } from './finished';

// The finished page as it stands with nothing moving: what a visitor sees once the
// opening has played, with channel 1 on screen.

test.skip(({ isMobile }) => isMobile, 'The desktop arrangement; the phone has its own tests.');

interface Size {
  width: number;
  height: number;
}

// Every desktop window the page is checked at. 1440×900 is the size the page is
// composed at; the portrait one is a desktop window turned on its side.
const REFERENCE: Size = { width: 1440, height: 900 };
const SIZES: Size[] = [
  REFERENCE,
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 1366, height: 650 },
  { width: 1280, height: 600 },
  { width: 1920, height: 940 },
  { width: 2560, height: 1300 },
  { width: 900, height: 1300 },
];

const key = (size: Size): string => `${size.width}×${size.height}`;

// Where the window is wide enough that every project's description fits on one line.
const ONE_LINE_AT = ['1440×900', '1920×1080', '2560×1300'];

// The smallest each kind of lettering may be drawn, in pixels.
const FLOOR = { railName: 11, railCaption: 10, dialNumber: 9 };

// The weight of every drawn line at the reference size, and the least it may be.
const LINE_AT_REFERENCE = 1.5;
const LINE_FLOOR = 1.25;

// The AMPLIfied photo is 148 pixels at the reference size and grows no more than this.
const PHOTO_MAX = 1.25 * 148;

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
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function inside(box: Box, size: Size): boolean {
  return (
    box.width > 0 &&
    box.height > 0 &&
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.width <= size.width &&
    box.y + box.height <= size.height
  );
}

async function open(page: Page, size: Size): Promise<void> {
  await page.setViewportSize(size);
  await openFinished(page);
  await page.evaluate(() => document.fonts.ready);
}

/** Opens the page with the clock held, so the set changes channel only when told to. */
async function openHeld(page: Page, size: Size): Promise<void> {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await open(page, size);
}

/** Turns the dial one step on and lets the words under the set settle. */
async function nextChannel(page: Page, number: number): Promise<void> {
  await page.locator('[data-dial]').press('ArrowRight');
  await expect(page.locator('html')).toHaveAttribute('data-channel', String(number));
  await page.clock.runFor(300);
  await expect(page.locator('[data-now-title]')).toHaveText(CHANNELS[number - 1].title);
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.getAnimations().every((each) => !(each instanceof CSSTransition)),
      ),
    )
    .toBe(true);
}

/** How many lines of text an element is set on. */
function linesOf(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const range = document.createRange();
    range.selectNodeContents(element);
    const tops = new Set(
      Array.from(range.getClientRects())
        .filter((rect) => rect.width > 0)
        .map((rect) => Math.round(rect.top)),
    );
    // A line box is at least the line height; the rects of one line share a top.
    // The text's own height is measured, not the element's: a description is a
    // grid item stretched to the tallest of the hidden ones beside it.
    return Math.max(
      tops.size,
      Math.round(range.getBoundingClientRect().height / parseFloat(style.lineHeight)),
    );
  });
}

function fontSizeOf(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const size = parseFloat(getComputedStyle(element).fontSize);
    // Lettering inside a drawing is scaled with the drawing.
    if (element instanceof SVGGraphicsElement) {
      const matrix = element.getScreenCTM();
      return matrix === null ? size : size * Math.hypot(matrix.a, matrix.b);
    }
    return size;
  });
}

/**
 * The weight a drawn line is shown at, in pixels. A line in a drawing is its stroke
 * scaled with the drawing (or not, if it keeps its weight whatever the scale). A box
 * drawn in outline is its ring; a line drawn as a thin box is its width.
 */
function weightOf(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    if (element instanceof SVGGeometryElement) {
      const width = parseFloat(style.strokeWidth);
      if (style.vectorEffect === 'non-scaling-stroke') return width;
      const matrix = element.getScreenCTM();
      return matrix === null ? width : width * Math.hypot(matrix.a, matrix.b);
    }
    const ring = /([\d.]+)px inset/.exec(style.boxShadow);
    if (ring !== null) return parseFloat(ring[1]);
    const border = parseFloat(style.borderTopWidth);
    if (border > 0) return border;
    return parseFloat(style.width);
  });
}

// The parts of the drawing that are all drawn in the one line.
const DRAWN = [
  '.tv-body',
  '.legs i',
  '.antenna i',
  '.knob[data-dial]',
  '[data-cable] .wire',
  '[data-cable] .doodle path',
  '[data-hint] path',
];

for (const size of SIZES) {
  test.describe(`at ${key(size)}`, () => {
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

    test('has everything on screen, and the rail, the set, the cable, the words and the top bar clear of each other', async ({
      page,
    }) => {
      await open(page, size);
      const parts = {
        name: page.locator('.name'),
        tagline: page.locator('[data-tagline]'),
        links: page.getByRole('banner').getByRole('navigation'),
        tv: page.locator('[data-tv]'),
        dial: page.locator('[data-dial]'),
        title: page.locator('[data-now-title]'),
        line: page.locator('[data-now-line]'),
        linkRow: page.locator('[data-now-links]'),
        rail: page.locator('[data-rail]'),
        cable: page.locator('[data-cable]'),
        hint: page.locator('[data-hint]'),
      };
      for (const [name, locator] of Object.entries(parts)) {
        expect(inside(await boxOf(locator), size), `${name} on screen`).toBe(true);
      }

      const apart = {
        top: await boxOf(page.getByRole('banner')),
        rail: await boxOf(parts.rail),
        tv: await boxOf(parts.tv),
        cable: await boxOf(parts.cable),
        words: await boxOf(page.locator('[data-now]')),
      };
      const names = Object.keys(apart) as (keyof typeof apart)[];
      for (const [index, a] of names.entries()) {
        for (const b of names.slice(index + 1)) {
          expect(intersect(apart[a], apart[b]), `${a} clear of ${b}`).toBe(false);
        }
      }
    });

    test('starts the rail at least 24px under the line beneath his name', async ({ page }) => {
      await open(page, size);
      const line = await boxOf(page.locator('[data-tagline]'));
      // The rail's top: where its tracks and its fade begin.
      const rail = await boxOf(page.locator('.results'));
      expect(rail.y - (line.y + line.height)).toBeGreaterThanOrEqual(24);
    });

    test('says what he is on one line under his name', async ({ page }) => {
      await open(page, size);
      const tagline = page.locator('[data-tagline]');
      await expect(tagline).toHaveText(PERSON.tagline);
      expect(PERSON.tagline).toBe('Open to Summer 2027 SWE internships');
      expect(await linesOf(tagline)).toBe(1);
      const name = await boxOf(page.locator('.name'));
      const line = await boxOf(tagline);
      expect(line.y).toBeGreaterThanOrEqual(name.y + name.height - 1);
      expect(await tagline.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(109, 109, 117)');
    });

    test('never sets the rail or the dial numbers below their smallest sizes', async ({ page }) => {
      await open(page, size);
      const rail = page.locator('[data-rail]');
      for (const name of await rail.locator('.cap b').all()) {
        expect(await fontSizeOf(name)).toBeGreaterThanOrEqual(FLOOR.railName);
      }
      for (const caption of await rail.locator('.cap .sub').all()) {
        expect(await fontSizeOf(caption)).toBeGreaterThanOrEqual(FLOOR.railCaption);
      }
      const numbers = page.locator('.dial-num');
      await expect(numbers).toHaveCount(3);
      for (const number of await numbers.all()) {
        expect(await fontSizeOf(number)).toBeGreaterThanOrEqual(FLOOR.dialNumber);
      }
      // Nothing in a card is cut off by the card.
      for (const card of await rail.locator('.card').all()) {
        const clipped = await card.evaluate((element) =>
          Array.from(element.querySelectorAll<HTMLElement>('.cap > *')).some((part) => {
            const box = part.getBoundingClientRect();
            const edge = element.getBoundingClientRect();
            return (
              part.scrollWidth > part.clientWidth + 1 ||
              box.left < edge.left - 0.5 ||
              box.right > edge.right + 0.5
            );
          }),
        );
        expect(clipped).toBe(false);
      }
    });

    test('draws the set, the dial, the cable and the doodles in one line weight', async ({
      page,
    }) => {
      await open(page, size);
      const weights: number[] = [];
      for (const selector of DRAWN) {
        const parts = await page.locator(selector).all();
        expect(parts.length, selector).toBeGreaterThan(0);
        for (const part of parts) weights.push(await weightOf(part));
      }
      const lightest = Math.min(...weights);
      const heaviest = Math.max(...weights);
      expect(heaviest - lightest).toBeLessThanOrEqual(0.1);
      expect(lightest).toBeGreaterThanOrEqual(LINE_FLOOR - 0.01);
      if (key(size) === key(REFERENCE)) expect(lightest).toBeCloseTo(LINE_AT_REFERENCE, 1);
    });

    test('sets each description on at most two lines with the links at one height', async ({
      page,
    }) => {
      await openHeld(page, size);
      const line = page.locator('[data-now-line]');
      const linkRow = page.locator('[data-now-links]');
      const tops: number[] = [];
      for (const channel of CHANNELS) {
        if (channel.number > 1) await nextChannel(page, channel.number);
        const lines = await linesOf(line);
        expect(lines, `${channel.title} lines`).toBeLessThanOrEqual(2);
        if (ONE_LINE_AT.includes(key(size))) expect(lines, `${channel.title} lines`).toBe(1);
        // Two lines are balanced: the shorter is at least half the longer.
        if (lines === 2) {
          const widths = await line.evaluate((element) => {
            const range = document.createRange();
            range.selectNodeContents(element);
            const byTop = new Map<number, number>();
            for (const rect of Array.from(range.getClientRects())) {
              const top = Math.round(rect.top);
              byTop.set(top, (byTop.get(top) ?? 0) + rect.width);
            }
            return Array.from(byTop.values());
          });
          expect(Math.min(...widths) / Math.max(...widths)).toBeGreaterThan(0.5);
        }
        tops.push((await boxOf(linkRow)).y);
      }
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
    });

    test('keeps the doodles and the notes clear of the cable, of each other and of the rest', async ({
      page,
    }) => {
      await open(page, size);
      const found = await page.evaluate(() => {
        const cable = document.querySelector('[data-cable]');
        const wire = cable?.querySelector<SVGPathElement>('.wire');
        if (!cable || !wire) throw new Error('No cable.');
        const matrix = wire.getScreenCTM();
        if (matrix === null) throw new Error('The cable is not drawn.');
        // Points along the line, in the page's pixels.
        const length = wire.getTotalLength();
        const points = Array.from({ length: 600 }, (_, index) => {
          const point = wire.getPointAtLength((index / 599) * length);
          return new DOMPoint(point.x, point.y).matrixTransform(matrix);
        });
        const drawn = [
          ...Array.from(cable.querySelectorAll('.doodle')),
          // A note on two lines is measured a line at a time.
          ...Array.from(cable.querySelectorAll('.note:not(:has(tspan)), .note tspan')),
        ].map((element, index) => {
          const box = element.getBoundingClientRect();
          return {
            // The lines of one note may touch each other.
            group: element.closest('.note') === null ? index : element.closest('.note'),
            name: element.textContent?.trim() || element.getAttribute('class') || '',
            box: { x: box.x, y: box.y, width: box.width, height: box.height },
          };
        });
        const others = ['[data-tv]', '[data-rail]', '[data-now]', 'header'].map((selector) => {
          const box = document.querySelector(selector)?.getBoundingClientRect();
          if (!box) throw new Error(selector);
          return {
            name: selector,
            box: { x: box.x, y: box.y, width: box.width, height: box.height },
          };
        });
        const notes: (Element | null)[] = Array.from(cable.querySelectorAll('.note'));
        return {
          points: points.map((p) => ({ x: p.x, y: p.y })),
          drawn: drawn.map(({ group, ...rest }) => ({
            ...rest,
            group: typeof group === 'number' ? `drawing ${group}` : `note ${notes.indexOf(group)}`,
          })),
          others,
        };
      });

      const clear = 2;
      for (const [index, { name, box }] of found.drawn.entries()) {
        expect(inside(box, size), `${name} on screen`).toBe(true);
        const grown = {
          x: box.x - clear,
          y: box.y - clear,
          width: box.width + 2 * clear,
          height: box.height + 2 * clear,
        };
        const touching = found.points.some(
          (p) =>
            p.x >= grown.x &&
            p.x <= grown.x + grown.width &&
            p.y >= grown.y &&
            p.y <= grown.y + grown.height,
        );
        expect(touching, `${name} clear of the cable`).toBe(false);
        const group = found.drawn[index].group;
        const rest = found.drawn.slice(index + 1).filter((other) => other.group !== group);
        for (const other of [...rest, ...found.others]) {
          expect(intersect(box, other.box), `${name} clear of ${other.name}`).toBe(false);
        }
      }
    });

    test('keeps the rail filled with cards from top to bottom', async ({ page }) => {
      await open(page, size);
      const fill = await page.locator('[data-rail]').evaluate((rail) => {
        const cards = Array.from(rail.querySelectorAll('.card')).map((card) =>
          card.getBoundingClientRect(),
        );
        const copies = Array.from(rail.querySelectorAll('.cards'));
        const loop = copies[1].getBoundingClientRect().top - copies[0].getBoundingClientRect().top;
        const gap = parseFloat(getComputedStyle(copies[0]).rowGap);
        return {
          rail: rail.getBoundingClientRect().height,
          // How far the cards reach below the rail's top at the end of one roll.
          reach:
            Math.max(...cards.map((card) => card.bottom)) -
            Math.min(...cards.map((card) => card.top)) -
            loop,
          gap,
        };
      });
      expect(fill.reach).toBeGreaterThanOrEqual(fill.rail - fill.gap);
    });
  });
}

test.describe('on a wide window', () => {
  // The rail-to-set gap as a share of the set's width.
  async function gapShare(page: Page, size: Size): Promise<number> {
    await open(page, size);
    const rail = await boxOf(page.locator('[data-rail]'));
    const tv = await boxOf(page.locator('[data-tv]'));
    return (tv.x - (rail.x + rail.width)) / tv.width;
  }

  test('keeps the rail as close to the set as at the reference size', async ({ page }) => {
    const reference = await gapShare(page, REFERENCE);
    for (const size of [
      { width: 1920, height: 1080 },
      { width: 2560, height: 1300 },
    ]) {
      const share = await gapShare(page, size);
      expect(Math.abs(share - reference) / reference, key(size)).toBeLessThanOrEqual(0.15);
    }
  });

  test('stops growing once the photo is a quarter larger, and stays centred', async ({ page }) => {
    const size = { width: 2560, height: 1300 };
    await open(page, size);
    const photo = await boxOf(page.locator('[data-rail] .card.photo img').first());
    expect(photo.width).toBeLessThanOrEqual(PHOTO_MAX + 0.5);

    const boxes = await Promise.all(
      ['[data-rail]', '[data-tv]', '[data-cable]'].map((selector) => boxOf(page.locator(selector))),
    );
    const left = Math.min(...boxes.map((box) => box.x));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    expect(Math.abs((left + right) / 2 - size.width / 2)).toBeLessThanOrEqual(0.02 * size.width);
  });
});

test('reads the cable notes in order: tried a lot of things, then the ones that stayed', async ({
  page,
}) => {
  await open(page, REFERENCE);
  const first = await boxOf(page.locator('[data-cable] .note', { hasText: NOTES.first }));
  const second = await boxOf(page.locator('[data-cable] .note', { hasText: NOTES.second[0] }));
  expect(first.y + first.height).toBeLessThanOrEqual(second.y);
});

test('draws the doodles about one and a half times their old size', async ({ page }) => {
  await open(page, REFERENCE);
  // The doodles were drawn 24 units across in a cable 284 units wide.
  const share = await page.locator('[data-cable]').evaluate((cable) => {
    const width = cable.getBoundingClientRect().width;
    return Array.from(cable.querySelectorAll('.doodle')).map((doodle) => {
      const box = doodle.getBoundingClientRect();
      return Math.max(box.width, box.height) / width;
    });
  });
  for (const each of share) {
    // A doodle's drawing fills most of its 24 units: 1.5 times that is 26 to 36 units.
    expect(each).toBeGreaterThanOrEqual(26 / 284);
    expect(each).toBeLessThanOrEqual(38 / 284);
  }
});

test('points the arrow of the note by the dial at the dial', async ({ page }) => {
  await open(page, REFERENCE);
  const aim = await page.evaluate(() => {
    const shaft = document.querySelector<SVGPathElement>('[data-hint] path');
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
    const before = at(end - 4);
    return {
      tip: { x: tip.x, y: tip.y },
      direction: { x: tip.x - before.x, y: tip.y - before.y },
      dial: { x: dial.x, y: dial.y, width: dial.width, height: dial.height },
    };
  });
  // Carried on from its tip, the arrow runs into the dial.
  const { tip, direction, dial } = aim;
  const centre = { x: dial.x + dial.width / 2, y: dial.y + dial.height / 2 };
  const toCentre = { x: centre.x - tip.x, y: centre.y - tip.y };
  const along =
    (toCentre.x * direction.x + toCentre.y * direction.y) / Math.hypot(direction.x, direction.y);
  const off =
    Math.abs(toCentre.x * direction.y - toCentre.y * direction.x) /
    Math.hypot(direction.x, direction.y);
  expect(along).toBeGreaterThan(0);
  expect(off).toBeLessThanOrEqual(dial.width / 2);
});

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
