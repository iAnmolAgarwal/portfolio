import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openFinished } from './finished';

// The last checks before he sees it: what the page says about itself to search
// engines and link previews, how it is used from the keyboard and by a screen
// reader, what it costs to load, and that nothing goes wrong while it plays.
// Everything here runs at the desktop size and on the phone.

const SITE = 'https://anmolagarwal.vercel.app/';
const TITLE = 'Anmol Agarwal';
const DESCRIPTION = 'Open to Summer 2027 SWE internships';
const PAPER = '#f6f6f3';
const INK = 'rgb(22, 22, 26)';

// The most the page may fetch before the set powers on: 1.2 MB.
const BUDGET_BYTES = 1_200_000;

// The finished page is in `dist/`, the share image and the résumé in `public/`.
const fromRoot = (path: string): URL => new URL(`../../${path}`, import.meta.url);

/** The page with its clock held, so nothing changes channel unless a test says so. */
async function open(page: Page): Promise<void> {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await openFinished(page);
}

/** Whatever has keyboard focus, named the way a screen reader would hear it. */
function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const at = document.activeElement;
    if (at === null || at === document.body) return 'nothing';
    if (at.matches('[data-dial]')) return 'dial';
    if (at.matches('[data-rail]')) return 'rail';
    return (at.textContent ?? '').trim();
  });
}

/** Waits until no CSS transition is still running, so a look can be read off. */
async function settled(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => document.getAnimations().every((a) => !(a instanceof CSSTransition))),
    )
    .toBe(true);
}

interface Mark {
  outlineStyle: string;
  outlineWidth: number;
  outlineColour: string;
  radius: string;
  underlineHeight: number;
  underlineOpacity: number;
  underlineShown: boolean;
  underlineColour: string;
  colour: string;
}

function markOf(locator: Locator): Promise<Mark> {
  return locator.evaluate((element) => {
    const own = getComputedStyle(element);
    const line = getComputedStyle(element, '::after');
    const scale = line.transform === 'none' ? 1 : new DOMMatrix(line.transform).a;
    return {
      outlineStyle: own.outlineStyle,
      outlineWidth: parseFloat(own.outlineWidth),
      outlineColour: own.outlineColor,
      radius: own.borderRadius,
      underlineHeight: parseFloat(line.height) || 0,
      underlineOpacity: parseFloat(line.opacity),
      underlineShown: line.display !== 'none' && line.content !== 'none' && scale > 0.99,
      underlineColour: line.backgroundColor,
      colour: own.color,
    };
  });
}

/** A picture of the element and a margin round it, with nothing else moving. */
async function lookOf(page: Page, locator: Locator): Promise<Buffer> {
  await settled(page);
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`No box for ${locator}`);
  const pad = 10;
  return page.screenshot({
    animations: 'disabled',
    clip: { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad },
  });
}

