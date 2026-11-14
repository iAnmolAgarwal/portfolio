import { expect, test, type Page } from '@playwright/test';

// The mascot's scene in the opening: it peeks round the set, climbs on top and
// lights the rail with its torch, and the rail opens in step with the light.
//
// The scene is made of Web Animations, which Playwright's clock does not move, so
// these tests run in real time. Every moment is read in the page itself, from a
// record taken on every frame and at every change of stage, so the assertions
// are about the order and the shape of things and do not depend on when the test
// happens to look. The time limits are generous for a machine under load.

test.skip(({ isMobile }) => isMobile, 'The desktop scene, beam down the rail; the phone scene is in phone.spec.ts.');

// The whole opening takes about sixteen seconds when it is left to play.
test.setTimeout(60_000);

// After power-on begins, in milliseconds.
const MASCOT_AFTER_POWER_MS = 1300;
// After `playMascot` is called: the beam comes on, and the scene ends.
const TORCH_ON_MS = 5960;
const SCENE_MS = 9870;
const SWEEP_MS = 1500;
// How late a moment may come on a busy machine.
const SLACK_MS = 600;
// A frame or two for a finished animation's last style to be drawn.
const FRAME_MARGIN_MS = 50;

// Nothing is under this point: it is between the name and the links.
const BACKGROUND = { x: 620, y: 40 };

interface Change {
  stage: string;
  t: number;
  beamOn: boolean;
  railHidden: boolean;
  mascotPlaying: boolean;
  wipe: { duration: number; easing: string } | null;
  sweep: { duration: number; easing: string } | null;
}

interface Frame {
  t: number;
  stage: string;
  railSeen: boolean;
  railHover: boolean;
  /** The rail's `clip-path`: `none` once it is fully open. */
  railClip: string;
  beamOpacity: number;
  mascotSeen: boolean;
  /** The box the scene plays in covers the window, so nothing clips the mascot to the set. */
  stageIsWindow: boolean;
  overflow: boolean;
}

