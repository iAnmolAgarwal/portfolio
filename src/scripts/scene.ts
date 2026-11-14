// The opening as this page plays it: what each beat draws, and the finished page
// that every way out of it lands on. `opening.ts` keeps the time and knows nothing
// about the page; this file knows the elements.
//
// The states themselves are in the stylesheets, keyed on `<html data-stage>`: what
// is out of sight until its cue, and where it rests afterwards. A plain change from
// one state to the next (the words rising in, the dial's numbers, the rail's fade,
// the note by the dial) is a CSS transition there, so all it needs from here is the
// stage, and it eases to the finished page by itself however the opening ends. What
// moves through more than two states (the fade up, the line drawing itself, the
// plug's ring, the power-on flash, the rail's reveal) is animated here, and those
// animations are the only things `finish` has to stop.

import { TIMING } from '../data/site';
import { find, findAll } from './dom';
import type { RailOptions } from './rail';
import { createOpening, type OpeningStep, type Stage } from './opening';

// ---------- when things happen ----------

// When each stage is entered, in milliseconds after the opening starts.
const CABLE_MS = 500;
const PLUG_MS = 4200;
// Power is wanted this long after the plug is in. It waits for the first clip
// if it has to, but no longer than `TIMING.powerOnCapMs` after the plug.
const POWER_AFTER_PLUG_MS = 180;
// The picture comes on this far into the power-on flash, behind it.
const PICTURE_MS = 520;
// The words under the set come in this long after the picture, as they do on
// every channel change.
const WORDS_AFTER_PICTURE_MS = 240;

const RISE = 'cubic-bezier(0.2, 0.7, 0.2, 1)';
const TOP_MS = 900;
const SET_MS = 1000;
const SET_AFTER_MS = 120;

// The cable. These count from the start of its stage.
const WIRE_AFTER_MS = 300;
const WIRE_MS = 3400;
const WIRE_EASING = 'cubic-bezier(0.5, 0.05, 0.25, 1)';
const NOTE_MS = 700;
// "tried a lot of things" comes first, then the small drawings, then "stayed for
// the ones that fix a real problem" once the last drawing is in.
const FIRST_NOTE_AFTER_MS = 300;
const SECOND_NOTE_AFTER_MS = 2300;
const DOODLE_MS = 600;
const FIRST_DOODLE_AFTER_MS = 400;
const DOODLE_EVERY_MS = 300;
const PLUG_FADE_AFTER_MS = 3500;
const PLUG_FADE_MS = 400;
const RING_AFTER_MS = 3550;
const RING_MS = 700;

const POWER_ON_MS = 900;
const POWER_ON_EASING = 'cubic-bezier(0.3, 0.75, 0.2, 1)';

// The rail's reveal, and the roll that begins as the reveal ends.
const REVEAL_MS = 1500;
const REVEAL_EASING = 'cubic-bezier(0.45, 0.05, 0.3, 1)';
const SECOND_TRACK_AFTER_MS = 80;
const ROLL_AFTER_MS = 1500;
const ROLL_RAMP_MS = 1600;

// After a skip: how long what was in mid-air takes to come to rest, and how
// quickly the rail gets up to speed.
const SETTLE_MS = 240;
const QUICK_RAMP_MS = 600;

// ---------- the drawings ----------

const WIRE_FRAMES: Keyframe[] = [
  { strokeDasharray: '1', strokeDashoffset: '1' },
  { strokeDasharray: '1', strokeDashoffset: '0' },
];

const APPEAR_FRAMES: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

// The ring that pulses out from the plug as it goes in.
const RING_FRAMES: Keyframe[] = [
  { opacity: 0.9, transform: 'scale(0.3)' },
  { opacity: 0, transform: 'scale(2.6)' },
];

// An old set switching on: a bright dot stretches into a line, the line opens to
// fill the screen, and the glare fades to leave the picture.
const POWER_ON_FRAMES: Keyframe[] = [
  { opacity: 1, transform: 'scale(0.02, 0.004)', easing: POWER_ON_EASING },
  { opacity: 1, transform: 'scale(1, 0.004)', offset: 0.28, easing: POWER_ON_EASING },
  { opacity: 1, transform: 'scale(1, 1)', offset: 0.62, easing: POWER_ON_EASING },
  { opacity: 0, transform: 'scale(1, 1)' },
];

const DARK_FRAMES: Keyframe[] = [{ visibility: 'hidden' }, { visibility: 'hidden' }];

// The rail opens where the light has passed: from the top down a column, and
// from the left along a strip. Its tracks draw the same way.
const WIPE_FRAMES: Record<RailAxis, Keyframe[]> = {
  y: [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }],
  x: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
};