test.describe('what the page says about itself', () => {
  test('a title and a description that name him and say only what the page says', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(TITLE);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    const meta = (selector: string): Locator => page.locator(`head meta[${selector}]`);
    await expect(meta('name="description"')).toHaveAttribute('content', DESCRIPTION);
    await expect(meta('name="theme-color"')).toHaveAttribute('content', PAPER);

    // A link shared anywhere shows the same title, words and picture.
    const card: [string, string][] = [
      ['property="og:type"', 'website'],
      ['property="og:title"', TITLE],
      ['property="og:description"', DESCRIPTION],
      ['property="og:url"', SITE],
      ['property="og:image"', `${SITE}img/og.png`],
      ['property="og:image:width"', '1200'],
      ['property="og:image:height"', '630'],
      ['name="twitter:card"', 'summary_large_image'],
      ['name="twitter:title"', TITLE],
      ['name="twitter:description"', DESCRIPTION],
      ['name="twitter:image"', `${SITE}img/og.png`],
    ];
    for (const [selector, content] of card) {
      await expect(meta(selector), selector).toHaveAttribute('content', content);
    }
    await expect(meta('property="og:image:alt"')).toHaveAttribute('content', /\S/);
    await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', SITE);

    const icon = page.locator('head link[rel="icon"]');
    await expect(icon).toHaveCount(1);
    const href = await icon.getAttribute('href');
    const served = await page.request.get(href ?? '');
    expect(served.status()).toBe(200);
    expect(served.headers()['content-type']).toMatch(/^image\//);
  });

  test('a share image of the finished page, 1200×630 and under 300 KB', async ({ page }) => {
    const png = readFileSync(fromRoot('public/img/og.png'));
    // A PNG's width and height are the first two numbers of its header.
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    expect(png.length).toBeLessThan(300 * 1024);

    const served = await page.request.get('/img/og.png');
    expect(served.status()).toBe(200);
    expect(served.headers()['content-type']).toBe('image/png');
  });

  test('the résumé link opens the PDF the site serves', async ({ page }) => {
    await page.goto('/');
    const resume = page.getByRole('banner').getByRole('link', { name: 'Resume' });
    await expect(resume).toHaveAttribute('href', '/anmol-agarwal-resume.pdf');
    await expect(resume).toHaveAttribute('target', '_blank');

    const built = readFileSync(fromRoot('dist/anmol-agarwal-resume.pdf'));
    expect(built.subarray(0, 5).toString()).toBe('%PDF-');
    // The one that was put in `public/`, unchanged.
    expect(built.equals(readFileSync(fromRoot('public/anmol-agarwal-resume.pdf')))).toBe(true);
    const served = await page.request.get('/anmol-agarwal-resume.pdf');
    expect(served.status()).toBe(200);
    expect(served.headers()['content-type']).toBe('application/pdf');
  });

  test('every clip is muted, plays inline and has a poster', async ({ page }) => {
    await page.goto('/');
    const clips = page.locator('[data-screen] video');
    await expect(clips).toHaveCount(3);
    for (const clip of await clips.all()) {
      await expect(clip).toHaveAttribute('muted', '');
      await expect(clip).toHaveJSProperty('muted', true);
      await expect(clip).toHaveAttribute('playsinline', '');
      await expect(clip).toHaveAttribute('poster', /^\/media\/\w+\.jpg$/);
    }
  });
});

