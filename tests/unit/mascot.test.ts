import { describe, expect, it } from 'vitest';
import {
  beamSweep,
  glanceCues,
  type Box,
  type EyeCue,
  type Point,
} from '../../src/scripts/mascot';

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

  it('sweeps a rail along the bottom from left to right, pointing down', () => {
    const torch: Point = { x: 60, y: 200 };
    const strip: Box = { left: 10, top: 700, right: 380, bottom: 800 };
    const sweep = beamSweep(torch, strip, 'across', BEAM);
    // Straight left is 0 and straight down is -90; it ends further round, to the right.
    expect(sweep.from).toBeLessThan(0);
    expect(sweep.from).toBeGreaterThan(-90);
    expect(sweep.to).toBeLessThan(sweep.from);
    expect(sweep.to).toBeGreaterThan(-180);
    const farCorner = Math.hypot(strip.right - torch.x, strip.bottom - torch.y);
    expect(BEAM.gap + sweep.length).toBeGreaterThan(farCorner);
  });

  it('never sweeps backwards', () => {
    // A strip above the torch would have it turn the other way round.
    const above: Box = { left: 10, top: 100, right: 380, bottom: 150 };
    const sweep = beamSweep({ x: 200, y: 500 }, above, 'across', BEAM);
    expect(sweep.to).toBe(sweep.from);
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