const TRACK_FRAMES: Record<RailAxis, Keyframe[]> = {
  y: [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }],
  x: [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
};

// ---------- what the opening is given, and what it gives back ----------

/** The parts of the page the opening sets going but does not own. */
export interface Cast {
  set: {
    isOn(): boolean;
    /** Shows channel 1 and starts the set changing by itself. */
    switchOn(): void;
    /** Channel 1's clip, which power-on waits for. */
    clip: HTMLVideoElement;
  };
  /** Sets the rail rolling after `delayMs`, easing up to speed over `rampMs`. */
  rollRail(delayMs: number, rampMs: number): void;
  /** Which way the rail runs now: down a column (`y`) or along a strip (`x`). */
  railAxis(): RailAxis;
}

/** What the scene after power-on has to work with. */
export interface Scene {
  /** Aborts when the opening is skipped or over. */
  signal: AbortSignal;
  /** Resolves after `ms`; rejects with an abort error if the opening is skipped first. */
  wait(ms: number): Promise<void>;
  setStage(stage: Stage): void;
  /** Sets the stage to `lit`: reveals the rail from the top down and starts its roll. */
  lightRail(): void;
}

export interface PageOpening {
  play(): void;
  /**
   * Goes straight to the finished page, from any moment, once. `eased` lets what
   * was in mid-air come to rest over a moment; `at once` cuts to it, for a page
   * nobody is looking at.
   */
  skip(how: 'eased' | 'at once'): void;
  isDone(): boolean;
  /** Resolves once the page is in its finished state. */
  finished: Promise<void>;
}

function abortError(): DOMException {
  return new DOMException('The opening was skipped.', 'AbortError');
}

/** A timer that the signal can call off. */
export function wait(ms: number, signal: AbortSignal): Promise<void> {
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

/** Resolves when the clip can play, or when it is clear that it never will. */
function canPlay(clip: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const settled = (): boolean =>
      clip.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA || clip.error !== null;
    if (settled()) {
      resolve();
      return;
    }
    clip.addEventListener('canplay', () => resolve(), { once: true, signal });
    clip.addEventListener('error', () => resolve(), { once: true, signal });
  });
}

// The properties an animation here moves, as the style object names them.
type Moved = 'opacity' | 'transform' | 'strokeDashoffset' | 'strokeDasharray' | 'clipPath';

/** Something the opening animates, and so something a skip can catch in mid-air. */
interface Part {
  el: Element;
  /** Eased from where they were caught to where the finished page has them. */
  ease: Moved[];
  /** Kept as they were caught for as long as the easing takes. */
  hold?: Moved[];
  /** Where to ease to, when the finished page's own value cannot be eased to. */
  to?: Keyframe;
}

type RailAxis = RailOptions['axis'];

type Caught = Array<{ part: Part; from: Partial<Record<Moved, string>> }>;

/**
 * Builds the opening for this page. `afterPowerOn` is the scene that follows the
 * picture coming on: when it resolves, the opening is over.
 */
