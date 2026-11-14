import { expect, test, type Page } from '@playwright/test';

// The opening: the cable draws itself, the plug goes in, the set powers on, the
// mascot lights the rail, and a click or a key at any moment lands on the finished page.
//
// Timers run on Playwright's clock, paused before the page loads, so every wait
// below is exact. Animations and the clips still run in real time, which is why
// the two things the opening waits on that are not timers (the first clip being
// ready, and the picture coming on behind the power-on flash) are polled for.
// The mascot's scene is made of animations too: to see it through, the clock is
// let run in real time and stopped again once the opening is over (`playScene`).
// The scene itself is tested in `mascot.spec.ts`.

// The opening's beats, in milliseconds after the page's script starts.
const CABLE_MS = 500;
const PLUG_MS = 4200;
const POWER_MS = 4380;
// The clock's reading when the page's script starts.
const START_MS = 1000;
// After the picture comes on.
const MASCOT_AFTER_PICTURE_MS = 780;
// The longest the set waits for its first clip, counted from the plug.
const POWER_ON_CAP_MS = 1500;
// How long a script that never arrives is waited for before the page is shown finished.
const RESCUE_MS = 4000;

const AUTO_MS = 7000;
const AFTER_MANUAL_MS = 20000;
const STUDIO = '/media/studio.mp4';

// Whatever the page threw, or rejected and left unhandled, while a test ran.
const thrown = new WeakMap<Page, Error[]>();

test.beforeEach(({ page }) => {
  const errors: Error[] = [];
  thrown.set(page, errors);
  page.on('pageerror', (error) => errors.push(error));
});

test.afterEach(({ page }) => {
  // A test that was skipped never started listening.
  expect(thrown.get(page) ?? []).toEqual([]);
});

async function load(page: Page): Promise<void> {
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(START_MS);
  await page.goto('/');
}

async function expectStage(page: Page, stage: string | RegExp): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-stage', stage);
}

async function expectChannel(page: Page, number: 1 | 2 | 3): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-channel', String(number));
}

function playing(page: Page): Promise<string[]> {
  return page
    .locator('[data-screen] video')
    .evaluateAll((videos: HTMLVideoElement[]) =>
      videos.filter((video) => !video.paused).map((video) => video.getAttribute('src') ?? ''),
    );
}

/** How far the rail has rolled along its axis, in pixels: upward a column, leftward a strip. */
function rolled(page: Page): Promise<number> {
  return page.locator('[data-rail-track]').evaluate((track) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(track).transform);
    const across = track.closest<HTMLElement>('[data-rail]')?.dataset.axis === 'x';
    return 0 - (across ? matrix.m41 : matrix.m42);
  });
}

/** The cable drawing for the layout the page is in: the desktop's or the phone's. */
const CABLE = '.cable svg:visible';

async function expectRailMoving(page: Page): Promise<void> {
  const from = await rolled(page);
  await expect.poll(() => rolled(page)).toBeGreaterThan(from);
}

function opacityOf(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate((element) => Number(getComputedStyle(element).opacity));
}

/** The opening's own animations still alive, and anything still easing after a skip. */
function openingAnimations(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .map((animation) => animation.id)
      .filter((id) => id === 'opening' || id === 'settle'),
  );
}

/** Keeps every value `attribute` on `<html>` is given from now on. */
async function record(page: Page, attribute: string): Promise<() => Promise<string[]>> {
  await page.evaluate((name) => {
    const seen: string[] = [];
    Object.assign(window, { [`seen:${name}`]: seen });
    let last = document.documentElement.getAttribute(name);
    new MutationObserver(() => {
      const value = document.documentElement.getAttribute(name);
      if (value === last) return;
      last = value;
      seen.push(value ?? '');
    }).observe(document.documentElement, { attributeFilter: [name] });
  }, attribute);
  return () =>
    page.evaluate(
      (name) => (window as unknown as Record<string, string[]>)[`seen:${name}`],
      attribute,
    );
}

