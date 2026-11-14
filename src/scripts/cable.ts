// The phone's cable: the line from the tangle up the column's edge to the plug on
// the set's side. The tangle and the band's notes stay where they are; how far
// the plug is above them depends on the gaps the layout gives the column, so the
// upper end of the line, the plug and its ring are drawn here from where the set
// and the band actually are. `Cable.astro` carries the same drawing for the gaps
// at their smallest, for a page with no script.

/** How far down the set's body the plug goes in, as a share of the body's height. */
const PLUG_AT = 0.78;
/** The line runs up this far right of the set's edge, in the drawing's units. */
const RUN_OUT = 12;
/** Room left above the plug in the drawing. */
const ABOVE_PLUG = 10;
/** The drawing reaches this far below the band's top: the tangle's lowest loop. */
const BELOW_TOP = 60;
/** Where the tangle's own path ends and the line's run begins. */
const TANGLE_END = ' C ';

/** One unit of the phone's drawing in pixels: the band is 328 units wide. */
const BAND_UNITS = 328;

function n(value: number): string {
  return value.toFixed(1);
}

/**
 * Redraws the upper end of the phone's cable for the layout as it is now. Does
 * nothing unless the phone's cable is showing.
 */
export function fitPhoneCable(): void {
  const band = document.querySelector<HTMLElement>('[data-cable-phone]');
  const drawing = band?.querySelector<SVGSVGElement>('.wire-art');
  const wire = drawing?.querySelector<SVGPathElement>('.wire');
  const plug = drawing?.querySelector<SVGRectElement>('.plug rect');
  const prongs = drawing?.querySelector<SVGPathElement>('.plug path');
  const spark = drawing?.querySelector<SVGCircleElement>('.spark');
  const body = document.querySelector('.tv-body');
  if (!band || !drawing || !wire || !plug || !prongs || !spark || !body) return;
  const at = band.getBoundingClientRect();
  if (at.width === 0) return;

  const unit = at.width / BAND_UNITS;
  const set = body.getBoundingClientRect();
  const plugX = (set.right - at.left) / unit;
  const plugY = (set.top + PLUG_AT * set.height - at.top) / unit;
  const run = plugX + RUN_OUT;
  const top = plugY - ABOVE_PLUG;

  const tangle = (wire.getAttribute('d') ?? '').split(TANGLE_END)[0];
  // The tangle's last point, where the run begins.
  const end = (tangle.match(/-?\d+(?:\.\d+)?/g) ?? ['0', '0']).slice(-2).map(Number);
  wire.setAttribute(
    'd',
    `${tangle} C ${n(end[0] + 6)} ${n(end[1])}, ${n(run)} ${n(end[1] - 2)}, ${n(run)} ${n(end[1] - 14)}` +
      ` L ${n(run)} ${n(plugY + 8)} C ${n(run)} ${n(plugY + 3)}, ${n(run - 2)} ${n(plugY)}, ${n(plugX + 7.5)} ${n(plugY)}`,
  );
  plug.setAttribute('x', n(plugX + 1.5));
  plug.setAttribute('y', n(plugY - 5));
  prongs.setAttribute('d', `M${n(plugX + 1.5)} ${n(plugY - 2.2)}h-3M${n(plugX + 1.5)} ${n(plugY + 2.2)}h-3`);
  spark.setAttribute('cx', n(plugX - 0.5));
  spark.setAttribute('cy', n(plugY));
  spark.style.transformOrigin = `${n(plugX - 0.5)}px ${n(plugY)}px`;
  drawing.setAttribute('viewBox', `0 ${n(top)} 352 ${n(BELOW_TOP - top)}`);
  band.style.setProperty('--wire-top', n(top));
}
