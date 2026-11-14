// The mascot's scene in the opening. It peeks round the left edge of the set, looks
// about, pops up on the set's top-left corner, lifts a torch, sweeps its beam along
// the rail, puts the torch away and drops back behind the set.
//
// Every length is in the page's own unit and every position is read from where the
// set and the rail are at that moment, so the scene holds together at any window
// size and through a resize.

import { LAID_OUT } from './layout';
import { BEAM_MOUTH, beamSweep, type BeamTarget, type Point, type Sweep } from './beam';

export { beamSweep, type BeamTarget, type Box, type Point, type Sweep } from './beam';

export interface MascotOptions {
  /** The set the mascot plays on. */
  tv: HTMLElement;
  /** Which way the light goes: `down` the rail beside the set, or `up` to a strip above it. */
  beamTarget: BeamTarget;
  /** Aborting it ends the scene at once, with everything hidden. */
  signal: AbortSignal;
  /** Called once, at the instant the beam comes on. */
  onTorchOn(): void;
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
/**
 * Leaning out, it always leaves at least this much paper between itself and the
 * window's left edge, in pixels. Beside a set near that edge (a phone) it leans
 * out less and more of it stays behind the set.
 */
const PEEK_PAPER = 10;
/** Its place along the top of the set. */
const ON_CORNER = 30;
/** Tucked behind the top edge, before it pops up and after it drops. */
const BEHIND_TOP = 8;
/** Standing on the set, its feet sunk a little behind the top edge. */
const STANDING = -(HEIGHT - 2);
/** The small hop before it drops. */
const HOP = -9;
/** How far left of the mascot its torch can reach, in page units. */
const TORCH_REACH = 24;

// ---------- the eyes ----------

/**
 * How many cells the eyes travel on a glance to the side. Two puts the eye on
 * the glancing side in the head's edge cell and no further.
 */
const GLANCE_CELLS = 2;
/** How many cells they rise to look at a strip above the set. */
const LOOK_UP_CELLS = 1;
/** The time the eyes take to cross one cell, and the pause they make on it. */
const CELL_MS = 38;
/** How long they rest looking to each side during the glance. */
const GLANCE_HOLD_MS = 456;
/** A cell is one sprite unit wide and two high. */
const CELL = { x: 1, y: 2 };

// ---------- the torch and its beam ----------

/** The swing that brings the torch up into the light's first position. */
const TORCH_UP_SWING = 74;
/** The swing that tucks it away after the light's last position. */
const TORCH_AWAY_SWING = 106;
// ---------- timing ----------

const SOFT = 'cubic-bezier(.2,.8,.2,1)';
const BACK = 'cubic-bezier(.3,1.5,.4,1)';
const SWEEP_MS = 1500;
const SWEEP_EASING = 'cubic-bezier(.45,.05,.3,1)';

function abortError(): DOMException {
  return new DOMException('The mascot scene was aborted.', 'AbortError');
}

// ---------- the eyes' timeline ----------

export interface Gaze {
  /** Cells to the right of straight ahead. */
  x: number;
  /** Cells below straight ahead. */
  y: number;
}

/** Where the eyes are at one moment, with straight lines between moments. */
export interface EyeCue {
  /** Milliseconds from the start of the movement. */
  at: number;
  gaze: Gaze;
  /** 1 open, 0.5 half shut in a blink. */
  open: number;
}

const AHEAD: Gaze = { x: 0, y: 0 };

/** Writes a movement of the eyes as cues, each step given by how long it takes. */
function eyeScript(from: Gaze): {
  cues: EyeCue[];
  walk(to: Gaze): void;
  hold(ms: number): void;
  lids(open: number, ms: number): void;
} {
  const cues: EyeCue[] = [{ at: 0, gaze: from, open: 1 }];
  const add = (ms: number, change: Partial<EyeCue>): void => {
    const last = cues[cues.length - 1];
    cues.push({ ...last, ...change, at: last.at + ms });
  };
  return {
    cues,
    /** Goes to a gaze one cell at a time, resting on each cell on the way. */
    walk(to) {
      const start = cues[cues.length - 1].gaze;
      const cells = Math.max(Math.abs(to.x - start.x), Math.abs(to.y - start.y));
      for (let cell = 1; cell <= cells; cell += 1) {
        const gaze: Gaze = {
          x: start.x + ((to.x - start.x) * cell) / cells,
          y: start.y + ((to.y - start.y) * cell) / cells,
        };
        add(CELL_MS, { gaze });
        if (cell < cells) add(CELL_MS, {});
      }
    },
    hold(ms) {
      add(ms, {});
    },
    lids(open, ms) {
      add(ms, { open });
    },
  };
}

/**
 * A glance left, a glance right, then straight at the visitor and two blinks.
 * The eyes rest on each side for as long as in the approved drawing however many
 * cells they travel; a longer walk makes the whole glance longer.
 */
export function glanceCues(cells: number = GLANCE_CELLS): EyeCue[] {
  const eyes = eyeScript(AHEAD);
  eyes.walk({ x: -cells, y: 0 });
  eyes.hold(GLANCE_HOLD_MS);
  eyes.walk({ x: cells, y: 0 });
  eyes.hold(GLANCE_HOLD_MS);
  eyes.walk(AHEAD);
  eyes.hold(342);
  eyes.lids(0.5, 38);
  eyes.hold(114);
  eyes.lids(1, 38);
  eyes.hold(152);
  eyes.lids(0.5, 38);
  eyes.hold(95);
  eyes.lids(1, 57);
  return eyes.cues;
}

/** The eyes going from one gaze to another, a cell at a time. */
function turnCues(from: Gaze, to: Gaze): EyeCue[] {
  const eyes = eyeScript(from);
  eyes.walk(to);
  return eyes.cues;
}

/** One slow blink. */
function blinkCues(): EyeCue[] {
  const eyes = eyeScript(AHEAD);
  eyes.lids(0.5, 12);
  eyes.hold(156);
  eyes.lids(1, 72);
  return eyes.cues;
}

/** Cues as an animation: its keyframes and how long it runs. */
function eyeAnimation(cues: EyeCue[]): { frames: Keyframe[]; duration: number } {
  const duration = Math.max(1, cues[cues.length - 1].at);
  const frames = cues.map(
    ({ at, gaze, open }): Keyframe => ({
      transform: `translate(${gaze.x * CELL.x}px, ${gaze.y * CELL.y}px) scaleY(${open})`,
      offset: Math.min(1, at / duration),
    }),
  );
  return { frames, duration };
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
  /** The furthest left it may lean out to, from its resting corner. */
  leftmost: number;
}

type Frames = () => Keyframe[];

/**
 * The scene now playing on each mascot. A scene that has ended tidies away only
 * what is still its own, so it cannot undo a newer scene started on the same
 * mascot in the meantime.
 */
const playing = new WeakMap<HTMLElement, object>();

function part<T extends Element>(root: Element, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`The mascot has no ${selector}.`);
  return found;
}

