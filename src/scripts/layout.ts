// Which arrangement the page is in, and what it gives up to fit the window.
//
// The stylesheets do the arranging. Upright windows up to a small tablet's width
// get the phone layout (`phone.css`); everything else gets the desktop sheet,
// scaled to fit. This file measures the part of the window that is actually
// visible and decides, from the space there is, how much the scene gives up:
// see `Give` in `../lib/fit`. It marks both on `<html>`: `data-phone` and
// `data-give`.

import { giveLevel, type Give } from '../lib/fit';
import { fitPhoneCable } from './cable';

/** When the phone layout applies. The same query opens `phone.css`: keep the two alike. */
export const PHONE_QUERY = '(max-width: 820px) and (orientation: portrait)';

/** The phone layout is drawn 390 wide and grows no more than this (`--p` in `phone.css`). */
const PHONE_WIDTH = 390;
const PHONE_SCALE_CAP = 1.45;

/** Handwriting smaller than this is not readable; the cable's notes go first. */
const LEAST_NOTE_PX = 10;
/**
 * The desktop cable's notes are set this size (`.cable .note` in `cable.css`) in
 * a drawing this wide (the `viewBox` in `Cable.astro`).
 */
const NOTE_SIZE = 19;
const CABLE_WIDTH = 284;

/**
 * Spare height on a phone, in the phone's units. The gaps between the set, the
 * words and the band take the first of it, this much each; then the paper above
 * the antenna and under the band shares it, evened up, until each is this tall;
 * then the gaps between take the rest. At their smallest the paper above the
 * antenna is 10 and under the band 16px (`phone.css`).
 */
const INNER_FIRST = 12;
const OUTER_MOST = 56;
const ABOVE_LEAST = 10;
const BELOW_LEAST_PX = 16;

export interface Layout {
  phone: boolean;
  give: Give;
}

/** The visible part of the window, in CSS pixels at the page's own zoom. */
function visibleSize(): { width: number; height: number } {
  const view = window.visualViewport;
  if (view) return { width: view.width * view.scale, height: view.height * view.scale };
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * The phone layout's height at each level, measured with nothing stretched and
 * at full width, and the scale it was measured at. Leaves the page at level 0.
 */
function measurePhone(root: HTMLElement, width: number): { needed: number[]; scale: number } {
  const scale = Math.min(width / PHONE_WIDTH, PHONE_SCALE_CAP);
  // With none of the spare height shared out yet.
  root.style.removeProperty('--more');
  root.style.removeProperty('--above');
  root.setAttribute('data-measuring', '');
  const needed = ([0, 1, 2, 3] as const).map((level) => {
    root.dataset.give = String(level);
    return document.body.getBoundingClientRect().height;
  });
  root.removeAttribute('data-measuring');
  return { needed, scale };
}

/**
 * On the desktop sheet everything fits by scaling, so the only thing to give up
 * is what scaling makes unreadable: the cable's notes, and the cable with them.
 */
function desktopGive(): Give {
  const drawing = document.querySelector('[data-cable] svg');
  const width = drawing?.getBoundingClientRect().width ?? 0;
  if (width === 0) return 0;
  return (NOTE_SIZE * width) / CABLE_WIDTH < LEAST_NOTE_PX ? 2 : 0;
}

/**
 * How the spare height is shared out: what each gap between the set, the words
 * and the band gets (`more`), and what is added above the antenna (`above`).
 * Whatever is left lies under the band.
 */
function share(spare: number, scale: number): { more: number; above: number } {
  if (spare <= 0) return { more: 0, above: 0 };
  const first = Math.min(spare, 2 * INNER_FIRST * scale);
  const outer = Math.min(spare - first, 2 * OUTER_MOST * scale - ABOVE_LEAST * scale - BELOW_LEAST_PX);
  // Evened up: the paper above the antenna starts smaller, so it gets more.
  const above = Math.min(outer, Math.max(0, (outer + BELOW_LEAST_PX - ABOVE_LEAST * scale) / 2));
  return { more: (spare - outer) / 2, above };
}

function measure(root: HTMLElement, phoneQuery: MediaQueryList): Layout {
  const { width, height } = visibleSize();
  const phone = phoneQuery.matches;
  root.toggleAttribute('data-phone', phone);
  // The stylesheets size the page from the window as the browser reports it to
  // them (`dvh`), which is what is visible. Where less is visible than that, as
  // under the bars of some in-app browsers, they are told the visible height.
  if (height < window.innerHeight - 1) root.style.setProperty('--vh', `${height}px`);
  else root.style.removeProperty('--vh');

  if (!phone) {
    root.style.removeProperty('--more');
    root.style.removeProperty('--above');
    root.dataset.give = '0';
    const give = desktopGive();
    root.dataset.give = String(give);
    return { phone, give };
  }

  const { needed, scale } = measurePhone(root, width);
  const give = giveLevel([needed[0], needed[1], needed[2], needed[3]], height);
  root.dataset.give = String(give);
  // Its height in the layout's own units, for the stylesheet to scale it down by
  // if even the most it can give up is not enough.
  root.style.setProperty('--fit-h', String(needed[give] / scale));
  const { more, above } = share(height - needed[give], scale);
  root.style.setProperty('--more', `${more}px`);
  root.style.setProperty('--above', `${above}px`);
  fitPhoneCable();
  return { phone, give };
}

/**
 * Measures the layout now and again whenever the window or the visible part of
 * it changes size, or the device is turned. Calls `onChange` at once with what
 * it found, and after that only when the arrangement or the give changes.
 *
 * Call it before anything that listens for `resize` itself, so that by the time
 * those listeners run the page is already laid out for the new size.
 */
export function watchLayout(onChange: (info: Layout) => void): void {
  const root = document.documentElement;
  const phoneQuery = window.matchMedia(PHONE_QUERY);
  let last: Layout | undefined;

  const update = (): void => {
    frame = 0;
    const now = measure(root, phoneQuery);
    window.dispatchEvent(new Event(LAID_OUT));
    if (last !== undefined && last.phone === now.phone && last.give === now.give) return;
    last = now;
    onChange(now);
  };

  // However many resize events a frame brings, the page is measured once.
  let frame = 0;
  const soon = (): void => {
    if (frame === 0) frame = requestAnimationFrame(update);
  };
  window.addEventListener('resize', soon);
  window.visualViewport?.addEventListener('resize', soon);
  phoneQuery.addEventListener('change', soon);
  // Lettering that arrives late can change what the measures come to.
  void document.fonts?.ready.then(soon);
  update();
}

/**
 * Sent on the window each time the layout has been measured and the page laid
 * out again for the window's size: what anything placed by measuring the page
 * (the mascot) should follow.
 */
export const LAID_OUT = 'layout';