/**
 * Notes the clock's reading, after the page's script started, each time the set
 * changes channel from now on. While the clock runs in real time it reads a few
 * milliseconds past the moment a timer was due, so these are a little late.
 */
async function channelTimes(page: Page): Promise<() => Promise<number[]>> {
  await page.evaluate((start) => {
    const times: number[] = [];
    Object.assign(window, { channelTimes: times });
    new MutationObserver(() => times.push(Date.now() - start)).observe(
      document.documentElement,
      { attributeFilter: ['data-channel'] },
    );
  }, START_MS);
  return () => page.evaluate(() => (window as unknown as { channelTimes: number[] }).channelTimes);
}

// How late a reading taken while the clock runs in real time may be.
const LATE_MS = 50;
// How far ahead of its reading `playScene` stops the clock.
const PAUSE_AHEAD_MS = 250;

/**
 * Checks that the set changed by itself 7 s after the picture came on, while the
 * clock ran in real time, and again 7 s after that. The scene's length does not
 * matter: if it ran so long that the second change also came in real time, its
 * recorded time is checked; otherwise the clock is run on to it.
 */
async function expectCountKept(
  page: Page,
  times: () => Promise<number[]>,
  now: number,
  pictureAt: number,
): Promise<void> {
  const [second] = await times();
  expect(second).toBeGreaterThanOrEqual(pictureAt + AUTO_MS);
  expect(second).toBeLessThan(pictureAt + AUTO_MS + LATE_MS);
  let third = (await times())[1];
  if (third === undefined) {
    // `second` may be read late, so the next change is due no later than this.
    const due = second + AUTO_MS;
    let at = now;
    if (at < due - LATE_MS) {
      await runTo(page, at, due - LATE_MS);
      await expectChannel(page, 2);
      at = due - LATE_MS;
    }
    expect(at).toBeLessThan(due);
    await runTo(page, at, due);
    await expectChannel(page, 3);
    third = (await times())[1];
  }
  // Each reading is at most LATE_MS after its change was due.
  expect(third - second).toBeGreaterThanOrEqual(AUTO_MS - LATE_MS);
  expect(third - second).toBeLessThanOrEqual(AUTO_MS + LATE_MS);
}

async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (value ? 'hidden' : 'visible'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

/** Runs the clock to power-on and waits for the picture. The clock then reads POWER_MS. */
async function toPicture(page: Page): Promise<void> {
  await page.clock.runFor(POWER_MS);
  await expectStage(page, 'on');
  await expect.poll(() => playing(page)).toEqual([STUDIO]);
}

/**
 * Lets the mascot's scene play out in real time, then stops the clock again.
 * Returns the clock's reading, in milliseconds after the page's script started.
 */
async function playScene(page: Page): Promise<number> {
  await expectStage(page, 'mascot');
  await page.clock.resume();
  await expect(page.locator('html')).toHaveAttribute('data-stage', 'done', { timeout: 20_000 });
  // The clock runs on while the call to stop it is on its way, so it is stopped
  // a little ahead of where it was read, far enough ahead to still be to come.
  const now = (await page.evaluate(() => Date.now())) + PAUSE_AHEAD_MS;
  await page.clock.pauseAt(now);
  return now - START_MS;
}

/** Runs the clock on to `ms` after the page's script started. */
async function runTo(page: Page, from: number, ms: number): Promise<void> {
  expect(ms).toBeGreaterThan(from);
  await page.clock.runFor(ms - from);
}

async function expectNoScrollbar(page: Page): Promise<void> {
  const extent = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));
  expect(extent.scrollWidth).toBeLessThanOrEqual(extent.innerWidth);
  expect(extent.scrollHeight).toBeLessThanOrEqual(extent.innerHeight);
}