interface Trace {
  changes: Change[];
  frames: Frame[];
  /** The start times of the rail's wipe and the torch's sweep, once both have begun. */
  inStep: { wipe: number | null; sweep: number | null } | null;
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

/** Opens the page and starts keeping a record of the opening, frame by frame. */
async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => {
    const root = document.documentElement;
    const rail = document.querySelector<HTMLElement>('[data-rail]');
    const mascot = document.querySelector<HTMLElement>('[data-mascot]');
    const beam = document.querySelector<HTMLElement>('[data-beam]');
    const torch = document.querySelector<HTMLElement>('[data-torch]');
    const scene = mascot?.parentElement;
    if (!rail || !mascot || !beam || !torch || !scene) throw new Error('A hook is missing.');

    const record: Trace = { changes: [], frames: [], inStep: null };
    Object.assign(window, { mascotRecord: record });

    const seen = (element: Element): boolean => {
      const style = getComputedStyle(element);
      return style.visibility === 'visible' && Number(style.opacity) > 0;
    };
    const timing = (animation: Animation | undefined): Change['wipe'] => {
      if (animation === undefined) return null;
      const { duration, easing } = animation.effect?.getTiming() ?? {};
      return { duration: Number(duration), easing: String(easing) };
    };

    // Read in the same task as the change of stage, before anything has painted.
    let last = root.dataset.stage ?? '';
    new MutationObserver(() => {
      const stage = root.dataset.stage ?? '';
      if (stage === last) return;
      last = stage;
      const wipe = rail.getAnimations().find((animation) => animation.id === 'opening');
      // The scene's animations have no id. The sweep is the one that turns the
      // torch at full size from end to end; on the way up it grows from nothing.
      const fullSize = (frame: ComputedKeyframe): boolean =>
        /scale\(1\)/.test(String(frame.transform));
      const sweep = torch.getAnimations().find((animation) => {
        const { effect } = animation;
        const frames = effect instanceof KeyframeEffect ? effect.getKeyframes() : [];
        return frames.length === 2 && frames.every(fullSize);
      });
      record.changes.push({
        stage,
        t: performance.now(),
        beamOn: beam.getAnimations().length > 0,
        railHidden: getComputedStyle(rail).visibility === 'hidden',
        mascotPlaying: mascot.hasAttribute('data-playing'),
        wipe: timing(wipe),
        sweep: timing(sweep),
      });
      if (stage === 'lit' && wipe !== undefined && sweep !== undefined) {
        void Promise.all([wipe.ready, sweep.ready]).then(() => {
          record.inStep = { wipe: Number(wipe.startTime), sweep: Number(sweep.startTime) };
        });
      }
    }).observe(root, { attributeFilter: ['data-stage'] });

    const sample = (): void => {
      const box = scene.getBoundingClientRect();
      record.frames.push({
        t: performance.now(),
        stage: root.dataset.stage ?? '',
        railSeen: seen(rail) && seen(rail.closest('.results') ?? rail),
        railHover: rail.matches(':hover'),
        railClip: getComputedStyle(rail).clipPath,
        beamOpacity: Number(getComputedStyle(beam).opacity),
        mascotSeen: getComputedStyle(mascot).visibility === 'visible',
        stageIsWindow:
          box.left === 0 &&
          box.top === 0 &&
          box.width === window.innerWidth &&
          box.height === window.innerHeight,
        overflow:
          root.scrollWidth > window.innerWidth || root.scrollHeight > window.innerHeight,
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

function readTrace(page: Page): Promise<Trace> {
  return page.evaluate(() => (window as unknown as { mascotRecord: Trace }).mascotRecord);
}

async function expectStage(page: Page, stage: string, timeout = 20_000): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-stage', stage, { timeout });
}

/**
 * Waits, on the page's own clock and checking every frame, until `ms` after the
 * stage first became `stage`.
 */
async function waitAfterStage(page: Page, stage: string, ms: number): Promise<void> {
  await page.waitForFunction(
    ({ stage, ms }) => {
      const record = (window as unknown as { mascotRecord: Trace }).mascotRecord;
      const change = record.changes.find((each) => each.stage === stage);
      return change !== undefined && performance.now() - change.t >= ms;
    },
    { stage, ms },
    { polling: 'raf', timeout: 20_000 },
  );
}

function changeAt(record: Trace, stage: string): Change {
  const change = record.changes.find((each) => each.stage === stage);
  if (change === undefined) throw new Error(`The stage never became ${stage}.`);
  return change;
}

/** The mascot's box and the set's, and one page unit, in pixels. */
function boxes(page: Page): Promise<{
  mascot: DOMRect;
  tv: DOMRect;
  u: number;
}> {
  return page.evaluate(() => {
    const mascot = document.querySelector<HTMLElement>('[data-mascot]');
    const tv = document.querySelector<HTMLElement>('[data-tv]');
    if (!mascot || !tv) throw new Error('A hook is missing.');
    const plain = (rect: DOMRect): DOMRect => rect.toJSON() as DOMRect;
    return {
      mascot: plain(mascot.getBoundingClientRect()),
      tv: plain(tv.getBoundingClientRect()),
      u: mascot.offsetWidth / 54,
    };
  });
}

/** The rail as the finished page has it: open, at its resting strength, tracks drawn. */
async function expectRailOpen(page: Page): Promise<void> {
  const rail = page.locator('[data-rail]');
  await expect(rail).toBeVisible();
  await expect(rail).toHaveCSS('clip-path', 'none');
  await expect.poll(() => rail.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeCloseTo(
    0.62,
    2,
  );
  for (const track of await page.locator('.results .trk').all()) {
    await expect(track).toHaveCSS('transform', 'none');
  }
}

/** How far the rail has rolled upward, in pixels. */
function rolled(page: Page): Promise<number> {
  return page
    .locator('[data-rail-track]')
    .evaluate((track) => 0 - new DOMMatrixReadOnly(getComputedStyle(track).transform).m42);
}

async function expectRailRolling(page: Page): Promise<void> {
  const from = await rolled(page);
  await expect.poll(() => rolled(page), { timeout: 10_000 }).toBeGreaterThan(from);
}

/** The mascot, its torch and its beam all gone, with nothing of theirs still running. */
async function expectMascotGone(page: Page): Promise<void> {
  await expect(page.locator('[data-mascot]')).toBeHidden();
  await expect(page.locator('[data-mascot]')).not.toHaveAttribute('data-playing');
  await expect(page.locator('[data-torch]')).toBeHidden();
  await expect(page.locator('[data-beam]')).toBeHidden();
  await expect(page.locator('[data-beam]')).toHaveCSS('opacity', '0');
  expect(
    await page
      .locator('[data-mascot]')
      .evaluate((mascot) => mascot.getAnimations({ subtree: true }).length),
  ).toBe(0);
}

test('the mascot peeks round the set, climbs on top and lights the rail, then goes', async ({
  page,
}) => {
  await open(page);
  // A pointer rests where the rail will be until the rail is lit. The rail must
  // not answer it before then.
  const railMiddle = await page.locator('[data-rail]').evaluate((el) => {
    const box = el.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
  await page.mouse.move(railMiddle.x, railMiddle.y);

  // 1.3 s after power-on it is out, leaning round the set's left edge.
  await expectStage(page, 'mascot');
  await page.mouse.move(railMiddle.x + 4, railMiddle.y + 4);
  await expect(page.locator('[data-mascot]')).toBeVisible();
  await expect(page.locator('[data-rail]')).toBeHidden();
  await expect
    .poll(async () => {
      const { mascot, tv } = await boxes(page);
      return mascot.left < tv.left && mascot.right > tv.left;
    })
    .toBe(true);
  const peeking = await boxes(page);
  expect(peeking.mascot.top).toBeGreaterThan(peeking.tv.top);
  expect(peeking.mascot.top).toBeLessThan(peeking.tv.top + peeking.tv.height * 0.4);

  // Later it stands on the set's top edge near the left corner: its feet sit 2u
  // behind the edge, the rest of it is above.
  await expect
    .poll(
      async () => {
        const { mascot, tv, u } = await boxes(page);
        return (
          mascot.bottom <= tv.top + 2 * u + 0.5 &&
          mascot.bottom > tv.top &&
          Math.abs(mascot.left - (tv.left + 30 * u)) < 2 * u
        );
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  await expect(page.locator('[data-rail]')).toBeHidden();

  // The torch comes on and the rail opens in the light; then the mascot goes and
  // the note by the dial comes in.
  await expectStage(page, 'lit', 10_000);
  // The pointer moves off, so the finished rail is not held still under it.
  await page.mouse.move(BACKGROUND.x, BACKGROUND.y);
  await expectStage(page, 'done', 10_000);
  await expect(page.locator('[data-hint]')).toBeVisible();
  await expectMascotGone(page);
  await expectRailOpen(page);
  await expectRailRolling(page);

  const record = await readTrace(page);
  expect(record.changes.map((change) => change.stage)).toEqual([
    'cable',
    'plugged',
    'on',
    'mascot',
    'lit',
    'done',
  ]);
  const on = changeAt(record, 'on');
  const mascot = changeAt(record, 'mascot');
  const lit = changeAt(record, 'lit');
  const done = changeAt(record, 'done');

  // When each beat comes.
  expect(mascot.t - on.t).toBeGreaterThanOrEqual(MASCOT_AFTER_POWER_MS - 20);
  expect(mascot.t - on.t).toBeLessThan(MASCOT_AFTER_POWER_MS + SLACK_MS);
  expect(lit.t - mascot.t).toBeGreaterThanOrEqual(TORCH_ON_MS - 100);
  // Both come after many beats, each of which can run a little late.
  expect(lit.t - mascot.t).toBeLessThan(TORCH_ON_MS + 2 * SLACK_MS);
  expect(done.t - mascot.t).toBeGreaterThanOrEqual(SCENE_MS - 100);
  expect(done.t - mascot.t).toBeLessThan(SCENE_MS + 4 * SLACK_MS);

  // The mascot is out of sight until its stage; the rail is out of sight until the torch is on.
  expect(mascot.mascotPlaying).toBe(true);
  expect(mascot.railHidden).toBe(true);
  expect(mascot.beamOn).toBe(false);
  expect(lit.beamOn).toBe(true);
  expect(lit.mascotPlaying).toBe(true);
  expect(done.mascotPlaying).toBe(false);
  for (const frame of record.frames) {
    if (!['lit', 'done'].includes(frame.stage)) {
      expect(frame).toMatchObject({ railSeen: false, railHover: false });
    }
    if (!['mascot', 'lit'].includes(frame.stage)) expect(frame).toMatchObject({ mascotSeen: false });
    if (frame.mascotSeen) expect(frame).toMatchObject({ stageIsWindow: true });
    expect(frame).toMatchObject({ overflow: false });
  }
  expect(record.frames.filter((frame) => frame.mascotSeen).length).toBeGreaterThan(100);
  const firstLight = record.frames.find((frame) => frame.beamOpacity > 0);
  const firstRail = record.frames.find((frame) => frame.railSeen);
  expect(firstLight).toBeDefined();
  expect(firstRail).toBeDefined();
  expect(firstRail?.t).toBeGreaterThanOrEqual(firstLight?.t ?? Infinity);

  // The rail opens in step with the sweep: started in the same frame, as long, as eased.
  expect(lit.wipe).not.toBeNull();
  expect(lit.wipe).toEqual(lit.sweep);
  expect(lit.wipe?.duration).toBe(SWEEP_MS);
  expect(record.inStep).not.toBeNull();
  expect(record.inStep?.wipe).toBe(record.inStep?.sweep);

  // The rail is still opening during the sweep, and fully open once the sweep is
  // over, well before the scene ends. Both are timed from when the wipe itself
  // started (on the same clock as the frames), however late that was.
  const wipeFrom = record.inStep?.wipe ?? NaN;
  const sweeping = record.frames.filter(
    (frame) => frame.t > wipeFrom && frame.t < wipeFrom + SWEEP_MS * 0.8,
  );
  expect(sweeping.length).toBeGreaterThan(0);
  for (const frame of sweeping) expect(frame.railClip).not.toBe('none');
  const swept = record.frames.filter(
    (frame) => frame.t >= wipeFrom + SWEEP_MS + FRAME_MARGIN_MS && frame.t < done.t,
  );
  expect(swept.length).toBeGreaterThan(0);
  for (const frame of swept) expect(frame).toMatchObject({ railClip: 'none', railSeen: true });
});

test.describe('a skip during the scene lands on the finished page', () => {
  test('in the middle of the sweep', async ({ page }) => {
    await open(page);
    // Timed on the page's own clock from the moment the torch came on, so the
    // click lands mid-sweep however slowly the test itself is running.
    await waitAfterStage(page, 'lit', SWEEP_MS * 0.4);
    await page.mouse.click(BACKGROUND.x, BACKGROUND.y);
    await expectStage(page, 'done', 1000);
    await expectMascotGone(page);
    await expect(page.locator('[data-hint]')).toBeVisible();
    await expectRailOpen(page);
    await expectRailRolling(page);

    // And it stays gone.
    await page.waitForTimeout(1000);
    await expectMascotGone(page);
    const record = await readTrace(page);
    expect(record.changes.map((change) => change.stage).slice(-3)).toEqual([
      'mascot',
      'lit',
      'done',
    ]);
    // The click came while the light was on and the rail still opening.
    const lit = changeAt(record, 'lit');
    const done = changeAt(record, 'done');
    expect(done.t - lit.t).toBeLessThan(SWEEP_MS);
    const lastLit = record.frames.filter((frame) => frame.stage === 'lit').at(-1);
    expect(lastLit?.beamOpacity).toBeGreaterThan(0);
    expect(lastLit?.railClip).not.toBe('none');
  });

  test('while it peeks round the set', async ({ page }) => {
    await open(page);
    await expectStage(page, 'mascot');
    await expect(page.locator('[data-mascot]')).toBeVisible();

    await page.keyboard.press('Escape');
    await expectStage(page, 'done', 1000);
    await expectMascotGone(page);
    await expect(page.locator('[data-hint]')).toBeVisible();
    await expectRailOpen(page);
    await expectRailRolling(page);

    await page.waitForTimeout(1000);
    await expectMascotGone(page);
    const record = await readTrace(page);
    expect(record.changes.map((change) => change.stage).slice(-2)).toEqual(['mascot', 'done']);
  });
});

test('with reduced motion the mascot never appears', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await expectStage(page, 'done');
  await page.waitForTimeout(2000);
  const record = await readTrace(page);
  expect(record.changes).toEqual([]);
  expect(record.frames.length).toBeGreaterThan(0);
  for (const frame of record.frames) expect(frame).toMatchObject({ mascotSeen: false });
  await expectMascotGone(page);
});

test('peeking, the mascot is behind the set: the set covers the part of it that is round the edge', async ({
  page,
}) => {
  await open(page);
  await expectStage(page, 'mascot');
  // Halfway into the peek's hold, after it has leaned out.
  await page.waitForTimeout(900);
  const order = await page.evaluate(() => {
    const mascot = document.querySelector<HTMLElement>('[data-mascot]');
    const body = document.querySelector<HTMLElement>('.tv-body');
    const scene = mascot?.parentElement;
    const stage = document.querySelector<HTMLElement>('.stage');
    if (!mascot || !body || !scene || !stage) throw new Error('A hook is missing.');
    // Nothing between either of them and the stage makes a stacking order of its own.
    const plain = (from: HTMLElement): boolean => {
      for (let at = from.parentElement; at !== null && at !== stage; at = at.parentElement) {
        const style = getComputedStyle(at);
        const own =
          style.zIndex !== 'auto' ||
          style.transform !== 'none' ||
          Number(style.opacity) < 1 ||
          style.isolation === 'isolate' ||
          style.filter !== 'none';
        if (own) return false;
      }
      return true;
    };
    const m = mascot.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    return {
      overlap: m.right - b.left,
      scene: Number(getComputedStyle(scene).zIndex),
      body: Number(getComputedStyle(body).zIndex),
      bodyFill: getComputedStyle(body).backgroundColor,
      plain: plain(scene) && plain(body),
    };
  });
  // It reaches round behind the set's edge, and the set's body, with its paper
  // fill and outline, is painted over it there, as in the approved drawing.
  expect(order.overlap).toBeGreaterThan(0);
  expect(order.plain).toBe(true);
  expect(order.body).toBeGreaterThan(order.scene);
  expect(order.bodyFill).toBe('rgb(246, 246, 243)');
});

test("the light is never drawn over the top bar: the scene is cut off at the rail's top", async ({
  page,
}) => {
  await open(page);
  await expectStage(page, 'lit');
  const clip = await page.evaluate(() => {
    const scene = document.querySelector('.mascot-scene');
    const results = document.querySelector('.results');
    const header = document.querySelector('header');
    if (!scene || !results || !header) throw new Error('A hook is missing.');
    const inset = /^inset\((-?[\d.]+)px/.exec(getComputedStyle(scene).clipPath);
    return {
      top: inset === null ? null : Number(inset[1]),
      rail: results.getBoundingClientRect().top,
      bar: Math.max(
        ...Array.from(header.querySelectorAll('.name, [data-tagline], nav')).map(
          (element) => element.getBoundingClientRect().bottom,
        ),
      ),
    };
  });
  expect(clip.top).not.toBeNull();
  expect(clip.top ?? 0).toBeCloseTo(clip.rail, 0);
  expect(clip.top ?? 0).toBeGreaterThan(clip.bar);
  await expectStage(page, 'done');
  await expect(page.locator('.mascot-scene')).toHaveCSS('clip-path', 'none');
});