test.describe('from the keyboard', () => {
  test('the first Tab skips the opening and lands on the first top link, then on in order', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'off');

    await page.keyboard.press('Tab');
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'done');
    expect(await focused(page)).toBe('GitHub');

    const order = ['LinkedIn', 'Resume', 'dial', 'Watch the demo', 'nothing'];
    for (const next of order) {
      await page.keyboard.press('Tab');
      expect(await focused(page)).toBe(next);
    }
  });

  test('a Shift+Tab as the very first key skips the opening and lands on the last project link', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'off');

    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'done');
    expect(await focused(page)).toBe('Watch the demo');
    await expect(page.locator('[data-now-links] a').last()).toBeFocused();
  });

  test('every stop shows a clear mark, and the pointer look is unchanged', async ({
    page,
    isMobile,
  }) => {
    await open(page);
    const top = page.getByRole('banner').getByRole('link');
    const dial = page.locator('[data-dial]');
    const project = page.locator('[data-now-links] a').first();
    const stops = [top.nth(0), top.nth(1), top.nth(2), dial, project];

    // How each looks with nothing on it, before the keyboard has been used.
    const rest: Buffer[] = [];
    for (const stop of stops) rest.push(await lookOf(page, stop));
    const restMark = await Promise.all(stops.map(markOf));

    for (const [index, stop] of stops.entries()) {
      await page.keyboard.press('Tab');
      await expect(stop).toBeFocused();
      expect(await stop.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
      await settled(page);
      const mark = await markOf(stop);

      if (stop === dial) {
        // An ink ring round the dial, following its round shape.
        expect(mark.outlineStyle).toBe('solid');
        expect(mark.outlineWidth).toBeGreaterThanOrEqual(2);
        expect(mark.outlineColour).toBe(INK);
        expect(mark.radius).toBe('50%');
      } else if (isMobile && index < 3) {
        // A logo on its own has no underline to strengthen: an ink ring instead.
        expect(mark.outlineStyle).toBe('solid');
        expect(mark.outlineWidth).toBeGreaterThanOrEqual(2);
        expect(mark.outlineColour).toBe(INK);
      } else {
        // A full-strength underline, thicker than the one the pointer draws, in
        // the link's own colour.
        expect(mark.underlineShown).toBe(true);
        expect(mark.underlineOpacity).toBe(1);
        expect(mark.underlineHeight).toBeGreaterThanOrEqual(2);
        expect(mark.underlineHeight).toBeGreaterThan(restMark[index].underlineHeight);
        expect(mark.underlineColour).toBe(mark.colour);
      }
      expect(await lookOf(page, stop)).not.toEqual(rest[index]);
    }

    // With nothing focused every stop looks exactly as it did before.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(await Promise.all(stops.map(markOf))).toEqual(restMark);
    for (const mark of restMark) expect(mark.outlineStyle).toBe('none');

    if (isMobile) return;
    // Under the mouse: the underline it always had, and no ring.
    for (const stop of [top.first(), project]) {
      await stop.hover();
      await settled(page);
      const mark = await markOf(stop);
      expect(mark.outlineStyle).toBe('none');
      expect(mark.underlineShown).toBe(true);
      expect(mark.underlineHeight).toBe(1);
    }
    await dial.hover();
    await settled(page);
    expect((await markOf(dial)).outlineStyle).toBe('none');
  });

  test('the dial tells a screen reader which project is on, and Home and End go to the ends', async ({
    page,
  }) => {
    await open(page);
    const dial = page.locator('[data-dial]');
    await expect(dial).toHaveAccessibleName('Channel');
    await expect(dial).toHaveAttribute('role', 'slider');
    await expect(dial).toHaveAttribute('aria-valuetext', 'Channel 1, Studio');

    // A change by itself is told too.
    await page.clock.runFor(7000);
    await expect(page.locator('html')).toHaveAttribute('data-channel', '2');
    await expect(dial).toHaveAttribute('aria-valuenow', '2');
    await expect(dial).toHaveAttribute('aria-valuetext', 'Channel 2, Worth');

    await dial.focus();
    await page.keyboard.press('End');
    await expect(page.locator('html')).toHaveAttribute('data-channel', '3');
    await expect(dial).toHaveAttribute('aria-valuetext', 'Channel 3, Pathwise');
    await page.keyboard.press('Home');
    await expect(page.locator('html')).toHaveAttribute('data-channel', '1');
    await expect(dial).toHaveAttribute('aria-valuenow', '1');
    await expect(dial).toHaveAttribute('aria-valuetext', 'Channel 1, Studio');
  });

  test('with no script the dial is still a complete slider', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    const dial = page.locator('[data-dial]');
    await expect(dial).toHaveAttribute('role', 'slider');
    await expect(dial).toHaveAttribute('tabindex', '0');
    await expect(dial).toHaveAccessibleName('Channel');
    await expect(dial).toHaveAttribute('aria-valuemin', '1');
    await expect(dial).toHaveAttribute('aria-valuemax', '3');
    await expect(dial).toHaveAttribute('aria-valuenow', '1');
    await expect(dial).toHaveAttribute('aria-valuetext', 'Channel 1, Studio');
    await context.close();
  });
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the still rail is reached by Tab after the project links, and is named', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-reduced', '');
    const rail = page.locator('[data-rail]');
    await expect(rail).toHaveAttribute('data-motion', 'still');
    await expect(rail).toHaveAccessibleName('Results');

    const order = ['GitHub', 'LinkedIn', 'Resume', 'dial', 'Watch the demo', 'rail'];
    for (const next of order) {
      await page.keyboard.press('Tab');
      expect(await focused(page)).toBe(next);
    }
  });

  test('nothing moves: links do not rise, and only short fades are left', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-reduced', '');
    await expect(page.locator('html')).not.toHaveAttribute('data-settling');

    // Every transition left is a fade of 200 ms or less, or a colour.
    const transitions = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll('.link, .link svg, .now, .rail, .knob, .osd, .hint, .dial-num'),
      ).flatMap((element) => {
        const style = getComputedStyle(element);
        const after = getComputedStyle(element, '::after');
        return [style, after].flatMap((s) => {
          const names = s.transitionProperty.split(',').map((n) => n.trim());
          const times = s.transitionDuration.split(',').map((t) => parseFloat(t));
          return names.map((name, at) => ({
            on: `${element.className}`,
            name,
            seconds: times[at % times.length],
          }));
        });
      }),
    );
    for (const { on, name, seconds } of transitions) {
      if (seconds === 0) continue;
      expect(['opacity', 'color', 'background', 'background-color', 'box-shadow', 'visibility'], `${on}: ${name}`).toContain(name);
      if (name === 'opacity') expect(seconds, `${on}: ${name}`).toBeLessThanOrEqual(0.2);
    }

    // The keyboard's mark is there; the rise and the tilt are not.
    const link = page.getByRole('banner').getByRole('link').first();
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    await expect(link).toHaveCSS('transform', 'none');
    await expect(link.locator('svg')).toHaveCSS('transform', 'none');

    // A change of channel fades the words; it does not slide them.
    await page.locator('[data-dial]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-now]')).toHaveAttribute('data-swapping', '');
    await expect(page.locator('[data-now]')).toHaveCSS('transform', 'none');
  });
});