/**
 * Plays the mascot's scene. Resolves when the mascot has gone back behind the
 * set. If the signal aborts, everything is hidden at once and the promise rejects
 * with an `AbortError`.
 *
 * It always moves: the caller must not run it for a visitor who asks for reduced
 * motion. It rejects with an `Error` if the set has no box to stand on or if the
 * scene is already playing on this mascot.
 */
export function playMascot(root: HTMLElement, opts: MascotOptions): Promise<void> {
  const { tv, beamTarget, signal, onTorchOn } = opts;
  if (signal.aborted) return Promise.reject(abortError());
  if (root.hasAttribute('data-playing')) {
    return Promise.reject(new Error('The mascot scene is already playing.'));
  }
  const box = tv.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) {
    return Promise.reject(new Error('The set has no box for the mascot to play on.'));
  }

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
  const token = {};
  playing.set(root, token);
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
      leftmost: PEEK_PAPER - restX,
    };
  }

  const behindLeft = (s: Stance): string =>
    `translate(${s.x + BEHIND_LEFT * s.u}px, ${s.y + s.peek}px) rotate(0deg)`;
  const peeking = (s: Stance): string =>
    `translate(${Math.max(s.x + PEEK_OUT * s.u, s.leftmost + tilted(s))}px, ${s.y + s.peek}px) rotate(${PEEK_TILT}deg)`;
  // How far the tilt carries its top corner left of where it stands.
  const tilted = (s: Stance): number =>
    HEIGHT * s.u * Math.sin((Math.abs(PEEK_TILT) * Math.PI) / 180);
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
      beamTarget === 'down' ? { x: -GLANCE_CELLS, y: 0 } : { x: 0, y: -LOOK_UP_CELLS };

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
    const glance = eyeAnimation(glanceCues());
    await run(eyes, () => glance.frames, { duration: glance.duration, easing: 'linear' });
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
    const toTheRail = eyeAnimation(turnCues(AHEAD, toRail));
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
        const { from, to, steps } = aim();
        // Along a strip the light must cross it evenly: a turn for each stretch.
        if (steps !== undefined) {
          return steps.map((turn, index) => ({
            transform: `rotate(${turn}deg) scale(1)`,
            offset: index / (steps.length - 1),
          }));
        }
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
    const backToYou = eyeAnimation(turnCues(toRail, AHEAD));
    await run(eyes, () => backToYou.frames, { duration: backToYou.duration });
    await sleep(260);
    const blink = eyeAnimation(blinkCues());
    await run(eyes, () => blink.frames, { duration: blink.duration, easing: 'linear' });
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

  /**
   * The light is never drawn above the rail's top edge, which keeps it off the
   * name, its line and the links: the box the scene plays in is cut off there.
   * On a window so short that the mascot standing on the set reaches above that
   * edge, the cut leaves room round the mascot and its torch.
   */
  const stage = root.parentElement;
  function keepUnderRail(): void {
    const rail = root.ownerDocument.querySelector('[data-rail]');
    const edge = (rail?.closest('.results') ?? rail)?.getBoundingClientRect().top;
    if (stage === null || edge === undefined) return;
    const top = Math.max(0, edge);
    const s = measure();
    const head = s.top + (STANDING + HOP) * s.u - 4;
    if (head >= top) {
      stage.style.clipPath = `inset(${top}px 0 0 0)`;
      return;
    }
    const left = s.left + (ON_CORNER - TORCH_REACH) * s.u;
    const right = s.left + (ON_CORNER + WIDTH + 4) * s.u;
    stage.style.clipPath =
      `polygon(0 ${top}px, ${left}px ${top}px, ${left}px ${head}px, ${right}px ${head}px, ` +
      `${right}px ${top}px, 100% ${top}px, 100% 100%, 0 100%)`;
  }

  /**
   * After the page is laid out again for a new window size, redraws every running
   * or held frame for where the set is now.
   */
  function follow(): void {
    for (const { animation, frames } of held.values()) {
      if (animation.effect instanceof KeyframeEffect) animation.effect.setKeyframes(frames());
    }
    if (beamIsLaid) layBeam();
    keepUnderRail();
  }

  return new Promise<void>((resolve, reject) => {
    /**
     * Puts the mascot, the torch and the beam back as the finished page has them.
     * It runs twice on an abort: at once, and again when the scene's last step
     * gives up. By the second time a new scene may have started on this mascot.
     */
    function clear(): void {
      signal.removeEventListener('abort', onAbort);
      view?.removeEventListener(LAID_OUT, follow);
      for (const { animation } of held.values()) animation.cancel();
      held.clear();
      if (playing.get(root) !== token) return;
      playing.delete(root);
      root.removeAttribute('data-playing');
      beam.style.removeProperty('--beam-length');
      stage?.style.removeProperty('clip-path');
    }

    function onAbort(): void {
      clear();
      reject(abortError());
    }

    signal.addEventListener('abort', onAbort, { once: true });
    view?.addEventListener(LAID_OUT, follow);
    keepUnderRail();
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
