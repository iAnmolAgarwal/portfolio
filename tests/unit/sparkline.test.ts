import { describe, expect, it } from 'vitest';
import { sparklinePoints } from '../../src/lib/sparkline';

describe('sparklinePoints', () => {
  it('maps the lowest value to the bottom and the highest to the top', () => {
    expect(sparklinePoints([0, 10], 100, 50, 0)).toBe('0.0,50.0 100.0,0.0');
  });

  it('keeps the line inside the padding', () => {
    expect(sparklinePoints([0, 5, 10], 100, 50, 4)).toBe('4.0,46.0 50.0,25.0 96.0,4.0');
  });

  it('returns one point per value', () => {
    const ratings = Array.from({ length: 28 }, (_, i) => 400 + i * 37);
    const points = sparklinePoints(ratings, 90, 50, 4).split(' ');
    expect(points).toHaveLength(28);
    for (const point of points) {
      expect(point).toMatch(/^\d+\.\d,\d+\.\d$/);
    }
  });

  it('draws a flat series along the middle', () => {
    expect(sparklinePoints([7, 7, 7], 100, 50, 0)).toBe('0.0,25.0 50.0,25.0 100.0,25.0');
  });

  it('returns an empty string for no values', () => {
    expect(sparklinePoints([], 100, 50)).toBe('');
  });
});