/**
 * The finished page, as a skip must leave it, on `channel` (or on whichever
 * channel it is on, for `current`). Moves the clock on by 400 ms.
 */
async function expectFinished(page: Page, channel: 1 | 2 | 3 | 'current' = 1): Promise<void> {
  await expectStage(page, 'done');
  expect((await openingAnimations(page)).filter((id) => id === 'opening')).toEqual([]);

  await page.clock.runFor(400);
  await expect(page.locator('[data-rail]')).toBeVisible();
  await expectRailMoving(page);
  const on =
    channel === 'current'
      ? Number(await page.locator('html').getAttribute('data-channel'))
      : channel;
  await expectChannel(page, on as 1 | 2 | 3);
  await expect
    .poll(() => playing(page))
    .toEqual([[STUDIO, '/media/worth.mp4', '/media/pathwise.mp4'][on - 1]]);
  await expect(page.locator('[data-screen] video[data-on]')).toBeVisible();
  await expect(page.locator('[data-now-title]')).toBeVisible();
  await expect(page.locator('[data-now-title]')).toHaveText(['Studio', 'Worth', 'Pathwise'][on - 1]);
  await expect(page.locator('[data-hint]')).toBeVisible();
  await expect(page.locator('[data-mascot]')).toBeHidden();

  // Everything comes to rest where the finished page has it.
  await expect.poll(() => openingAnimations(page)).toEqual([]);
  await expect.poll(() => opacityOf(page, '[data-now]')).toBe(1);
  await expect.poll(() => opacityOf(page, '[data-hint]')).toBe(1);
  await expect.poll(() => opacityOf(page, '[data-rail]')).toBeCloseTo(0.62, 2);
  await expect.poll(() => opacityOf(page, `${CABLE} .wire`)).toBe(1);
  for (const part of ['.note-tangle', '.note-run', '.doodle', '.plug']) {
    for (const each of await page.locator(`.cable ${part}`).all()) {
      await expect(each).toHaveCSS('opacity', '1');
    }
  }
  await expect(page.locator(`${CABLE} .wire`)).toHaveCSS('stroke-dashoffset', '0px');
  await expectNoScrollbar(page);
}

test('the page is dark and waiting the moment it loads, before anything has moved', async ({
  page,
}) => {
  await load(page);
  await expectStage(page, 'off');
  await expect(page.locator('html')).not.toHaveAttribute('data-reduced');
  expect(await playing(page)).toEqual([]);
  for (const hook of ['[data-rail]', '[data-now-title]', '[data-hint]', '[data-mascot]']) {
    await expect(page.locator(hook)).toBeHidden();
  }
  await expect(page.locator('[data-screen] video[data-on]')).toBeHidden();
  await expectNoScrollbar(page);
});

test('at one second the cable is being drawn and the set is still off', async ({ page }) => {
  await load(page);
  await page.clock.runFor(1000);
  await expectStage(page, 'cable');

  expect(await playing(page)).toEqual([]);
  await expect(page.locator('[data-screen] video[data-on]')).toBeHidden();
  await expect(page.locator('[data-rail]')).toBeHidden();
  await expect(page.locator('[data-now-title]')).toBeHidden();
  await expect(page.locator('[data-hint]')).toBeHidden();
  await expect(page.locator('[data-mascot]')).toBeHidden();

  // The name and the set have faded up, and the wire is on its way.
  await expect(page.getByRole('banner')).toBeVisible();
  await expect.poll(() => opacityOf(page, '.top')).toBe(1);
  const drawn = (): Promise<number> =>
    page
      .locator(`${CABLE} .wire`)
      .evaluate((wire) => 1 - Number.parseFloat(getComputedStyle(wire).strokeDashoffset));
  await expect.poll(drawn).toBeGreaterThan(0);
  expect(await drawn()).toBeLessThan(1);
  // The plug is not in yet, and the dial points straight up at nothing in particular.
  await expect(page.locator(`${CABLE} .plug`)).toHaveCSS('opacity', '0');
  expect(
    await page
      .locator('[data-dial]')
      .evaluate((dial) => new DOMMatrixReadOnly(getComputedStyle(dial).transform).b),
  ).toBe(0);
  await expectNoScrollbar(page);
});

