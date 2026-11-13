// The mascot's scene in the opening. It peeks round the left edge of the set, looks
// about, pops up on the set's top-left corner, lifts a torch, sweeps its beam along
// the rail, puts the torch away and drops back behind the set.
//
// Every length is in the page's own unit and every position is read from where the
// set and the rail are at that moment, so the scene holds together at any window
// size and through a resize.

export type BeamTarget = 'down' | 'across';

export interface MascotOptions {
  /** The set the mascot plays on. */
  tv: HTMLElement;
  /** Which way the rail runs: `down` the left side, or `across` the bottom. */
  beamTarget: BeamTarget;
  /** Aborting it ends the scene at once, with everything hidden. */
  signal: AbortSignal;
  /** Called once, at the instant the beam comes on. */
  onTorchOn(): void;
}

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Sweep {
  /** The torch's turn when the sweep starts, in degrees, as CSS `rotate` takes it. */
  from: number;
  /** Its turn when the sweep ends. */
  to: number;
  /** How long the beam has to be to reach the rail's farthest corner. */
  length: number;
}

// ---------- the sprite ----------

/** The mascot's width in page units, as `mascot.css` sets it. */
const WIDTH = 54;
/** Its height: the sprite is 18 cells wide and 10 high. */
const HEIGHT = (WIDTH * 10) / 18;

// ---------- where it stands, in page units from the set's top-left corner ----------

/** How far down the set's body it peeks out, as a share of the body's height. */
const PEEK_AT = 0.2;
/** Behind the set's left edge, before and after the peek. */
const BEHIND_LEFT = 6;
/** Leaning out past the left edge. */
const PEEK_OUT = -48;
const PEEK_TILT = -8;
/** Its place along the top of the set. */
const ON_CORNER = 30;
/** Tucked behind the top edge, before it pops up and after it drops. */
const BEHIND_TOP = 8;
/** Standing on the set, its feet sunk a little behind the top edge. */
const STANDING = -(HEIGHT - 2);
/** The small hop before it drops. */
const HOP = -9;

// ---------- the eyes ----------

/**
 * How many cells the eyes travel on a glance to the side. Two puts the eye on
 * the glancing side in the head's edge cell and no further.
 */
const GLANCE_CELLS = 2;
/** How many cells they drop to look at a rail that runs along the bottom. */
const LOOK_DOWN_CELLS = 1;
/** The time the eyes take to cross one cell, and the pause they make on it. */
const CELL_MS = 38;
/** A cell is one sprite unit wide and two high. */
const CELL = { x: 1, y: 2 };

// ---------- the torch and its beam ----------

/** The swing that brings the torch up into the light's first position. */
const TORCH_UP_SWING = 74;
/** The swing that tucks it away after the light's last position. */
const TORCH_AWAY_SWING = 106;
/** The beam's narrow end, as a share of its wide end. Matches its clip-path. */
const BEAM_MOUTH = 0.02;
/**
 * Where on the rail the light starts and ends, as shares of the rail's length.
 * It starts with its leading edge at the first share, on the rail's near side,
 * and ends with its trailing edge at the second, on the far side. The rail fades
 * in over its first 14% and out over its last. The two shares are set so that at
 * the size the scene was designed at, the torch turns from 4 to 76 degrees below
 * level, as in the approved drawing.
 */
const LIGHT_FROM = 0.14;
const LIGHT_TO = 0.9;
/**
 * How far along the beam the rail's farthest corner falls. The light has all but
 * faded by there. Set so the beam is as long as in the approved drawing.
 */
const BEAM_REACH = 0.88;

// ---------- timing ----------

const SOFT = 'cubic-bezier(.2,.8,.2,1)';
const BACK = 'cubic-bezier(.3,1.5,.4,1)';
const SWEEP_MS = 1500;
const SWEEP_EASING = 'cubic-bezier(.45,.05,.3,1)';

function abortError(): DOMException {
  return new DOMException('The mascot scene was aborted.', 'AbortError');
}

function degrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Where the torch points to light the rail from one end to the other, and how
 * long its beam must be.
 *
 * @param pivot Where the torch turns.
 * @param rail The rail's box.
 * @param target Which way the rail runs.
 * @param beam The beam's shape: its half-angle in radians, and the gap between
 *   the pivot and the beam's narrow end.
 */
