// The rail's roll. The cards are in the page twice, one copy after the other, and
// the track slides by exactly one copy and starts again, so the loop has no seam.
// A visitor can also move it by hand, with the wheel, a drag or a finger, to
// reach a card without waiting for it; the roll picks up again from wherever
// they left it. A visitor who asked for less motion gets a list to scroll by
// hand instead.

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

/** How long the roll waits after the hand has left the cards alone. */
const RESUME_MS = 1600;

/** How far the pointer must travel before a press counts as a drag. */
const DRAG_PX = 5;

/** A flick's speed falls to about a third in this long. */
const GLIDE_MS = 325;

/** The speed, in pixels a millisecond, under which a glide has come to rest. */
const REST_SPEED = 0.02;

/** A flick is never thrown faster than this, in pixels a millisecond. */
const TOP_SPEED = 4;

/** Only the pointer's last moves this recent say how fast it was going. */
const FLICK_WINDOW_MS = 100;

/** Where the pointer was along the rail's axis, and when. */
export interface Trace {
  at: number;
  time: number;
}

/** A time on the loop, brought back inside one trip round it. */
export function wrapTime(time: number, duration: number): number {
  const wrapped = time % duration;
  return wrapped < 0 ? wrapped + duration : wrapped;
}

/**
 * How fast the cards were being pushed when the pointer let go, in pixels a
 * millisecond: positive the way the roll goes (the pointer moving up a column,
 * or left along a row). 0 if the pointer had stopped before it lifted.
 */
export function flickSpeed(trace: readonly Trace[], liftedAt: number): number {
  const recent = trace.filter((point) => liftedAt - point.time <= FLICK_WINDOW_MS);
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (first === undefined || last === undefined || last.time <= first.time) return 0;
  const speed = (first.at - last.at) / (last.time - first.time);
  return Math.min(TOP_SPEED, Math.max(-TOP_SPEED, speed));
}

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

  // By hand: a drag under way, a flick still gliding, and until when the roll
  // leaves the cards where the hand put them.
  let dragging = false;
  let glide = 0;
  let handUntil = 0;
  let resume: ReturnType<typeof setTimeout> | undefined;

  // The roll waits while the pointer is over the rail or the keyboard is in it,
  // and while a hand is moving the cards or has only just let go of them.
  const hold = (): void => {
    if (loop === null) return;
    const inHand = dragging || glide !== 0 || performance.now() < handUntil;
    if (pointerInside || focusInside || inHand) loop.pause();
    else loop.play();
  };

  // Moves the cards `px` further along the loop (back, if negative) by setting
  // where the roll is in its trip, so the roll goes on from there.
  const shift = (px: number): void => {
    if (loop === null || length <= 0) return;
    const now = Number(loop.currentTime ?? 0);
    loop.currentTime = wrapTime(now + (px / length) * LOOP_MS, LOOP_MS);
  };

  // The hand moved the cards: the roll stays off them for a moment longer.
  const byHand = (): void => {
    handUntil = performance.now() + RESUME_MS;
    clearTimeout(resume);
    resume = setTimeout(hold, RESUME_MS + 20);
    hold();
  };

  const stopGlide = (): void => {
    cancelAnimationFrame(glide);
    glide = 0;
  };

  // A flick carries the cards on and slows to a stop.
  const startGlide = (speed: number): void => {
    if (Math.abs(speed) < REST_SPEED) return;
    let before = performance.now();
    const step = (now: number): void => {
      const elapsed = Math.min(64, Math.max(0, now - before));
      before = now;
      shift(speed * elapsed);
      speed *= Math.exp(-elapsed / GLIDE_MS);
      glide = Math.abs(speed) < REST_SPEED ? 0 : requestAnimationFrame(step);
      byHand();
    };
    glide = requestAnimationFrame(step);
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

  // The wheel and the trackpad move the cards by as much as they report. A
  // column answers their vertical travel only, so a sideways swipe is left to
  // the browser; a row answers whichever way they travelled more, since a mouse
  // wheel only has the vertical. Pinching to zoom (the wheel with Control) is
  // the browser's too.
  root.addEventListener(
    'wheel',
    (event) => {
      if (loop === null || event.ctrlKey) return;
      const sideways = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const travel = axis === 'x' && sideways ? event.deltaX : event.deltaY;
      if (travel === 0 || (axis === 'y' && sideways)) return;
      event.preventDefault();
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? root.clientHeight
            : 1;
      stopGlide();
      shift(travel * unit);
      byHand();
    },
    { signal, passive: false },
  );

  // A press that travels becomes a drag: the cards follow the pointer, and a
  // flick at the end carries them on. A press that stays put is left alone.
  const along = (event: PointerEvent): number => (axis === 'y' ? event.clientY : event.clientX);
  let press: { id: number; from: number; last: number } | null = null;
  let trace: Trace[] = [];
  root.addEventListener(
    'pointerdown',
    (event) => {
      if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
      stopGlide();
      press = { id: event.pointerId, from: along(event), last: along(event) };
      trace = [];
    },
    { signal },
  );
  root.addEventListener(
    'pointermove',
    (event) => {
      if (press === null || event.pointerId !== press.id) return;
      const at = along(event);
      if (!dragging) {
        if (Math.abs(at - press.from) < DRAG_PX) return;
        dragging = true;
        press.last = at;
        root.dataset.dragging = '';
        getSelection()?.removeAllRanges();
        // Keep hearing the pointer if it strays off the rail mid-drag.
        try {
          root.setPointerCapture(event.pointerId);
        } catch {
          // The pointer is already gone; the drag ends with it.
        }
      }
      shift(press.last - at);
      press.last = at;
      trace.push({ at, time: event.timeStamp });
      if (trace.length > 12) trace.shift();
      byHand();
    },
    { signal },
  );
  const release = (event: PointerEvent): void => {
    if (press === null || event.pointerId !== press.id) return;
    press = null;
    if (!dragging) return;
    dragging = false;
    delete root.dataset.dragging;
    if (event.type === 'pointerup') startGlide(flickSpeed(trace, event.timeStamp));
    byHand();
  };
  root.addEventListener('pointerup', release, { signal });
  root.addEventListener('pointercancel', release, { signal });
  // A drag moves the cards; it must not pick a picture up off the page, nor
  // start selecting the page's words as the pointer passes over them (Safari
  // does, from a press on the rail, unless the press itself is refused).
  root.addEventListener('dragstart', (event) => event.preventDefault(), { signal });
  root.addEventListener(
    'mousedown',
    (event) => {
      if (event.button === 0) event.preventDefault();
    },
    { signal },
  );
  document.addEventListener(
    'selectstart',
    (event) => {
      if (press !== null) event.preventDefault();
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
    clearTimeout(resume);
    cancelAnimationFrame(frame);
    stopGlide();
    delete root.dataset.dragging;
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
    // place the keyboard stops at needs a name: the one the rail's column (the
    // `aside` round it) has. It is looked up there each time, not by the nearest
    // label, which after the first call would be the rail's own.
    root.tabIndex = 0;
    root.setAttribute('role', 'group');
    const label = root.closest('aside')?.getAttribute('aria-label');
    if (label) root.setAttribute('aria-label', label);
    else root.removeAttribute('aria-label');
    return;
  }
  root.removeAttribute('tabindex');
  root.removeAttribute('role');
  root.removeAttribute('aria-label');

  const track = root.querySelector<HTMLElement>('[data-rail-track]');
  if (track === null) return;
  stops.set(root, roll(root, track, opts));
}