test('at five seconds the set is on and the project has its words', async ({ page }) => {
  await load(page);
  await page.clock.runFor(5000);
  await expectStage(page, /^(on|mascot|lit|done)$/);
  await expect(page.locator('[data-now-title]')).toBeVisible();
  await expect(page.locator('[data-now-title]')).toHaveText('Studio');
  await expect.poll(() => opacityOf(page, '[data-now]')).toBe(1);
  await expect.poll(() => playing(page)).toEqual([STUDIO]);
});

test('plays through: the cable, the plug, power, the picture, the mascot and the rail, then the note by the dial', async ({
  page,
}) => {
  await load(page);
  const stages = await record(page, 'data-stage');

  await page.clock.runFor(CABLE_MS - 1);
  await expectStage(page, 'off');
  await page.clock.runFor(1);
  await expectStage(page, 'cable');

  await page.clock.runFor(PLUG_MS - CABLE_MS - 1);
  await expectStage(page, 'cable');
  await page.clock.runFor(1);
  await expectStage(page, 'plugged');
  expect(await playing(page)).toEqual([]);

  await page.clock.runFor(POWER_MS - PLUG_MS - 1);
  await expectStage(page, 'plugged');
  await page.clock.runFor(1);
  await expectStage(page, 'on');

  // The picture comes on behind the flash, with the channel readout, and the words rise in.
  await expect.poll(() => playing(page)).toEqual([STUDIO]);
  await expect(page.locator('[data-screen] video[data-on]')).toBeVisible();
  await expect(page.locator('[data-osd]')).toHaveText('CH 1');
  // The readout lies over the picture, not under it, and so do the glare and the
  // static, which share its layer.
  expect(
    await page.locator('[data-osd]').evaluate((osd) => {
      const box = osd.getBoundingClientRect();
      const stack = document.elementsFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return ['[data-osd]', 'video[data-on]'].map((selector) =>
        stack.findIndex((element) => element.matches(selector)),
      );
    }),
  ).toEqual([0, 1]);
  await expect(page.locator('[data-now-title]')).toBeVisible();
  await expect.poll(() => opacityOf(page, '[data-now]')).toBe(1);
  // The dial has turned to channel 1.
  await expect
    .poll(() =>
      page
        .locator('[data-dial]')
        .evaluate((dial) => new DOMMatrixReadOnly(getComputedStyle(dial).transform).b),
    )
    .toBeCloseTo(Math.sin((-48 * Math.PI) / 180), 3);
  await expect(page.locator('[data-rail]')).toBeHidden();
  await expect(page.locator('[data-hint]')).toBeHidden();
  await expectNoScrollbar(page);

  await page.clock.runFor(MASCOT_AFTER_PICTURE_MS - 1);
  await expectStage(page, 'on');
  await expect(page.locator('[data-mascot]')).toBeHidden();
  await page.clock.runFor(1);
  await expectStage(page, 'mascot');
  await expect(page.locator('[data-mascot]')).toBeVisible();
  await expect(page.locator('[data-rail]')).toBeHidden();
  await expect(page.locator('[data-hint]')).toBeHidden();

  const times = await channelTimes(page);
  const now = await playScene(page);
  await expect(page.locator('[data-hint]')).toBeVisible();
  await expect.poll(() => opacityOf(page, '[data-hint]')).toBe(1);
  await expect(page.locator('[data-mascot]')).toBeHidden();
  await expect(page.locator('[data-rail]')).toBeVisible();

  expect(await stages()).toEqual(['cable', 'plugged', 'on', 'mascot', 'lit', 'done']);
  expect((await openingAnimations(page)).filter((id) => id === 'opening')).toEqual([]);

  // The rail rolls, and the set has been counting from the moment the picture came
  // on: it changed by itself once during the scene, and does again 7 s later.
  await expectRailMoving(page);
  await expectCountKept(page, times, now, POWER_MS);
});

