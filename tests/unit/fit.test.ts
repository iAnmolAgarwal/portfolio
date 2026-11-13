import { describe, expect, it } from 'vitest';
import { giveLevel } from '../../src/lib/fit';

const NEEDED = [700, 660, 600, 560] as const;

describe('giveLevel', () => {
  it('gives nothing up when everything fits', () => {
    expect(giveLevel(NEEDED, 720)).toBe(0);
  });

  it('picks the lowest level that fits the height', () => {
    expect(giveLevel(NEEDED, 680)).toBe(1);
    expect(giveLevel(NEEDED, 610)).toBe(2);
    expect(giveLevel(NEEDED, 570)).toBe(3);
  });

  it('gives the most up when nothing fits', () => {
    expect(giveLevel(NEEDED, 400)).toBe(3);
  });

  it('counts an exact fit as fitting', () => {
    expect(giveLevel(NEEDED, 700)).toBe(0);
    expect(giveLevel(NEEDED, 699)).toBe(1);
    expect(giveLevel(NEEDED, 600)).toBe(2);
  });
});
