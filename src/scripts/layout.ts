// Which arrangement the page is in, and what it gives up to fit the window.
//
// The stylesheets do the arranging. Upright windows up to a small tablet's width
// get the phone layout (`phone.css`); everything else gets the desktop sheet,
// scaled to fit. This file measures the part of the window that is actually
// visible and decides, from the space there is, how much the scene gives up:
// see `Give` in `../lib/fit`. It marks both on `<html>`: `data-phone` and
// `data-give`.

import { giveLevel, type Give } from '../lib/fit';

/** When the phone layout applies. The same query opens `phone.css`. */
export const PHONE_QUERY = '(max-width: 820px) and (orientation: portrait)';

/** The phone layout is drawn 390 wide and grows no more than this. */
const PHONE_WIDTH = 390;
const PHONE_SCALE_CAP = 1.45;

/** Handwriting smaller than this is not readable; the cable's notes go first. */
const LEAST_NOTE_PX = 10;
/** The desktop cable's notes are set this size in a drawing this wide. */
const NOTE_SIZE = 19;
const CABLE_WIDTH = 284;

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
    const now = measure(root, phoneQuery);
    if (last !== undefined && last.phone === now.phone && last.give === now.give) return;
    last = now;
    onChange(now);
  };

  window.addEventListener('resize', update);
  window.visualViewport?.addEventListener('resize', update);
  phoneQuery.addEventListener('change', update);
  // Lettering that arrives late can change what the measures come to.
  void document.fonts?.ready.then(update);
  update();
}
