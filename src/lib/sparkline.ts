/**
 * Turns a series of values into the `points` attribute of an SVG polyline.
 *
 * Values are spread evenly from left to right. The lowest value sits at
 * `height - pad` and the highest at `pad`, and the line is inset by `pad` at the
 * left and right too, so a stroke is not clipped at the edges of the drawing.
 * A series with no range (one value, or all equal) is drawn along the middle.
 */
export function sparklinePoints(
  values: readonly number[],
  width: number,
  height: number,
  pad = 0,
): string {
  if (values.length === 0) return '';

  const lowest = Math.min(...values);
  const range = Math.max(...values) - lowest;
  const innerWidth = width - 2 * pad;
  const innerHeight = height - 2 * pad;
  const lastIndex = values.length - 1;

  return values
    .map((value, index) => {
      const across = lastIndex === 0 ? 0.5 : index / lastIndex;
      const up = range === 0 ? 0.5 : (value - lowest) / range;
      const x = pad + across * innerWidth;
      const y = height - pad - up * innerHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
