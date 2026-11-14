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
 * then the gaps between take the rest. At its smallest the paper above the
 * antenna is 10 (`phone.css`); the paper under the band is the page's own bottom
 * padding, which is read from the page (`body` in `phone.css`).
 */
const INNER_FIRST = 12;
const OUTER_MOST = 56;
const ABOVE_LEAST = 10;

/**
 * A level is kept if it is at most this much too tall for the visible height:
 * the column is then scaled down by that little (`--fit-h` in `phone.css`), which
 * cannot be seen, rather than giving up the cable for a few pixels. It keeps a
 * phone whose lettering comes out a little taller than here from landing on a
 * different level.
 */
const GIVE_TOLERANCE_PX = 3;

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
 * at full width, the scale it was measured at, and the paper under the band at
 * that scale, in pixels. Leaves the page at level 0.
 */
function measurePhone(
  root: HTMLElement,
  width: number,
): { needed: number[]; scale: number; below: number } {
  const scale = Math.min(width / PHONE_WIDTH, PHONE_SCALE_CAP);
  // With none of the spare height shared out yet.
  root.style.removeProperty('--more');
  root.style.removeProperty('--above');
  root.setAttribute('data-measuring', '');
  const needed = ([0, 1, 2, 3] as const).map((level) => {
    root.dataset.give = String(level);
    return document.body.getBoundingClientRect().height;
  });
  const below = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
  root.removeAttribute('data-measuring');
  return { needed, scale, below };
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
 * Whatever is left lies under the band, on top of the `below` pixels of paper
 * that are always there.
 */
function share(spare: number, scale: number, below: number): { more: number; above: number } {
  if (spare <= 0) return { more: 0, above: 0 };
  const first = Math.min(spare, 2 * INNER_FIRST * scale);
  const outer = Math.min(spare - first, 2 * OUTER_MOST * scale - ABOVE_LEAST * scale - below);
  // Evened up: the paper above the antenna starts smaller, so it gets more.
  const above = Math.min(outer, Math.max(0, (outer + below - ABOVE_LEAST * scale) / 2));
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

  const { needed, scale, below } = measurePhone(root, width);
  const give = giveLevel(
    [needed[0], needed[1], needed[2], needed[3]],
    height + GIVE_TOLERANCE_PX,
  );
  root.dataset.give = String(give);
  // Its height in the layout's own units, for the stylesheet to scale it down by
  // if even the most it can give up is not enough.
  root.style.setProperty('--fit-h', String(needed[give] / scale));
  const { more, above } = share(height - needed[give], scale, below);
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
 * After the first, measuring waits for the next frame, so that a burst of
 * resize events is measured once. Anything placed by measuring the page should
 * follow `LAID_OUT`, which is sent once the page has been laid out again, rather
 * than `resize`. A pinch-zoom, which changes the visible part of the window but
 * not its size, is not measured again.
 */
export function watchLayout(onChange: (info: Layout) => void): void {
  const root = document.documentElement;
  const phoneQuery = window.matchMedia(PHONE_QUERY);
  let last: Layout | undefined;
  // The sizes the page was last measured at, and whether the next measure must
  // happen even if they are the same.
  let measuredAt = '';
  let force = false;

  const update = (): void => {
    frame = 0;
    const { width, height } = visibleSize();
    const at = [width, height, window.innerWidth, window.innerHeight, phoneQuery.matches].join(' ');
    if (at === measuredAt && !force) return;
    measuredAt = at;
    force = false;
    const now = measure(root, phoneQuery);
    window.dispatchEvent(new Event(LAID_OUT));
    if (last !== undefined && last.phone === now.phone && last.give === now.give) return;
    last = now;
    onChange(now);
  };

  // However many resize events a frame brings, the page is measured once.
  let frame = 0;
  const soon = (always = false): void => {
    force ||= always;
    if (frame === 0) frame = requestAnimationFrame(update);
  };
  window.addEventListener('resize', () => soon());
  window.visualViewport?.addEventListener('resize', () => soon());
  phoneQuery.addEventListener('change', () => soon(true));
  // Lettering that arrives late can change what the measures come to.
  void document.fonts?.ready.then(() => soon(true));
  update();
}

/**
 * Sent on the window each time the layout has been measured and the page laid
 * out again for the window's size: what anything placed by measuring the page
 * (the mascot) should follow.
 */
export const LAID_OUT = 'layout';
