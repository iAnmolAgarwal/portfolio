import { describe, expect, it } from 'vitest';
import { flickSpeed, wrapTime } from '../../src/scripts/rail';

describe('wrapTime', () => {
  it('leaves a time inside the loop alone', () => {
    expect(wrapTime(1200, 44_000)).toBe(1200);
  });

  it('brings a time past the end back round to the start', () => {
    expect(wrapTime(44_500, 44_000)).toBe(500);
  });

  it('brings a time before the start back round to the end', () => {
    expect(wrapTime(-500, 44_000)).toBe(43_500);
  });
});

describe('flickSpeed', () => {
  it('is positive when the pointer was moving up the column', () => {
    const trace = [
      { at: 300, time: 1000 },
      { at: 260, time: 1040 },
    ];
    expect(flickSpeed(trace, 1045)).toBeCloseTo(1, 5);
  });

  it('is negative when the pointer was moving down it', () => {
    const trace = [
      { at: 260, time: 1000 },
      { at: 300, time: 1040 },
    ];
    expect(flickSpeed(trace, 1045)).toBeCloseTo(-1, 5);
  });

  it('is 0 when the pointer had stopped before it lifted', () => {
    const trace = [
      { at: 300, time: 1000 },
      { at: 260, time: 1040 },
    ];
    expect(flickSpeed(trace, 1400)).toBe(0);
  });

  it('is 0 for a single move', () => {
    expect(flickSpeed([{ at: 300, time: 1000 }], 1005)).toBe(0);
  });

  it('never throws the cards faster than 4 pixels a millisecond', () => {
    const trace = [
      { at: 900, time: 1000 },
      { at: 100, time: 1010 },
    ];
    expect(flickSpeed(trace, 1012)).toBe(4);
  });
});
