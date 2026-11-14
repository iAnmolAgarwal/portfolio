import { expect, test, type Locator, type Page } from '@playwright/test';
import { openFinished } from './finished';

// The set changing channel: by itself every 7 seconds, and by the dial, on the
// finished page. Timers run on Playwright's clock, which is paused before the page
// loads, so every wait below is exact, counted from the moment the opening is
// skipped and the set comes on. Animations and the clips themselves still run in
// real time.

test.skip(({ isMobile }) => isMobile, 'The desktop arrangement; the phone has its own tests.');

// The channel table from the design document.
const CHANNELS = [
  {
    title: 'Studio',
    poster: '/media/studio.jpg',
    links: [['Watch the demo', 'https://x.com/tw_anmolagarwal/status/2120085686854553646']],
  },
  {
    title: 'Worth',
    poster: '/media/worth.jpg',
    links: [
      ['Watch the demo', 'https://youtu.be/3RFpuFdSd7c'],
      ['Open the live app', 'https://worth.onrender.com'],
    ],
  },
  {
    title: 'Pathwise',
    poster: '/media/pathwise.jpg',
    links: [
      ['Open the live site', 'https://trypathwise.vercel.app'],
      ['GitHub', 'https://github.com/iAnmolAgarwal/pathwise'],
    ],
  },
];

const AUTO_MS = 7000;
const AFTER_MANUAL_MS = 20000;
const OSD_MS = 1600;
const NUDGE_AFTER_MS = 3200;
// The words under the set are replaced this long after the channel changes.
const TEXT_MS = 240;

async function open(page: Page): Promise<void> {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await openFinished(page);
  await expect(page.locator('html')).toHaveAttribute('data-channel', '1');
}

async function expectChannel(page: Page, number: 1 | 2 | 3): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-channel', String(number));
}

// Moves the clock on far enough for the words to be replaced, then checks them.
async function expectTitle(page: Page, title: string): Promise<void> {
  await page.clock.runFor(TEXT_MS);
  await expect(page.locator('[data-now-title]')).toHaveText(title);
}

function flashes(page: Page): Promise<number> {
  return page.locator('[data-static]').evaluate((el) => el.getAnimations().length);
}