export function beamSweep(
  pivot: Point,
  rail: Box,
  target: BeamTarget,
  beam: { halfAngle: number; gap: number },
): Sweep {
  const width = rail.right - rail.left;
  const height = rail.bottom - rail.top;

  // The light enters at a point on the rail's near side and leaves at one on its far side.
  const enters: Point =
    target === 'down'
      ? { x: rail.right, y: rail.top + LIGHT_FROM * height }
      : { x: rail.left + LIGHT_FROM * width, y: rail.top };
  const leaves: Point =
    target === 'down'
      ? { x: rail.left, y: rail.top + LIGHT_TO * height }
      : { x: rail.left + LIGHT_TO * width, y: rail.bottom };

  // How far the torch has turned from pointing straight left to point at a spot:
  // a quarter turn is straight down, a half turn is straight right.
  const turnTo = (spot: Point): number => Math.atan2(spot.y - pivot.y, pivot.x - spot.x);

  const first = turnTo(enters) - beam.halfAngle;
  const last = Math.max(first, turnTo(leaves) + beam.halfAngle);

  const farthest = Math.max(
    ...[rail.left, rail.right].flatMap((x) =>
      [rail.top, rail.bottom].map((y) => Math.hypot(x - pivot.x, y - pivot.y)),
    ),
  );

  // CSS turns clockwise for a positive angle; the torch turns the other way.
  return {
    from: -degrees(first),
    to: -degrees(last),
    length: Math.max(0, farthest - beam.gap) / BEAM_REACH,
  };
}

// ---------- the eyes' keyframes ----------

interface Gaze {
  /** Cells to the right of straight ahead. */
  x: number;
  /** Cells below straight ahead. */
  y: number;
}

const AHEAD: Gaze = { x: 0, y: 0 };

/** The eyes looking somewhere, open (1) or half shut in a blink (0.5). */
function look(gaze: Gaze, open = 1): Keyframe {
  return {
    transform: `translate(${gaze.x * CELL.x}px, ${gaze.y * CELL.y}px) scaleY(${open})`,
  };
}

/**
 * The eyes going from one gaze to another one cell at a time. The first frame is
 * at offset `at`; each cell takes `step` to cross and the eyes rest for `step`
 * on each cell in between.
 */
function walk(from: Gaze, to: Gaze, at: number, step: number): Keyframe[] {
  const cells = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  const frames: Keyframe[] = [{ ...look(from), offset: at }];
  for (let cell = 1; cell <= cells; cell += 1) {
    const here: Gaze = {
      x: from.x + ((to.x - from.x) * cell) / cells,
      y: from.y + ((to.y - from.y) * cell) / cells,
    };
    frames.push({ ...look(here), offset: at + (2 * cell - 1) * step });
    if (cell < cells) frames.push({ ...look(here), offset: at + 2 * cell * step });
  }
  return frames;
}

/** A walk as an animation of its own: its frames, and how long they take. */
function turn(from: Gaze, to: Gaze): { frames: Keyframe[]; duration: number } {
  const cells = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  const steps = Math.max(1, 2 * cells - 1);
  return { frames: walk(from, to, 0, 1 / steps), duration: steps * CELL_MS };
}

const GLANCE_MS = 1900;

/** A glance left, a glance right, then straight at the visitor and two blinks. */
function glance(): Keyframe[] {
  const left: Gaze = { x: -GLANCE_CELLS, y: 0 };
  const right: Gaze = { x: GLANCE_CELLS, y: 0 };
  const step = CELL_MS / GLANCE_MS;
  return [
    ...walk(AHEAD, left, 0, step),
    ...walk(left, right, 0.26, step),
    ...walk(right, AHEAD, 0.52, step),
    { ...look(AHEAD), offset: 0.72 },
    { ...look(AHEAD, 0.5), offset: 0.74 },
    { ...look(AHEAD, 0.5), offset: 0.8 },
    { ...look(AHEAD), offset: 0.82 },
    { ...look(AHEAD), offset: 0.9 },
    { ...look(AHEAD, 0.5), offset: 0.92 },
    { ...look(AHEAD, 0.5), offset: 0.97 },
    { ...look(AHEAD), offset: 1 },
  ];
}

/** One slow blink. */
function blink(): Keyframe[] {
  return [
    { ...look(AHEAD), offset: 0 },
    { ...look(AHEAD, 0.5), offset: 0.05 },
    { ...look(AHEAD, 0.5), offset: 0.7 },
    { ...look(AHEAD), offset: 1 },
  ];
}

// ---------- the scene ----------

/** Where the set is, measured afresh each time it is needed. */
interface Stance {
  /** One page unit, in pixels. */
  u: number;
  /** The set's top-left corner, measured from the mascot's own resting corner. */
  x: number;
  y: number;
  /** The same corner in the window. */
  left: number;
  top: number;
  /** How far down the set the mascot peeks out, in pixels. */
  peek: number;
}

type Frames = () => Keyframe[];