test.describe('a click on the page background lands on the finished page', () => {
  // Nothing is under this point: it is between the name and the links.
  // Plain paper: between the name and the links on the desktop; on a phone,
  // between the strip and the set, right of the antenna.
  const background = (page: Page): { x: number; y: number } =>
    (page.viewportSize()?.width ?? 0) < 600 ? { x: 300, y: 228 } : { x: 620, y: 40 };

  test('at one second, while the cable is being drawn', async ({ page }) => {
    await load(page);
    await page.clock.runFor(1000);
    await expectStage(page, 'cable');

    await page.mouse.click(background(page).x, background(page).y);
    await expectFinished(page);

    // Nothing of the opening is still to come, and the set counts from the click.
    await page.clock.runFor(AUTO_MS - 400 - 1);
    await expectChannel(page, 1);
    await expectStage(page, 'done');
    await page.clock.runFor(1);
    await expectChannel(page, 2);
  });

  test('at six seconds, while the mascot is out', async ({ page }) => {
    await load(page);
    await toPicture(page);
    await page.clock.runFor(6000 - POWER_MS);
    await expectStage(page, 'mascot');
    await expect(page.locator('[data-mascot]')).toBeVisible();
    // The rail has not been revealed and has not begun to roll.
    await expect(page.locator('[data-rail]')).toBeHidden();
    expect(await rolled(page)).toBe(0);

    await page.mouse.click(background(page).x, background(page).y);
    await expectFinished(page);

    // The set was already on: it is not switched on again, and keeps its count.
    await page.clock.runFor(POWER_MS + AUTO_MS - 6000 - 400 - 1);
    await expectChannel(page, 1);
    await page.clock.runFor(1);
    await expectChannel(page, 2);
  });

  test('once the opening is over, it changes nothing', async ({ page }) => {
    await load(page);
    await toPicture(page);
    await page.clock.runFor(MASCOT_AFTER_PICTURE_MS);
    const times = await channelTimes(page);
    const now = await playScene(page);
    await expect.poll(() => rolled(page)).toBeGreaterThan(0);
    const before = await rolled(page);

    await page.mouse.click(background(page).x, background(page).y);
    // On channel 2, or 3 if the scene ran long: either way the count is checked below.
    await expectFinished(page, 'current');
    // The rail was not started again from the top.
    expect(await rolled(page)).toBeGreaterThanOrEqual(before);

    // The set keeps the count it began when the picture came on.
    await expectCountKept(page, times, now + 400, POWER_MS);
  });
});

