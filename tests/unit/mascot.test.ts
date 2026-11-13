import { describe, expect, it } from 'vitest';
import { beamSweep, type Box, type Point } from '../../src/scripts/mascot';

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