function part<T extends Element>(root: Element, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`The mascot has no ${selector}.`);
  return found;
}

/**
 * Plays the mascot's scene. Resolves when the mascot has gone back behind the
 * set. If the signal aborts, everything is hidden at once and the promise rejects
 * with an `AbortError`.
 */
export function playMascot(root: HTMLElement, opts: MascotOptions): Promise<void> {
  const { tv, beamTarget, signal, onTorchOn } = opts;
  if (signal.aborted) return Promise.reject(abortError());

  let eyes: SVGGElement;
  let torch: HTMLElement;
  let beam: HTMLElement;
  try {
    eyes = part<SVGGElement>(root, '[data-eyes]');
    torch = part<HTMLElement>(root, '[data-torch]');
    beam = part<HTMLElement>(root, '[data-beam]');
  } catch (error) {
    return Promise.reject(error);
  }

  const view = root.ownerDocument.defaultView;
  /** The animation each part is running or holding, and how to redraw its frames. */
  const held = new Map<Element, { animation: Animation; frames: Frames }>();
  /** Whether the beam has been given its length for this scene yet. */
  let beamIsLaid = false;

  // ----- measuring -----

  function measure(): Stance {
    const style = getComputedStyle(root);
    const u = parseFloat(style.width) / WIDTH;
    // The mascot is moved by `transform` alone, so its resting corner is the
    // corner of the box it is positioned in.
    const parent = root.offsetParent ?? root.ownerDocument.documentElement;
    const parentBox = parent.getBoundingClientRect();
    const restX = parentBox.left + parent.clientLeft + (parseFloat(style.left) || 0);
    const restY = parentBox.top + parent.clientTop + (parseFloat(style.top) || 0);
    const set = tv.getBoundingClientRect();
    const body = (tv.querySelector('.tv-body') ?? tv).getBoundingClientRect();
    return {
      u,
      x: set.left - restX,
      y: set.top - restY,
      left: set.left,
      top: set.top,
      peek: Math.round(body.height * PEEK_AT),
    };
  }

  const behindLeft = (s: Stance): string =>
    `translate(${s.x + BEHIND_LEFT * s.u}px, ${s.y + s.peek}px) rotate(0deg)`;
  const peeking = (s: Stance): string =>
    `translate(${s.x + PEEK_OUT * s.u}px, ${s.y + s.peek}px) rotate(${PEEK_TILT}deg)`;
  const behindTop = (s: Stance): string =>
    `translate(${s.x + ON_CORNER * s.u}px, ${s.y + BEHIND_TOP * s.u}px)`;
  const standing = (s: Stance): string =>
    `translate(${s.x + ON_CORNER * s.u}px, ${s.y + STANDING * s.u}px)`;

  /** The sweep for where the set and the rail are now, with the mascot standing. */
  function aim(): Sweep {
    const s = measure();
    const torchStyle = getComputedStyle(torch);
    const beamStyle = getComputedStyle(beam);
    // The torch turns about the middle of its near end.
    const pivot: Point = {
      x: s.left + ON_CORNER * s.u + (WIDTH * s.u - parseFloat(torchStyle.right)),
      y: s.top + STANDING * s.u + parseFloat(torchStyle.top) + parseFloat(torchStyle.height) / 2,
    };
    const spread = parseFloat(beamStyle.height) / parseFloat(beamStyle.width);
    const shape = {
      halfAngle: Math.atan(((1 - BEAM_MOUTH) * spread) / 2),
      gap: parseFloat(beamStyle.right),
    };
    const rail = root.ownerDocument.querySelector('[data-rail]')?.getBoundingClientRect();
    if (rail === undefined || rail.width === 0 || rail.height === 0) {
      // No rail to light: the sweep as it was drawn.
      return { from: -4, to: -76, length: parseFloat(beamStyle.width) };
    }
    return beamSweep(pivot, rail, beamTarget, shape);
  }

  /** Makes the beam long enough to reach the far end of the rail. */
  function layBeam(): void {
    beam.style.setProperty('--beam-length', `${aim().length}px`);
    beamIsLaid = true;
  }

  // ----- playing -----

  function play(el: Element, frames: Frames, timing: KeyframeAnimationOptions): Animation {
    if (signal.aborted) throw abortError();
    const animation = el.animate(frames(), { fill: 'forwards', ...timing });
    held.get(el)?.animation.cancel();
    held.set(el, { animation, frames });
    return animation;
  }

  async function run(el: Element, frames: Frames, timing: KeyframeAnimationOptions): Promise<void> {
    await play(el, frames, timing).finished;
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(abortError());
        return;
      }
      const onAbort = (): void => {
        clearTimeout(timer);
        reject(abortError());
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  async function perform(): Promise<void> {
    const toRail: Gaze =
      beamTarget === 'down' ? { x: -GLANCE_CELLS, y: 0 } : { x: 0, y: LOOK_DOWN_CELLS };

    root.toggleAttribute('data-playing', true);

    // 1. It peeks round the left edge of the set.
    await run(
      root,
      () => {
        const s = measure();
        return [{ transform: behindLeft(s) }, { transform: peeking(s) }];
      },
      { duration: 700, easing: BACK },
    );
    await sleep(250);

    // 2. A glance left, a glance right, then straight out: two blinks.
    await run(eyes, glance, { duration: GLANCE_MS, easing: 'linear' });
    await sleep(420);

    // 3. It ducks back, then pops up on the top-left corner with a landing squash.
    await run(
      root,
      () => {
        const s = measure();
        return [{ transform: peeking(s) }, { transform: behindLeft(s) }];
      },
      { duration: 300, easing: 'cubic-bezier(.5,0,.8,.4)' },
    );
    await sleep(220);
    await run(
      root,
      () => {
        const s = measure();
        const up = standing(s);
        return [
          { transform: behindTop(s) },
          { transform: `${up} scale(.97,1.1)`, offset: 0.62 },
          { transform: `${up} scale(1.05,.88)`, offset: 0.8 },
          { transform: `${up} scale(1,1)` },
        ];
      },
      { duration: 640, easing: SOFT },
    );
    await sleep(200);

    // 4. Its eyes go to the rail, the torch comes up, and the light sweeps along it.
    const toTheRail = turn(AHEAD, toRail);
    await run(eyes, () => toTheRail.frames, { duration: toTheRail.duration });
    await sleep(180);
    layBeam();
    await run(
      torch,
      () => {
        const { from } = aim();
        return [
          { transform: `rotate(${from + TORCH_UP_SWING}deg) scale(0)` },
          { transform: `rotate(${from}deg) scale(1)` },
        ];
      },
      { duration: 380, easing: BACK },
    );
    await sleep(160);
    layBeam();
    play(beam, () => [{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
    onTorchOn();
    await run(
      torch,
      () => {
        const { from, to } = aim();
        return [
          { transform: `rotate(${from}deg) scale(1)` },
          { transform: `rotate(${to}deg) scale(1)` },
        ];
      },
      { duration: SWEEP_MS, easing: SWEEP_EASING },
    );
    await sleep(300);

    // 5. Light off, torch away, eyes back for one blink, a small hop, and gone.
    await run(beam, () => [{ opacity: 1 }, { opacity: 0 }], { duration: 280 });
    await run(
      torch,
      () => {
        const { to } = aim();
        return [
          { transform: `rotate(${to}deg) scale(1)` },
          { transform: `rotate(${to + TORCH_AWAY_SWING}deg) scale(0)` },
        ];
      },
      { duration: 320, easing: 'ease-in' },
    );
    const backToYou = turn(toRail, AHEAD);
    await run(eyes, () => backToYou.frames, { duration: backToYou.duration });
    await sleep(260);
    await run(eyes, blink, { duration: 240, easing: 'linear' });
    await sleep(320);
    await run(
      root,
      () => {
        const s = measure();
        const up = standing(s);
        return [
          { transform: up },
          { transform: `${up} translateY(${HOP * s.u}px)`, offset: 0.3 },
          { transform: behindTop(s) },
        ];
      },
      { duration: 480, easing: 'cubic-bezier(.5,0,.7,.3)' },
    );
  }

  // ----- keeping up with the window, and ending -----

  /** After a resize, redraws every running or held frame for where the set is now. */
  function follow(): void {
    for (const { animation, frames } of held.values()) {
      if (animation.effect instanceof KeyframeEffect) animation.effect.setKeyframes(frames());
    }
    if (beamIsLaid) layBeam();
  }

  return new Promise<void>((resolve, reject) => {
    /** Puts the mascot, the torch and the beam back as the finished page has them. */
    function clear(): void {
      signal.removeEventListener('abort', onAbort);
      view?.removeEventListener('resize', follow);
      for (const { animation } of held.values()) animation.cancel();
      held.clear();
      root.removeAttribute('data-playing');
      beam.style.removeProperty('--beam-length');
    }

    function onAbort(): void {
      clear();
      reject(abortError());
    }

    signal.addEventListener('abort', onAbort, { once: true });
    view?.addEventListener('resize', follow);
    perform().then(
      () => {
        clear();
        resolve();
      },
      (error: unknown) => {
        clear();
        reject(error);
      },
    );
  });
}