test.describe('a skip that lands on something still does what that thing does', () => {
  test('a click on the dial at six seconds finishes the opening and changes the channel once', async ({
    page,
  }) => {
    await load(page);
    await toPicture(page);
    await page.clock.runFor(6000 - POWER_MS);
    const channels = await record(page, 'data-channel');

    await page.locator('[data-dial]').click();
    await expectStage(page, 'done');
    await expectChannel(page, 2);
    expect(await channels()).toEqual(['2']);
    await expect(page.locator('html')).toHaveAttribute('data-touched', '');
    await expect(page.locator('[data-hint]')).toBeHidden();
    await page.clock.runFor(400);
    await expect(page.locator('[data-now-title]')).toHaveText('Worth');
    await expect(page.locator('[data-rail]')).toBeVisible();
    await expectRailMoving(page);

    // One timer: the 20 second wait after a turn by hand.
    await page.clock.runFor(AFTER_MANUAL_MS - 400 - 1);
    await expectChannel(page, 2);
    await page.clock.runFor(1);
    await expectChannel(page, 3);
    expect(await channels()).toEqual(['2', '3']);
  });

  test('a click on the dial at one second, before the set is on, does the same', async ({
    page,
  }) => {
    await load(page);
    await page.clock.runFor(1000);
    const channels = await record(page, 'data-channel');

    await page.locator('[data-dial]').click();
    await expectStage(page, 'done');
    await expectChannel(page, 2);
    expect(await channels()).toEqual(['2']);
    await expect.poll(() => playing(page)).toEqual(['/media/worth.mp4']);
    await expect(page.locator('html')).toHaveAttribute('data-touched', '');

    await page.clock.runFor(AFTER_MANUAL_MS - 1);
    await expectChannel(page, 2);
    await page.clock.runFor(1);
    await expectChannel(page, 3);
  });

  test('an arrow key on the dial finishes the opening first, then turns it', async ({ page }) => {
    await load(page);
    await page.clock.runFor(1000);
    const channels = await record(page, 'data-channel');

    await page.locator('[data-dial]').focus();
    await page.keyboard.press('ArrowRight');
    await expectStage(page, 'done');
    await expectChannel(page, 2);
    expect(await channels()).toEqual(['2']);

    await page.clock.runFor(AFTER_MANUAL_MS - 1);
    await expectChannel(page, 2);
    await page.clock.runFor(1);
    await expectChannel(page, 3);
  });

  test('a click on a link opens it and finishes the opening', async ({ page }) => {
    await page.context().route(/github\.com/, (route) => route.abort());
    await load(page);
    await page.clock.runFor(1000);

    const opened = page.waitForEvent('popup');
    await page.getByRole('banner').getByRole('link', { name: 'GitHub' }).click();
    await opened;
    await expectStage(page, 'done');
    await expectChannel(page, 1);
  });

  test('any key finishes the opening', async ({ page }) => {
    await load(page);
    await page.clock.runFor(2500);
    await expectStage(page, 'cable');
    await page.keyboard.press('Escape');
    await expectFinished(page);
  });
});

test('with the first clip stalled the set still powers on, showing its poster', async ({
  page,
}) => {
  // The request for the clip is never answered.
  await page.route(`**${STUDIO}`, () => undefined);
  await load(page);

  await page.clock.runFor(PLUG_MS + POWER_ON_CAP_MS - 1);
  await expectStage(page, 'plugged');
  await expect(page.locator('[data-screen] video[data-on]')).toBeHidden();
  await page.clock.runFor(1);
  // 5.7 seconds in: inside the 5.9 the design allows.
  expect(PLUG_MS + POWER_ON_CAP_MS).toBeLessThanOrEqual(5900);
  await expectStage(page, 'on');

  const showing = page.locator('[data-screen] video[data-on]');
  await expect(showing).toBeVisible();
  await expect(showing).toHaveAttribute('poster', '/media/studio.jpg');
  expect(await showing.evaluate((video: HTMLVideoElement) => video.readyState)).toBeLessThan(3);
  await expect(page.locator('[data-now-title]')).toBeVisible();
  await expect.poll(() => opacityOf(page, '[data-now]')).toBe(1);

  // The rest of the opening follows, and the set counts from when it came on.
  await page.clock.runFor(MASCOT_AFTER_PICTURE_MS);
  const times = await channelTimes(page);
  const now = await playScene(page);
  await expectCountKept(page, times, now, PLUG_MS + POWER_ON_CAP_MS);

  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test.describe('a page that is out of sight', () => {
  test('hidden at two seconds and shown at thirty: finished, and one change every 7 seconds', async ({
    page,
  }) => {
    await load(page);
    await page.clock.runFor(2000);
    await expectStage(page, 'cable');
    const channels = await record(page, 'data-channel');

    await setHidden(page, true);
    await expectStage(page, 'done');
    expect(await openingAnimations(page)).toEqual([]);
    expect(await playing(page)).toEqual([]);

    await page.clock.runFor(28000);
    await expectChannel(page, 1);
    expect(await channels()).toEqual([]);

    await setHidden(page, false);
    await expectStage(page, 'done');
    await expect.poll(() => playing(page)).toEqual([STUDIO]);
    await expect(page.locator('[data-rail]')).toBeVisible();
    await expect(page.locator('[data-hint]')).toBeVisible();
    await page.clock.runFor(400);
    await expectRailMoving(page);

    await page.clock.runFor(AUTO_MS - 400 - 1);
    await expectChannel(page, 1);
    await page.clock.runFor(1);
    await expectChannel(page, 2);
    await page.clock.runFor(AUTO_MS - 1);
    await expectChannel(page, 2);
    await page.clock.runFor(1);
    await expectChannel(page, 3);
    expect(await channels()).toEqual(['2', '3']);
  });

  test('a page opened out of sight keeps the opening for when it is first looked at', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
    });
    await load(page);
    await page.clock.runFor(30000);
    await expectStage(page, 'off');
    expect(await openingAnimations(page)).toEqual([]);
    expect(await playing(page)).toEqual([]);

    await setHidden(page, false);
    await page.clock.runFor(CABLE_MS - 1);
    await expectStage(page, 'off');
    await page.clock.runFor(1);
    await expectStage(page, 'cable');
    await page.clock.runFor(POWER_MS - CABLE_MS);
    await expectStage(page, 'on');
  });
});