test.describe('loading', () => {
  test('before the set powers on it fetches under 1.2 MB, all from its own site', async ({
    page,
    baseURL,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    const bytes = new Map<string, number>();
    const urls = new Map<string, string>();
    cdp.on('Network.requestWillBeSent', (event) => urls.set(event.requestId, event.request.url));
    cdp.on('Network.dataReceived', (event) =>
      bytes.set(event.requestId, (bytes.get(event.requestId) ?? 0) + event.encodedDataLength),
    );
    cdp.on('Network.loadingFinished', (event) =>
      bytes.set(event.requestId, Math.max(bytes.get(event.requestId) ?? 0, event.encodedDataLength)),
    );

    // The clock is held at one second, while the cable is still being drawn.
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(1000);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('html')).toHaveAttribute('data-stage', /^(off|cable)$/);

    const origin = new URL(baseURL ?? '').origin;
    for (const url of urls.values()) {
      if (url.startsWith('data:') || url.startsWith('blob:')) continue;
      expect(new URL(url).origin, url).toBe(origin);
    }
    const asked = Array.from(urls.values(), (url) => new URL(url).pathname);
    expect(asked).toContain('/media/studio.mp4');
    expect(asked).not.toContain('/media/worth.mp4');
    expect(asked).not.toContain('/media/pathwise.mp4');

    const total = Array.from(bytes.values()).reduce((sum, n) => sum + n, 0);
    console.log(`fetched before power-on: ${total} bytes of ${BUDGET_BYTES}`);
    expect(total).toBeLessThan(BUDGET_BYTES);
  });

  test('its fonts are its own and show text at once', async ({ page, baseURL }) => {
    await page.goto('/');
    const faces = await page.evaluate(() =>
      Array.from(document.styleSheets).flatMap((sheet) =>
        Array.from(sheet.cssRules)
          .filter((rule): rule is CSSFontFaceRule => rule instanceof CSSFontFaceRule)
          .map((rule) => ({
            family: rule.style.getPropertyValue('font-family'),
            weight: rule.style.getPropertyValue('font-weight'),
            display: rule.style.getPropertyValue('font-display'),
            src: rule.style.getPropertyValue('src'),
            range: rule.style.getPropertyValue('unicode-range'),
            base: sheet.href ?? document.baseURI,
          })),
      ),
    );
    expect(faces.length).toBeGreaterThan(0);
    const origin = new URL(baseURL ?? '').origin;
    for (const face of faces) {
      expect(face.display, face.family).toBe('swap');
      for (const [, url] of face.src.matchAll(/url\("?([^")]+)"?\)/g)) {
        // A face small enough is written into the stylesheet itself.
        if (url.startsWith('data:')) continue;
        expect(new URL(url, face.base).origin, url).toBe(origin);
      }
    }
    // The bold mono is there for one digit by the dial, so it carries only digits.
    const bold = faces.filter((face) => /JetBrains/.test(face.family) && face.weight === '700');
    expect(bold.length).toBeGreaterThan(0);
    for (const face of bold) expect(face.range.toUpperCase()).toBe('U+30-39');
  });
});

test.describe('a full opening', () => {
  test.setTimeout(60_000);

  test('plays through with nothing in the console and nothing fetched from elsewhere', async ({
    page,
    baseURL,
  }) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(error.message));
    const origin = new URL(baseURL ?? '').origin;
    const away: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('data:') || url.startsWith('blob:')) return;
      if (new URL(url).origin !== origin) away.push(url);
    });

    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'off');
    // Left to play: the set comes on, the mascot lights the rail and goes.
    await expect(page.locator('html')).toHaveAttribute('data-stage', 'done', { timeout: 30_000 });
    await expect(page.locator('[data-hint]')).toBeVisible();
    await expect(page.locator('[data-mascot]')).toBeHidden();
    await expect(page.locator('[data-screen] video[data-on]')).toBeVisible();

    expect(problems).toEqual([]);
    expect(away).toEqual([]);
  });
});
