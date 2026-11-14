import { afterEach, describe, expect, it, vi } from 'vitest';
import { beamSweep, type Box, type Point } from '../../src/scripts/beam';
import { glanceCues, playMascot, type EyeCue } from '../../src/scripts/mascot';

// The beam as `mascot.css` draws it: 860 long, 420 across its wide end and 2% of
// that across its narrow end, which starts 20 from where the torch turns.
const BEAM = { halfAngle: Math.atan((0.98 * 420) / 860 / 2), gap: 20 };

// The page at 1440 by 900, the size the scene was approved at: the torch of a
// mascot standing on the set's top-left corner, and the rail down the left.
const TORCH: Point = { x: 366.2, y: 178.4 };
const RAIL: Box = { left: 40, top: 104, right: 252, bottom: 884 };

describe('beamSweep', () => {
  it('turns the torch as the approved scene does at the size it was approved at', () => {
    const sweep = beamSweep(TORCH, RAIL, 'down', BEAM);
    expect(Math.abs(sweep.from - -4)).toBeLessThan(1);
    expect(Math.abs(sweep.to - -76)).toBeLessThan(1);
    expect(Math.abs(sweep.length - 860)).toBeLessThan(860 * 0.01);
  });

  it('follows the rail when it moves or changes width', () => {
    const wider = beamSweep(TORCH, { ...RAIL, right: 280 }, 'down', BEAM);
    const reference = beamSweep(TORCH, RAIL, 'down', BEAM);
    // A rail that reaches nearer the set is first lit at a steeper angle.
    expect(wider.from).toBeLessThan(reference.from);

    const shorter = beamSweep(TORCH, { ...RAIL, bottom: 700 }, 'down', BEAM);
    expect(shorter.to).toBeGreaterThan(reference.to);
    expect(shorter.length).toBeLessThan(reference.length);
  });

  it('lights a strip above the torch along its middle, from its left end to its right end', () => {
    const torch: Point = { x: 60, y: 200 };
    const strip: Box = { left: 24, top: 40, right: 366, bottom: 160 };
    const sweep = beamSweep(torch, strip, 'up', BEAM);
    const steps = sweep.steps ?? [];
    expect(steps.length).toBeGreaterThan(8);
    expect(steps[0]).toBe(sweep.from);
    expect(steps[steps.length - 1]).toBe(sweep.to);
    // Where the beam's middle meets the strip's middle at each step: evenly from end to end.
    const middle = (strip.top + strip.bottom) / 2;
    steps.forEach((turn, index) => {
      const radians = (turn * Math.PI) / 180;
      // CSS turns the beam, which points left, clockwise by `turn`.
      const direction = { x: -Math.cos(radians), y: -Math.sin(radians) };
      const along = (middle - torch.y) / direction.y;
      expect(along).toBeGreaterThan(0);
      const x = torch.x + along * direction.x;
      const wanted = strip.left + ((strip.right - strip.left) * index) / (steps.length - 1);
      expect(Math.abs(x - wanted)).toBeLessThan(0.01);
    });
    // Each step turns on round the same way.
    for (let index = 1; index < steps.length; index += 1) {
      expect(steps[index]).toBeGreaterThan(steps[index - 1]);
    }
    const farCorner = Math.hypot(strip.right - torch.x, strip.top - torch.y);
    expect(BEAM.gap + sweep.length).toBeGreaterThan(farCorner);
  });

  it('does not turn at all for a strip that is not above the torch', () => {
    const below: Box = { left: 10, top: 600, right: 380, bottom: 700 };
    const sweep = beamSweep({ x: 200, y: 500 }, below, 'up', BEAM);
    expect(sweep.to).toBe(sweep.from);
  });

  it('never sweeps a rail beside the set backwards', () => {
    const sweep = beamSweep({ x: 200, y: 500 }, { left: 300, top: 0, right: 380, bottom: 10 }, 'down', BEAM);
    // Down the side the torch turns one way only: `to` is never past `from` the other way.
    expect(sweep.to).toBeLessThanOrEqual(sweep.from);
  });
});

/** How long the eyes stay on one column, from arriving there to leaving it. */
function restAt(cues: EyeCue[], x: number): number {
  const there = cues.filter((cue) => cue.gaze.x === x);
  return there[there.length - 1].at - there[0].at;
}