test.describe('with reduced motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('the finished page is there at once, and nothing plays or changes by itself', async ({
    page,
  }) => {
    await load(page);
    const stages = await record(page, 'data-stage');
    await expectStage(page, 'done');
    await expect(page.locator('html')).toHaveAttribute('data-reduced', '');
    expect(await openingAnimations(page)).toEqual([]);

    await expect(page.locator('[data-now-title]')).toHaveText('Studio');
    await expect(page.locator('[data-now-title]')).toBeVisible();
    await expect(page.locator('[data-hint]')).toBeVisible();
    await expect(page.locator('[data-mascot]')).toBeHidden();
    const showing = page.locator('[data-screen] video[data-on]');
    await expect(showing).toBeVisible();
    await expect(showing).toHaveAttribute('poster', '/media/studio.jpg');

    await page.clock.runFor(10000);
    await expectChannel(page, 1);
    await expect(page.locator('[data-now-title]')).toHaveText('Studio');
    expect(await playing(page)).toEqual([]);
    expect(await showing.evaluate((video: HTMLVideoElement) => video.currentTime)).toBe(0);
    expect(await stages()).toEqual([]);
    // Nothing on the page is running: no roll, no ring, no static.
    expect(
      await page.evaluate(
        () =>
          document.getAnimations().filter((animation) => !(animation instanceof CSSTransition))
            .length,
      ),
    ).toBe(0);
  });

  test('the rail stands still and scrolls by hand to the last card', async ({ page }) => {
    await load(page);
    await expectStage(page, 'done');
    const rail = page.locator('[data-rail]');
    await expect(rail).toBeVisible();
    await expect(rail).toHaveAttribute('data-motion', 'still');

    await page.clock.runFor(3000);
    expect(await rolled(page)).toBe(0);
    expect(
      await page.locator('[data-rail-track]').evaluate((track) => track.getAnimations().length),
    ).toBe(0);

    const last = rail.locator('.card', { hasText: 'Codeforces Specialist' }).first();
    await expect(last).not.toBeInViewport({ ratio: 1 });
    await rail.hover();
    // Along the rail: down a column, sideways along a strip.
    const across = (await rail.getAttribute('data-axis')) === 'x';
    await page.mouse.wheel(across ? 4000 : 0, across ? 0 : 4000);
    await expect(last).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('the dial still changes channel, by a cross-fade with no static', async ({ page }) => {
    await load(page);
    await expectStage(page, 'done');
    const flashes = (): Promise<number> =>
      page.locator('[data-static]').evaluate((element) => element.getAnimations().length);
    expect(await flashes()).toBe(0);

    await page.locator('[data-dial]').click();
    await expectChannel(page, 2);
    expect(await flashes()).toBe(0);
    const showing = page.locator('[data-screen] video[data-on]');
    await expect(showing).toHaveCount(1);
    await expect(showing).toHaveAttribute('poster', '/media/worth.jpg');
    // The picture it replaces stays under the new one while that fades in, then goes.
    await expect(page.locator('[data-screen] video[data-leaving]')).toHaveCount(0);
    await expect.poll(() => opacityOf(page, '[data-screen] video[data-on]')).toBe(1);
    await page.clock.runFor(240);
    await expect(page.locator('[data-now-title]')).toHaveText('Worth');
    expect(await playing(page)).toEqual([]);

    // And it stays where it was put.
    await page.clock.runFor(AFTER_MANUAL_MS + AUTO_MS);
    await expectChannel(page, 2);
  });
});

