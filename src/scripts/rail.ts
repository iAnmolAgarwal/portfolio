// The rail's roll. The cards are in the page twice, one copy after the other, and
// the track slides by exactly one copy and starts again, so the loop has no seam.
// A visitor who asked for less motion gets a list to scroll by hand instead.

export interface RailOptions {
  /** How long to wait before the roll begins. */
  delayMs: number;
  /** How long the roll takes to ease from a standstill to full speed. */
  rampMs: number;
  /** `y` rolls upward (a column of cards); `x` rolls leftward (a row of them). */
  axis: 'y' | 'x';
  /** No roll: the rail scrolls by hand along its axis and shows the cards once. */
  reduced: boolean;
}

/** One trip round the loop at full speed. */
const LOOP_MS = 44_000;

/** How to stop what an earlier call set rolling, for each rail. */
const stops = new WeakMap<HTMLElement, () => void>();

/**
 * The distance of one loop: from where the first copy of the cards starts to
 * where the second starts, along the axis. Read from the laid-out boxes, so it
 * is whatever the layout makes it and keeps its fractions of a pixel. It is 0
 * while the rail is not laid out or has no second copy.
 */
function loopLength(track: HTMLElement, axis: RailOptions['axis']): number {
  const first = track.children.item(0);
  const second = track.children.item(1);
  if (first === null || second === null) return 0;
  const from = first.getBoundingClientRect();
  const to = second.getBoundingClientRect();
  return axis === 'y' ? to.top - from.top : to.left - from.left;
}

function frames(axis: RailOptions['axis'], length: number): Keyframe[] {
  const end = axis === 'y' ? `translateY(${-length}px)` : `translateX(${-length}px)`;
  return [{ transform: 'translate(0, 0)' }, { transform: end }];
}

/** Sets the track rolling and returns how to stop it. */
function roll(root: HTMLElement, track: HTMLElement, opts: RailOptions): () => void {
  const { axis, delayMs, rampMs } = opts;
  let loop: Animation | null = null;
  let length = 0;
  let rate = delayMs > 0 || rampMs > 0 ? 0 : 1;
  let pointerInside = root.matches(':hover');
  let focusInside = root.matches(':focus-visible') || root.querySelector(':focus-visible') !== null;

  // The roll waits while the pointer is over the rail or the keyboard is in it.
  const hold = (): void => {
    if (loop === null) return;
    if (pointerInside || focusInside) loop.pause();
    else loop.play();
  };

  // Sizes the loop from the layout as it is now. The roll keeps its place in the
  // loop, so nothing jumps when the page is resized under it.
  const fit = (): void => {
    const measured = loopLength(track, axis);
    if (measured <= 0 || Math.abs(measured - length) < 0.01) return;
    length = measured;
    if (loop === null) {
      loop = track.animate(frames(axis, length), {
        duration: LOOP_MS,
        iterations: Infinity,
        easing: 'linear',
      });
      loop.playbackRate = rate;
      hold();
    } else if (loop.effect instanceof KeyframeEffect) {
      loop.effect.setKeyframes(frames(axis, length));
    }
  };

  const setRate = (next: number): void => {
    rate = next;
    if (loop !== null) loop.playbackRate = next;
  };

  // After the delay, ease up to full speed so the roll does not lurch into motion.
  let frame = 0;
  const timer = setTimeout(() => {
    const began = performance.now();
    const step = (now: number): void => {
      const t = rampMs > 0 ? Math.min(1, Math.max(0, (now - began) / rampMs)) : 1;
      setRate(t * t * (3 - 2 * t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }, delayMs);

  const listening = new AbortController();
  const { signal } = listening;
  root.addEventListener(
    'pointerenter',
    () => {
      pointerInside = true;
      hold();
    },
    { signal },
  );
  root.addEventListener(
    'pointerleave',
    () => {
      pointerInside = false;
      hold();
    },
    { signal },
  );
  root.addEventListener(
    'focusin',
    (event) => {
      focusInside = event.target instanceof Element && event.target.matches(':focus-visible');
      hold();
    },
    { signal },
  );
  root.addEventListener(
    'focusout',
    (event) => {
      if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return;
      focusInside = false;
      hold();
    },
    { signal },
  );

  // The cards are sized from the viewport, so the loop is too. Watching the sizes
  // also catches a rail that was not laid out when the roll was asked for.
  const sizes = new ResizeObserver(fit);
  sizes.observe(track);
  const firstCopy = track.children.item(0);
  if (firstCopy !== null) sizes.observe(firstCopy);
  fit();

  return () => {
    listening.abort();
    sizes.disconnect();
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    loop?.cancel();
  };
}

/**
 * Starts the rail at `root` (the `[data-rail]` element). Calling it again on the
 * same rail stops what the earlier call set going and begins afresh.
 */
export function startRail(root: HTMLElement, opts: RailOptions): void {
  stops.get(root)?.();
  stops.delete(root);

  // The styles read these: which way the rail runs and whether it rolls.
  root.dataset.axis = opts.axis;
  root.dataset.motion = opts.reduced ? 'still' : 'roll';
  root.scrollTop = 0;
  root.scrollLeft = 0;

  if (opts.reduced) {
    // A list scrolled by hand has to be reachable from the keyboard too, and a
    // place the keyboard stops at needs a name: the one the rail's column has.
    root.tabIndex = 0;
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', root.closest('[aria-label]')?.getAttribute('aria-label') ?? '');
    return;
  }
  root.removeAttribute('tabindex');
  root.removeAttribute('role');
  root.removeAttribute('aria-label');

  const track = root.querySelector<HTMLElement>('[data-rail-track]');
  if (track === null) return;
  stops.set(root, roll(root, track, opts));
}
