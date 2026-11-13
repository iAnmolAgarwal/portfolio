import { describe, expect, it } from 'vitest';
import { CF_RATINGS } from '../../src/data/site';
import { sparklinePoints } from '../../src/lib/sparkline';

describe('sparklinePoints', () => {
  it('maps the lowest value to the bottom and the highest to the top', () => {
    expect(sparklinePoints([0, 10], 100, 50, 0)).toBe('0.0,50.0 100.0,0.0');
  });

  it('keeps the line inside the padding', () => {
    expect(sparklinePoints([0, 5, 10], 100, 50, 4)).toBe('4.0,46.0 50.0,25.0 96.0,4.0');
  });

  it('takes a separate padding for left and right', () => {
    expect(sparklinePoints([0, 5, 10], 100, 50, 4, 3)).toBe('3.0,46.0 50.0,25.0 97.0,4.0');
  });

  it('draws his rating history as the approved Codeforces card does', () => {
    expect(sparklinePoints(CF_RATINGS, 90, 50, 4, 3)).toBe(
      '3.0,46.0 6.1,36.0 9.2,27.4 12.3,23.0 15.4,18.6 18.6,16.0 21.7,17.7 24.8,18.3 27.9,21.3 ' +
        '31.0,17.8 34.1,16.8 37.2,15.1 40.3,15.5 43.4,13.1 46.6,13.7 49.7,13.5 52.8,15.4 ' +
        '55.9,16.0 59.0,17.1 62.1,15.4 65.2,16.4 68.3,14.7 71.4,11.4 74.6,10.8 77.7,6.3 ' +
        '80.8,6.5 83.9,6.1 87.0,4.0',
    );
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