async function centreOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`No box for ${locator}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Presses on the dial and lets go at a point given from the dial's centre.
async function dragDial(page: Page, to: { dx: number; dy: number }): Promise<void> {
  const centre = await centreOf(page.locator('[data-dial]'));
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x + to.dx, centre.y + to.dy, { steps: 6 });
  await expect(page.locator('[data-dial]')).toHaveAttribute('data-dragging', '');
  await page.mouse.up();
  await expect(page.locator('[data-dial]')).not.toHaveAttribute('data-dragging');
}

test('changes to Worth by itself after 7 seconds, then on round the three', async ({ page }) => {
  await open(page);
  const osd = page.locator('[data-osd]');
  const showing = page.locator('[data-screen] video[data-on]');

  await page.clock.runFor(AUTO_MS - 1);
  await expectChannel(page, 1);
  await expect(page.locator('[data-now-title]')).toHaveText('Studio');

  await page.clock.runFor(1);
  await expectChannel(page, 2);
  await expect(osd).toHaveText('CH 2');
  await expect(osd).toHaveAttribute('data-on', '');
  await expect(showing).toHaveCount(1);
  await expect(showing).toHaveAttribute('poster', CHANNELS[1].poster);
  await expect(page.locator('[data-dial]')).toHaveAttribute('aria-valuenow', '2');
  await expectTitle(page, 'Worth');
  await expect(page.locator('[data-now-line]')).toContainText('PayPal AI Hackathon');
  await expect(page.locator('[data-now]')).toHaveCSS('--accent', '#1b5fd1');

  // The readout goes away again.
  await page.clock.runFor(OSD_MS - TEXT_MS);
  await expect(osd).not.toHaveAttribute('data-on');

  await page.clock.runFor(AUTO_MS - OSD_MS);
  await expectChannel(page, 3);
  await expectTitle(page, 'Pathwise');

  await page.clock.runFor(AUTO_MS - TEXT_MS);
  await expectChannel(page, 1);
  await expectTitle(page, 'Studio');
});

test('plays the clip of the channel that is on, and only that one', async ({ page }) => {
  await open(page);
  const playing = (): Promise<string[]> =>
    page
      .locator('[data-screen] video')
      .evaluateAll((videos: HTMLVideoElement[]) =>
        videos.filter((video) => !video.paused).map((video) => video.getAttribute('src') ?? ''),
      );

  await expect.poll(playing).toEqual(['/media/studio.mp4']);
  await page.clock.runFor(AUTO_MS);
  await expectChannel(page, 2);
  await expect.poll(playing).toEqual(['/media/worth.mp4']);
  await expect
    .poll(() =>
      page
        .locator('[data-screen] video[data-on]')
        .evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeGreaterThan(0);
});

test('clicking the dial steps one channel and puts the hint away', async ({ page }) => {
  await open(page);
  const hint = page.locator('[data-hint]');
  await expect(hint).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-touched');

  await page.locator('[data-dial]').click();
  await expectChannel(page, 2);
  await expectTitle(page, 'Worth');
  await expect(page.locator('html')).toHaveAttribute('data-touched', '');
  await expect(hint).toBeHidden();

  // After a turn by hand the set waits 20 seconds before it changes by itself.
  await page.clock.runFor(AFTER_MANUAL_MS - TEXT_MS - 1);
  await expectChannel(page, 2);
  await page.clock.runFor(1);
  await expectChannel(page, 3);
});

test('dragging the dial to its right end selects channel 3', async ({ page }) => {
  await open(page);
  // Up and to the right of the dial, past where the 3 sits.
  await dragDial(page, { dx: 60, dy: -20 });
  await expectChannel(page, 3);
  await expectTitle(page, 'Pathwise');
  await expect(page.locator('[data-dial]')).toHaveAttribute('aria-valuenow', '3');

  // The click that ends a drag is not one more step.
  await page.clock.runFor(1000);
  await expectChannel(page, 3);

  await dragDial(page, { dx: -60, dy: -20 });
  await expectChannel(page, 1);
  await expectTitle(page, 'Studio');
});

test('ArrowLeft on the focused dial goes back one', async ({ page }) => {
  await open(page);
  const dial = page.locator('[data-dial]');
  await dial.focus();
  await page.keyboard.press('ArrowRight');
  await expectChannel(page, 2);
  await page.keyboard.press('ArrowUp');
  await expectChannel(page, 3);
  await page.keyboard.press('ArrowLeft');
  await expectChannel(page, 2);
  await expectTitle(page, 'Worth');
  await page.keyboard.press('ArrowDown');
  await expectChannel(page, 1);
  await expectTitle(page, 'Studio');
});

test('picking the channel that is already on changes nothing but still counts as a touch', async ({
  page,
}) => {
  await open(page);
  // Let the readout and the static from switching on finish first.
  await page.clock.runFor(2000);
  await expect(page.locator('[data-osd]')).not.toHaveAttribute('data-on');
  await expect.poll(() => flashes(page)).toBe(0);

  await page.locator('[data-dial]').focus();
  await page.keyboard.press('ArrowLeft');
  await expectChannel(page, 1);
  await expect(page.locator('[data-osd]')).not.toHaveAttribute('data-on');
  expect(await flashes(page)).toBe(0);
  await expect(page.locator('html')).toHaveAttribute('data-touched', '');
  await expect(page.locator('[data-hint]')).toBeHidden();
  await expectTitle(page, 'Studio');

  // No 20 second hold either: the change at 7 seconds still comes.
  await page.clock.runFor(AUTO_MS - 2000 - TEXT_MS - 1);
  await expectChannel(page, 1);
  await page.clock.runFor(1);
  await expectChannel(page, 2);
  await expectTitle(page, 'Worth');
});

test('a drag let go on the channel that is on turns the dial back and changes nothing', async ({
  page,
}) => {
  await open(page);
  await page.clock.runFor(2000);
  await expect.poll(() => flashes(page)).toBe(0);
  const dial = page.locator('[data-dial]');
  const resting = await dial.evaluate((el) => getComputedStyle(el).transform);

  // Channel 1 sits up and to the left.
  await dragDial(page, { dx: -60, dy: -20 });
  await expectChannel(page, 1);
  expect(await flashes(page)).toBe(0);
  await expect(page.locator('[data-osd]')).not.toHaveAttribute('data-on');
  await expect(page.locator('html')).toHaveAttribute('data-touched', '');
  await expect(dial).toHaveCSS('transform', resting);

  await page.clock.runFor(AUTO_MS - 2000);
  await expectChannel(page, 2);
});

test('five rapid clicks advance exactly five times', async ({ page }) => {
  await open(page);
  // Every write of the channel is kept, with the value it replaced.
  await page.evaluate(() => {
    const seen: string[] = [];
    Object.assign(window, { seen });
    new MutationObserver((records) => {
      for (const record of records) seen.push(record.oldValue ?? '');
    }).observe(document.documentElement, {
      attributeFilter: ['data-channel'],
      attributeOldValue: true,
    });
  });

  const centre = await centreOf(page.locator('[data-dial]'));
  for (let click = 0; click < 5; click += 1) await page.mouse.click(centre.x, centre.y);

  await expectChannel(page, 3);
  expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual([
    '1',
    '2',
    '3',
    '1',
    '2',
  ]);

  // One flash of static at most, one clip showing, and the newest channel's words.
  expect(await flashes(page)).toBeLessThanOrEqual(1);
  await expect(page.locator('[data-screen] video[data-on]')).toHaveCount(1);
  await expect(page.locator('[data-screen] video[data-on]')).toHaveAttribute(
    'poster',
    CHANNELS[2].poster,
  );
  await expect(page.locator('[data-osd]')).toHaveText('CH 3');
  await expectTitle(page, 'Pathwise');

  // And one timer: nothing more happens until 20 seconds after the last click.
  await page.clock.runFor(AFTER_MANUAL_MS - TEXT_MS - 1);
  await expectChannel(page, 3);
  await page.clock.runFor(1);
  await expectChannel(page, 1);
  await page.clock.runFor(AUTO_MS - 1);
  await expectChannel(page, 1);
  await page.clock.runFor(1);
  await expectChannel(page, 2);
});

test('with the clips unreachable the poster stays and the channels still change', async ({
  page,
}) => {
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  const loaded = new Set<string>();
  page.on('response', (response) => {
    if (response.ok()) loaded.add(new URL(response.url()).pathname);
  });
  await page.route('**/media/*.mp4', (route) => route.abort());

  await open(page);
  const showing = page.locator('[data-screen] video[data-on]');
  await expect(showing).toHaveAttribute('poster', CHANNELS[0].poster);
  await expect(showing).toBeVisible();

  await page.clock.runFor(AUTO_MS);
  await expectChannel(page, 2);
  await expectTitle(page, 'Worth');
  await expect(showing).toHaveCount(1);
  await expect(showing).toHaveAttribute('poster', CHANNELS[1].poster);
  await expect(showing).toBeVisible();
  // Nothing of the clip arrived, so what the screen has to show is the poster.
  expect(await showing.evaluate((video: HTMLVideoElement) => video.readyState)).toBe(0);
  expect(loaded).toContain(CHANNELS[1].poster);
  expect(errors).toEqual([]);
});

test("each project's links go where the design says, in a new tab", async ({ page }) => {
  await open(page);
  await page.locator('[data-dial]').focus();

  for (const [index, channel] of CHANNELS.entries()) {
    if (index > 0) await page.keyboard.press('ArrowRight');
    await expectTitle(page, channel.title);
    const links = page.locator('[data-now-links] a');
    await expect(links).toHaveText(channel.links.map(([label]) => label));
    for (const [at, [, href]] of channel.links.entries()) {
      await expect(links.nth(at)).toHaveAttribute('href', href);
      await expect(links.nth(at)).toHaveAttribute('target', '_blank');
      await expect(links.nth(at)).toHaveAttribute('rel', 'noopener');
    }
  }
});

test('the dial wiggles after a change by itself, until it has been turned once', async ({
  page,
}) => {
  await open(page);
  const wiggling = (): Promise<boolean> =>
    page
      .locator('[data-dial]')
      .evaluate((el) => el.getAnimations().some((animation) => animation.id === 'nudge'));

  await page.clock.runFor(NUDGE_AFTER_MS - 1);
  expect(await wiggling()).toBe(false);
  await page.clock.runFor(1);
  expect(await wiggling()).toBe(true);

  await page.locator('[data-dial]').click();
  await expectChannel(page, 2);
  await page.clock.runFor(AFTER_MANUAL_MS);
  await expectChannel(page, 3);
  await expect.poll(wiggling).toBe(false);
  await page.clock.runFor(NUDGE_AFTER_MS);
  expect(await wiggling()).toBe(false);
});

test('stops changing while the page is hidden and starts a fresh 7 seconds on return', async ({
  page,
}) => {
  await open(page);
  const setHidden = (hidden: boolean): Promise<void> =>
    page.evaluate((value) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => (value ? 'hidden' : 'visible'),
      });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);

  await page.clock.runFor(5000);
  await setHidden(true);
  await page.clock.runFor(30000);
  await expectChannel(page, 1);

  await setHidden(false);
  await page.clock.runFor(AUTO_MS - 1);
  await expectChannel(page, 1);
  await page.clock.runFor(1);
  await expectChannel(page, 2);
  await expectTitle(page, 'Worth');
});