test('if the script never arrives the page is shown finished all the same', async ({ page }) => {
  await page.route('**/_astro/*.js', (route) => route.abort());
  await load(page);
  // The set is dark from the first paint, which only the page's own markup can have done.
  await expectStage(page, 'off');

  await page.clock.runFor(RESCUE_MS - 1);
  await expectStage(page, 'off');
  await page.clock.runFor(1);
  await expectStage(page, 'done');
  await expect(page.locator('[data-rail]')).toBeVisible();
  await expect(page.locator('[data-now-title]')).toBeVisible();
  await expect(page.locator('[data-hint]')).toBeVisible();
  await expect(page.locator('[data-screen] video[data-on]')).toBeVisible();
});

test.describe('a skipped page settles quickly', () => {
  // How long after the skip everything must be in its finished place.
  const SETTLED_BY_MS = 350;

  for (const at of [1000, 5000]) {
    test(`skipped ${at / 1000} s in, everything is in place ${SETTLED_BY_MS} ms later`, async ({
      page,
    }) => {
      // In real time: the transitions and the settle are what is being timed.
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-stage', /^(off|cable|plugged|on)$/);
      await page.waitForTimeout(at);
      await page.evaluate(() => {
        window.addEventListener(
          'keydown',
          () => Object.assign(window, { skippedAt: performance.now() }),
          { capture: true, once: true },
        );
      });
      await page.keyboard.press('Escape');
      const moving = await page.evaluate(
        (by) =>
          new Promise<string[]>((resolve) => {
            const skippedAt = (window as unknown as { skippedAt: number }).skippedAt;
            const look = (): void => {
              if (performance.now() - skippedAt < by) {
                requestAnimationFrame(look);
                return;
              }
              // Still on its way: a transition, a settle, or something of the opening.
              const still = document
                .getAnimations()
                .filter(
                  (animation) =>
                    animation.playState === 'running' &&
                    (animation instanceof CSSTransition ||
                      animation.id === 'settle' ||
                      animation.id === 'opening'),
                )
                .map((animation) => {
                  const target = (animation.effect as KeyframeEffect | null)?.target;
                  const name =
                    animation instanceof CSSTransition ? animation.transitionProperty : animation.id;
                  return `${target?.getAttribute('class') ?? target?.tagName ?? '?'} ${name}`;
                });
              resolve(still);
            };
            look();
          }),
        SETTLED_BY_MS,
      );
      expect(moving).toEqual([]);
      await expect(page.locator('html')).toHaveAttribute('data-stage', 'done');
      expect(await opacityOf(page, '[data-now]')).toBe(1);
      expect(await opacityOf(page, '[data-hint]')).toBe(1);
      expect(await opacityOf(page, '[data-rail]')).toBeCloseTo(0.62, 2);
    });
  }
});
