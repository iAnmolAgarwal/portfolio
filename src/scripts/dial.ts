// The channel dial: the angle each channel sits at, and the pointer and
// keyboard input that picks one. The settled rotation of the dial is drawn by
// whoever handles the channel change; this file only turns it during a drag.

export const STEP_DEG = 48;

// How far the pointer must travel before a press counts as a drag, not a click.
const DRAG_PX = 5;

/** Dial angle for a channel: 0, 1, 2 -> -48, 0, 48. Straight up is 0. */
export function channelToAngle(index: number): number {
  return (index - 1) * STEP_DEG;
}

/** The channel nearest to a dial angle, held to 0..count-1. */
export function angleToChannel(angleDeg: number, count: number): number {
  const nearest = Math.round(angleDeg / STEP_DEG) + 1;
  return Math.min(count - 1, Math.max(0, nearest));
}

/** Angle of a point from the dial's centre: clockwise from straight up, in degrees. */
export function pointerAngle(dx: number, dy: number): number {
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

/** A dragged dial turns half a step past its end channels and no further. */
export function clampDragAngle(angleDeg: number, count: number): number {
  const min = channelToAngle(0) - STEP_DEG / 2;
  const max = channelToAngle(count - 1) + STEP_DEG / 2;
  return Math.min(max, Math.max(min, angleDeg));
}

/** Record the showing channel on the dial. Call it after an automatic change. */
export function setDialValue(el: HTMLElement, index: number): void {
  el.setAttribute('aria-valuenow', String(index + 1));
}

interface Press {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  // The inline transform the dial had before the drag started turning it.
  transformBefore: string;
}

export function wireDial(
  el: HTMLElement,
  opts: { count: number; current(): number; onPick(index: number): void; drag: boolean },
): void {
  const { count } = opts;
  let press: Press | null = null;
  // A drag ends with the browser firing `click` as well. That one is not a step.
  let ignoreNextClick = false;

  el.setAttribute('role', 'slider');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-valuemin', '1');
  el.setAttribute('aria-valuemax', String(count));

  const sync = (): void => setDialValue(el, opts.current());
  sync();

  function pick(index: number): void {
    opts.onPick(index);
    sync();
  }

  function angleAt(event: PointerEvent): number {
    const box = el.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    return clampDragAngle(pointerAngle(dx, dy), count);
  }

  // Ends the press and gives the dial's rotation back to the page.
  function release(): Press | null {
    const ended = press;
    press = null;
    if (ended?.moved && opts.drag) {
      el.removeAttribute('data-dragging');
      el.style.transform = ended.transformBefore;
    }
    return ended;
  }

  el.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    release();
    ignoreNextClick = false;
    press = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      transformBefore: '',
    };
    if (!opts.drag) return;
    try {
      // Keeps the drag alive when the pointer leaves the dial.
      el.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone. The drag then only works over the dial.
    }
  });

  el.addEventListener('pointermove', (event) => {
    if (!press || event.pointerId !== press.pointerId) return;
    if (!press.moved) {
      // With dragging off, a finger that wobbles is still a tap. The browser only
      // sends `click` after a touch it judged to be a tap, so leave it to decide.
      if (!opts.drag && event.pointerType === 'touch') return;
      const travelled = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
      if (travelled <= DRAG_PX) return;
      press.moved = true;
      if (opts.drag) {
        press.transformBefore = el.style.transform;
        el.setAttribute('data-dragging', '');
      }
    }
    if (opts.drag) el.style.transform = `rotate(${angleAt(event)}deg)`;
  });

  el.addEventListener('pointerup', (event) => {
    if (!press || event.pointerId !== press.pointerId) return;
    const ended = release();
    // A press that never moved is a click, and the click event does the step.
    if (!ended?.moved) return;
    ignoreNextClick = true;
    if (opts.drag) pick(angleToChannel(angleAt(event), count));
  });

  el.addEventListener('pointercancel', (event) => {
    if (press && event.pointerId === press.pointerId) release();
  });

  el.addEventListener('click', () => {
    if (ignoreNextClick) {
      ignoreNextClick = false;
      return;
    }
    pick((opts.current() + 1) % count);
  });

  el.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    let step = 0;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') step = 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') step = -1;
    else return;
    event.preventDefault();
    pick(Math.min(count - 1, Math.max(0, opts.current() + step)));
  });

  el.addEventListener('focus', sync);
}