describe('glanceCues', () => {
  it('rests 456 ms looking left and 456 ms looking right, as the approved scene does', () => {
    const cues = glanceCues(2);
    expect(restAt(cues, -2)).toBe(456);
    expect(restAt(cues, 2)).toBe(456);
  });

  it('keeps those rests whatever the number of cells', () => {
    for (const cells of [1, 2, 3]) {
      const cues = glanceCues(cells);
      expect(restAt(cues, -cells)).toBe(456);
      expect(restAt(cues, cells)).toBe(456);
    }
  });

  it('walks one cell at a time: 38 ms to cross a cell, 38 ms resting on it', () => {
    const cues = glanceCues(2);
    const moves = cues.slice(1).filter((cue, i) => cue.gaze.x !== cues[i].gaze.x);
    // Two cells left, four right, two back to the middle.
    expect(moves.map((cue) => cue.gaze.x)).toEqual([-1, -2, -1, 0, 1, 2, 1, 0]);
    for (const move of moves) {
      const before = cues[cues.indexOf(move) - 1];
      expect(move.at - before.at).toBe(38);
      expect(Math.abs(move.gaze.x - before.gaze.x)).toBe(1);
    }
    // On the way through a cell the eyes stop on it for 38 ms.
    const passingThrough = [-1, 1].flatMap((x) => {
      const there = cues.filter((cue) => cue.gaze.x === x);
      return [there[1].at - there[0].at, there[3].at - there[2].at];
    });
    expect(passingThrough).toEqual([38, 38, 38, 38]);
  });

  it('ends with the approved pause and two blinks, 874 ms after the eyes return', () => {
    const cues = glanceCues(2);
    const back = cues.findIndex((cue, i) => i > 0 && cue.gaze.x === 0 && cues[i - 1].gaze.x === 1);
    const tail = cues.slice(back);
    const times = tail.map((cue) => cue.at - tail[0].at);
    expect(times).toEqual([0, 342, 380, 494, 532, 684, 722, 817, 874]);
    expect(tail.map((cue) => cue.open)).toEqual([1, 1, 0.5, 0.5, 1, 1, 0.5, 0.5, 1]);
  });

  it('takes 2280 ms in all with a two-cell glance', () => {
    const cues = glanceCues(2);
    expect(cues[0].at).toBe(0);
    expect(cues[cues.length - 1].at).toBe(114 + 456 + 266 + 456 + 114 + 874);
  });
});

// ---------- playMascot, with just enough of a page to run it ----------

/** An animation that runs until it is cancelled. */
function fakeAnimation(): Animation {
  let fail: (reason: unknown) => void = () => undefined;
  const finished = new Promise<Animation>((_, reject) => {
    fail = reject;
  });
  finished.catch(() => undefined);
  return {
    finished,
    effect: null,
    cancel: () => fail(new DOMException('cancelled', 'AbortError')),
  } as unknown as Animation;
}

/** An element with attributes, a style and a box, that can be animated. */
function fakeElement(children: Record<string, unknown> = {}): HTMLElement {
  const attributes = new Set<string>();
  const view = { addEventListener: () => undefined, removeEventListener: () => undefined };
  const el = {
    hasAttribute: (name: string) => attributes.has(name),
    removeAttribute: (name: string) => attributes.delete(name),
    toggleAttribute: (name: string, on: boolean) => {
      if (on) attributes.add(name);
      else attributes.delete(name);
      return on;
    },
    querySelector: (selector: string) => children[selector] ?? null,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300 }),
    animate: () => fakeAnimation(),
    style: { setProperty: () => undefined, removeProperty: () => undefined },
    offsetParent: null,
    ownerDocument: {
      defaultView: view,
      documentElement: { getBoundingClientRect: () => ({ left: 0, top: 0 }), clientLeft: 0, clientTop: 0 },
      querySelector: () => null,
    },
  };
  return el as unknown as HTMLElement;
}

describe('playMascot', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not let a scene that was aborted tidy away a newer one', async () => {
    vi.stubGlobal('getComputedStyle', () => ({ width: '54px', left: '0px', top: '0px' }));
    const mascot = fakeElement({
      '[data-eyes]': fakeElement(),
      '[data-torch]': fakeElement(),
      '[data-beam]': fakeElement(),
    });
    const tv = fakeElement();
    const options = { tv, beamTarget: 'down' as const, onTorchOn: () => undefined };

    const first = new AbortController();
    const firstScene = playMascot(mascot, { ...options, signal: first.signal });
    expect(mascot.hasAttribute('data-playing')).toBe(true);

    // Aborted, and a new scene begun straight away, before the first has wound down.
    first.abort();
    expect(mascot.hasAttribute('data-playing')).toBe(false);
    const second = new AbortController();
    const secondScene = playMascot(mascot, { ...options, signal: second.signal });
    expect(mascot.hasAttribute('data-playing')).toBe(true);

    await expect(firstScene).rejects.toMatchObject({ name: 'AbortError' });
    // Let every step the first scene had left run out.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mascot.hasAttribute('data-playing')).toBe(true);

    second.abort();
    await expect(secondScene).rejects.toMatchObject({ name: 'AbortError' });
    expect(mascot.hasAttribute('data-playing')).toBe(false);
  });
});