export function createPageOpening(
  cast: Cast,
  afterPowerOn: (scene: Scene) => Promise<void>,
): PageOpening {
  const root = document.documentElement;
  const top = find<HTMLElement>('.top');
  const set = find<HTMLElement>('.set');
  // The cable is drawn twice, for the desktop and for the phone, and only one of
  // the two drawings shows. Both are drawn in, so whichever is seen is right.
  const cable = ':is([data-cable], [data-cable-phone])';
  const wires = findAll<SVGPathElement>(`${cable} .wire`);
  const tangleNotes = findAll<SVGTextElement>(`${cable} .note-tangle`);
  const runNotes = findAll<SVGTextElement>(`${cable} .note-run`);
  const doodleRows = findAll<SVGSVGElement>(`${cable} svg`).map((drawing) =>
    findAll<SVGGElement>('.doodle', drawing),
  );
  const plugs = findAll<SVGGElement>(`${cable} .plug`);
  const rings = findAll<SVGCircleElement>(`${cable} .spark`);
  const screen = find<HTMLElement>('[data-screen]');
  const media = find<HTMLElement>('.media', screen);
  const glare = find<HTMLElement>('.crt', screen);
  const rail = find<HTMLElement>('[data-rail]');
  const tracks = findAll<HTMLElement>('.results .trk');

  const parts: Part[] = [
    { el: top, ease: ['opacity', 'transform'] },
    { el: set, ease: ['opacity', 'transform'] },
    ...wires.map((el): Part => ({ el, ease: ['strokeDashoffset'], hold: ['strokeDasharray'] })),
    ...[...tangleNotes, ...runNotes, ...doodleRows.flat(), ...plugs].map(
      (el): Part => ({ el, ease: ['opacity'] }),
    ),
    ...rings.map((el): Part => ({ el, ease: ['opacity'], hold: ['transform'] })),
    { el: glare, ease: ['opacity', 'transform'] },
    // The finished rail is not clipped at all, which nothing can be eased to.
    { el: rail, ease: ['clipPath'], to: { clipPath: 'inset(0 0 0 0)' } },
    ...tracks.map((el): Part => ({ el, ease: ['opacity', 'transform'] })),
  ];

  // Every animation the opening has started. `finish` cancels them all.
  const started: Animation[] = [];
  // Where a skip caught things, for `finish` to ease them on from.
  let caught: Caught | undefined;
  // When the rail starts to move, once it has been lit.
  let railRollsAt: number | undefined;

  /**
   * Starts an animation that holds its first frame until its delay is up and, by
   * default, leaves the element to the stylesheet when it ends.
   */
  function animate(
    el: Element,
    frames: Keyframe[],
    timing: KeyframeAnimationOptions,
  ): Animation {
    const animation = el.animate(frames, { fill: 'backwards', ...timing, id: 'opening' });
    started.push(animation);
    return animation;
  }

  function setStage(stage: Stage): void {
    root.dataset.stage = stage;
  }

  // ----- the beats -----

  // The fade up, kept until it can be let go of.
  const risen: Animation[] = [];

  // Once the name and the set have risen and the stage has moved past `off`, the
  // stylesheet has them where they rest and the fade up is let go of. It must
  // not be held: an animation held on the set's transform makes the set the box
  // that the mascot's scene, fixed to the window, is placed in and clipped to.
  function letGoOfRisen(): void {
    if (root.dataset.stage === 'off') return;
    for (const animation of risen) {
      if (animation.playState === 'finished') animation.cancel();
    }
  }

  // The name, the links and the set fade up from where the stylesheet has them
  // waiting. The stage may still be `off` when they arrive, so they hold their
  // last frame until it is not.
  function fadeUp(): void {
    const rise = (el: HTMLElement, duration: number, delay: number): void => {
      const { opacity, transform } = getComputedStyle(el);
      const animation = animate(el, [{ opacity, transform }, { opacity: 1, transform: 'none' }], {
        duration,
        delay,
        easing: RISE,
        fill: 'both',
      });
      risen.push(animation);
      animation.finished.then(letGoOfRisen, () => undefined);
    };
    rise(top, TOP_MS, 0);
    rise(set, SET_MS, SET_AFTER_MS);
  }

  // The line draws itself from the tangle to the set. The first note ("tried a lot
  // of things", above the drawings) and the small drawings come early; the second
  // note (beside the tangle) follows the last drawing; then the plug and the ring
  // that pulses out from it.
  function drawCable(): void {
    letGoOfRisen();
    for (const wire of wires) {
      animate(wire, WIRE_FRAMES, { duration: WIRE_MS, delay: WIRE_AFTER_MS, easing: WIRE_EASING });
    }
    for (const note of tangleNotes) {
      animate(note, APPEAR_FRAMES, {
        duration: NOTE_MS,
        delay: SECOND_NOTE_AFTER_MS,
        easing: 'ease',
      });
    }
    for (const doodles of doodleRows) {
      doodles.forEach((doodle, index) => {
        animate(doodle, APPEAR_FRAMES, {
          duration: DOODLE_MS,
          delay: FIRST_DOODLE_AFTER_MS + index * DOODLE_EVERY_MS,
          easing: 'ease',
        });
      });
    }
    for (const note of runNotes) {
      animate(note, APPEAR_FRAMES, { duration: NOTE_MS, delay: FIRST_NOTE_AFTER_MS, easing: 'ease' });
    }
    for (const plug of plugs) {
      animate(plug, APPEAR_FRAMES, {
        duration: PLUG_FADE_MS,
        delay: PLUG_FADE_AFTER_MS,
        easing: 'ease',
      });
    }
    // The ring is not there before its moment or after it.
    for (const ring of rings) {
      animate(ring, RING_FRAMES, {
        duration: RING_MS,
        delay: RING_AFTER_MS,
        easing: 'ease-out',
        fill: 'none',
      });
    }
  }

  // The stage becomes `on` as the flash begins. The screen stays dark for the
  // first part of it, and the picture, the channel readout and the static are
  // switched on behind the glare at its widest. The dial and its numbers follow
  // the picture and the words under the set follow those: their transitions wait
  // `--picture-after` and `--words-after`.
  async function powerOn(signal: AbortSignal): Promise<void> {
    setStage('on');
    const dark = animate(media, DARK_FRAMES, { duration: PICTURE_MS, fill: 'none' });
    animate(glare, POWER_ON_FRAMES, { duration: POWER_ON_MS, fill: 'none' });
    await dark.finished;
    signal.throwIfAborted();
    cast.set.switchOn();
  }

  function lightRail(): void {
    setStage('lit');
    const axis = cast.railAxis();
    animate(rail, WIPE_FRAMES[axis], { duration: REVEAL_MS, easing: REVEAL_EASING });
    tracks.forEach((track, index) => {
      animate(track, TRACK_FRAMES[axis], {
        duration: REVEAL_MS,
        delay: index * SECOND_TRACK_AFTER_MS,
        easing: REVEAL_EASING,
      });
    });
    cast.rollRail(ROLL_AFTER_MS, ROLL_RAMP_MS);
    railRollsAt = performance.now() + ROLL_AFTER_MS;
  }

  // Everything from the plug going in to the end. Power waits for the first clip
  // to be able to play, so the set does not come on to a still picture, but only
  // so long: past the cap it comes on showing the poster and the clip takes over
  // when it can.
  async function plugIn(signal: AbortSignal): Promise<void> {
    await Promise.all([
      wait(POWER_AFTER_PLUG_MS, signal),
      Promise.race([canPlay(cast.set.clip, signal), wait(TIMING.powerOnCapMs, signal)]),
    ]);
    await powerOn(signal);
    await afterPowerOn({
      signal,
      wait: (ms) => wait(ms, signal),
      setStage,
      lightRail,
    });
  }

  const steps: OpeningStep[] = [
    { stage: 'off', atMs: 0, enter: fadeUp },
    { stage: 'cable', atMs: CABLE_MS, enter: drawCable },
    { stage: 'plugged', atMs: PLUG_MS, enter: plugIn },
  ];

  // ----- the finished page -----

  function catchInMidAir(): Caught {
    return parts.map((part) => {
      const style = getComputedStyle(part.el);
      const from: Partial<Record<Moved, string>> = {};
      for (const property of [...part.ease, ...(part.hold ?? [])]) from[property] = style[property];
      return { part, from };
    });
  }

  // Eases each thing a skip caught on to where the finished page has it. These
  // are short, end by themselves and leave nothing behind.
  function settle(from: Caught): void {
    for (const { part, from: was } of from) {
      const style = getComputedStyle(part.el);
      const moving = part.ease.filter((property) => was[property] !== style[property]);
      if (moving.length === 0) continue;
      const first: Keyframe = {};
      const last: Keyframe = {};
      for (const property of moving) {
        first[property] = was[property];
        last[property] = part.to?.[property] ?? style[property];
      }
      for (const property of part.hold ?? []) {
        first[property] = was[property];
        last[property] = was[property];
      }
      part.el.animate([first, last], { duration: SETTLE_MS, easing: 'ease-out', id: 'settle' });
    }
  }

  // Safe from any stage at any instant, and before the opening has started. By
  // now the stage is `done`, so the stylesheet already has everything in its end
  // state; what is left is to stop the opening and start what should be running.
  function finish(): void {
    // A natural end does not abort the signal. This does, so that nothing is left
    // waiting on a timer or a clip. The opening is already over, so it cannot
    // come back in here.
    timeline.skip();
    for (const animation of started) animation.cancel();
    started.length = 0;
    root.style.removeProperty('--picture-after');
    root.style.removeProperty('--words-after');
    if (caught !== undefined) settle(caught);
    caught = undefined;

    if (!cast.set.isOn()) cast.set.switchOn();
    // A rail that is already moving is left alone, so that it does not jump back.
    if (railRollsAt === undefined || performance.now() < railRollsAt) {
      cast.rollRail(0, QUICK_RAMP_MS);
    }
  }

  const timeline = createOpening(steps, { onStage: setStage, finish });

  return {
    play() {
      if (timeline.stage() === 'done') return;
      // The stylesheet delays what follows the picture by this much.
      root.style.setProperty('--picture-after', `${PICTURE_MS}ms`);
      root.style.setProperty('--words-after', `${PICTURE_MS + WORDS_AFTER_PICTURE_MS}ms`);
      // Ask for the first clip in full now: there are four seconds to fetch it in.
      cast.set.clip.preload = 'auto';
      timeline.start();
    },
    skip(how) {
      if (timeline.stage() === 'done') return;
      // Read where things are before the stage changes under them.
      if (how === 'eased') caught = catchInMidAir();
      timeline.skip();
    },
    isDone: () => timeline.stage() === 'done',
    finished: timeline.finished,
  };
}
