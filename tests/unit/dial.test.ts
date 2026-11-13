import { describe, expect, it, vi } from 'vitest';
import {
  STEP_DEG,
  angleToChannel,
  channelToAngle,
  clampDragAngle,
  pointerAngle,
  setDialValue,
  wireDial,
} from '../../src/scripts/dial';

describe('channelToAngle', () => {
  it('puts the three channels a step apart around straight up', () => {
    expect(STEP_DEG).toBe(48);
    expect(channelToAngle(0)).toBe(-48);
    expect(channelToAngle(1)).toBe(0);
    expect(channelToAngle(2)).toBe(48);
  });
});

describe('angleToChannel', () => {
  it('snaps an angle to the nearest channel', () => {
    expect(angleToChannel(-70, 3)).toBe(0);
    expect(angleToChannel(10, 3)).toBe(1);
    expect(angleToChannel(60, 3)).toBe(2);
  });

  it('clamps to the first and last channel', () => {
    expect(angleToChannel(-180, 3)).toBe(0);
    expect(angleToChannel(180, 3)).toBe(2);
  });

  it('is the inverse of channelToAngle', () => {
    for (const index of [0, 1, 2]) {
      expect(angleToChannel(channelToAngle(index), 3)).toBe(index);
    }
  });
});

describe('pointerAngle', () => {
  it('measures clockwise from straight up, in degrees', () => {
    expect(pointerAngle(0, -10)).toBeCloseTo(0);
    expect(pointerAngle(10, 0)).toBeCloseTo(90);
    expect(pointerAngle(-10, 0)).toBeCloseTo(-90);
    expect(pointerAngle(10, -10)).toBeCloseTo(45);
    expect(pointerAngle(-10, -10)).toBeCloseTo(-45);
  });
});

describe('clampDragAngle', () => {
  it('lets the dial turn half a step past the end channels and no further', () => {
    expect(clampDragAngle(30, 3)).toBe(30);
    expect(clampDragAngle(-30, 3)).toBe(-30);
    expect(clampDragAngle(120, 3)).toBe(72);
    expect(clampDragAngle(-120, 3)).toBe(-72);
  });
});

// A stand-in for the dial element. There is no DOM in the unit tests, so this
// records listeners and attributes and lets a test fire events by hand. The
// real pointer and focus behaviour is covered by the browser tests.
type Listener = (event: Record<string, unknown>) => void;

function fakeDial(box = { left: 100, top: 100, width: 60, height: 60 }) {
  const listeners = new Map<string, Listener[]>();
  const attributes = new Map<string, string>();
  const style = { transform: '' };
  const element = {
    style,
    addEventListener(type: string, listener: Listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    removeAttribute(name: string) {
      attributes.delete(name);
    },
    getBoundingClientRect: () => box,
    setPointerCapture: vi.fn(),
  };
  const fire = (type: string, event: Record<string, unknown> = {}) => {
    const full = { preventDefault: vi.fn(), pointerId: 1, button: 0, ...event };
    for (const listener of listeners.get(type) ?? []) listener(full);
    return full;
  };
  // Centre of the fake dial, to aim pointer events around.
  const centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  return { el: element as unknown as HTMLElement, attributes, style, fire, centre };
}

function wired(options: { start?: number; drag?: boolean; count?: number } = {}) {
  const dial = fakeDial();
  let current = options.start ?? 0;
  const onPick = vi.fn((index: number) => {
    current = index;
  });
  wireDial(dial.el, {
    count: options.count ?? 3,
    current: () => current,
    onPick,
    drag: options.drag ?? true,
  });
  return {
    ...dial,
    onPick,
    setCurrent(index: number) {
      current = index;
    },
  };
}

describe('setDialValue', () => {
  it('writes the channel number, counting from one', () => {
    const dial = fakeDial();
    setDialValue(dial.el, 2);
    expect(dial.attributes.get('aria-valuenow')).toBe('3');
  });
});

describe('wireDial', () => {
  it('describes the dial as a slider over the channels', () => {
    const dial = wired({ start: 1 });
    expect(dial.attributes.get('role')).toBe('slider');
    expect(dial.attributes.get('tabindex')).toBe('0');
    expect(dial.attributes.get('aria-valuemin')).toBe('1');
    expect(dial.attributes.get('aria-valuemax')).toBe('3');
    expect(dial.attributes.get('aria-valuenow')).toBe('2');
  });

  it('steps to the next channel on a click and wraps round', () => {
    const dial = wired();
    dial.fire('click');
    dial.fire('click');
    dial.fire('click');
    expect(dial.onPick.mock.calls).toEqual([[1], [2], [0]]);
    expect(dial.attributes.get('aria-valuenow')).toBe('1');
  });

  it('counts a press and release without movement as one click', () => {
    const dial = wired();
    const at = { clientX: dial.centre.x, clientY: dial.centre.y };
    dial.fire('pointerdown', at);
    dial.fire('pointermove', { clientX: at.clientX + 3, clientY: at.clientY + 3 });
    dial.fire('pointerup', { clientX: at.clientX + 3, clientY: at.clientY + 3 });
    expect(dial.onPick).not.toHaveBeenCalled();
    dial.fire('click');
    expect(dial.onPick.mock.calls).toEqual([[1]]);
  });

  it('follows a drag and picks the nearest channel once on release', () => {
    const dial = wired();
    const { x, y } = dial.centre;
    dial.style.transform = 'rotate(-48deg)';

    dial.fire('pointerdown', { clientX: x, clientY: y - 20 });
    expect(dial.el.setPointerCapture).toHaveBeenCalledWith(1);

    // Straight right of the centre is 90 degrees, held at half a step past channel 3.
    dial.fire('pointermove', { clientX: x + 20, clientY: y });
    expect(dial.style.transform).toBe('rotate(72deg)');
    expect(dial.attributes.has('data-dragging')).toBe(true);
    expect(dial.onPick).not.toHaveBeenCalled();

    dial.fire('pointerup', { clientX: x + 20, clientY: y });
    expect(dial.onPick.mock.calls).toEqual([[2]]);
    expect(dial.attributes.has('data-dragging')).toBe(false);
    // The live rotation is handed back; the settled angle belongs to the caller.
    expect(dial.style.transform).toBe('rotate(-48deg)');
    expect(dial.attributes.get('aria-valuenow')).toBe('3');

    // The browser's click that follows the release must not step again.
    dial.fire('click');
    expect(dial.onPick).toHaveBeenCalledTimes(1);

    // The next real click works as usual.
    dial.fire('pointerdown', { clientX: x, clientY: y });
    dial.fire('pointerup', { clientX: x, clientY: y });
    dial.fire('click');
    expect(dial.onPick.mock.calls).toEqual([[2], [0]]);
  });

  it('picks the middle and first channels from where the drag ends', () => {
    const dial = wired({ start: 2 });
    const { x, y } = dial.centre;

    dial.fire('pointerdown', { clientX: x + 20, clientY: y });
    dial.fire('pointermove', { clientX: x + 2, clientY: y - 20 });
    dial.fire('pointerup', { clientX: x + 2, clientY: y - 20 });
    expect(dial.onPick).toHaveBeenLastCalledWith(1);

    dial.fire('pointerdown', { clientX: x, clientY: y - 20 });
    dial.fire('pointermove', { clientX: x - 20, clientY: y - 10 });
    dial.fire('pointerup', { clientX: x - 20, clientY: y - 10 });
    expect(dial.onPick).toHaveBeenLastCalledWith(0);
    expect(dial.onPick).toHaveBeenCalledTimes(2);
  });

  it('drops a cancelled drag without picking', () => {
    const dial = wired();
    const { x, y } = dial.centre;
    dial.style.transform = 'rotate(-48deg)';

    dial.fire('pointerdown', { clientX: x, clientY: y - 20 });
    dial.fire('pointermove', { clientX: x + 20, clientY: y });
    dial.fire('pointercancel');
    expect(dial.onPick).not.toHaveBeenCalled();
    expect(dial.style.transform).toBe('rotate(-48deg)');
    expect(dial.attributes.has('data-dragging')).toBe(false);

    dial.fire('pointermove', { clientX: x - 20, clientY: y });
    expect(dial.style.transform).toBe('rotate(-48deg)');
  });

  it('ignores a drag when dragging is off, and still steps on a tap', () => {
    const dial = wired({ drag: false });
    const { x, y } = dial.centre;

    dial.fire('pointerdown', { clientX: x, clientY: y - 20 });
    dial.fire('pointermove', { clientX: x + 20, clientY: y });
    expect(dial.style.transform).toBe('');
    expect(dial.attributes.has('data-dragging')).toBe(false);
    dial.fire('pointerup', { clientX: x + 20, clientY: y });
    dial.fire('click');
    expect(dial.onPick).not.toHaveBeenCalled();

    dial.fire('pointerdown', { clientX: x, clientY: y });
    dial.fire('pointerup', { clientX: x, clientY: y });
    dial.fire('click');
    expect(dial.onPick.mock.calls).toEqual([[1]]);
  });

  it('still steps when a finger wobbles during a tap and dragging is off', () => {
    const dial = wired({ drag: false });
    const { x, y } = dial.centre;

    // The browser only sends `click` after a touch it judged to be a tap.
    dial.fire('pointerdown', { pointerType: 'touch', clientX: x, clientY: y });
    dial.fire('pointermove', { pointerType: 'touch', clientX: x + 6, clientY: y + 5 });
    dial.fire('pointerup', { pointerType: 'touch', clientX: x + 6, clientY: y + 5 });
    dial.fire('click');
    expect(dial.onPick.mock.calls).toEqual([[1]]);
  });

  it('moves one channel with the arrow keys and stops at the ends', () => {
    const dial = wired({ start: 1 });

    const right = dial.fire('keydown', { key: 'ArrowRight' });
    expect(dial.onPick).toHaveBeenLastCalledWith(2);
    expect(right.preventDefault).toHaveBeenCalled();

    dial.fire('keydown', { key: 'ArrowUp' });
    expect(dial.onPick).toHaveBeenLastCalledWith(2);

    dial.fire('keydown', { key: 'ArrowLeft' });
    expect(dial.onPick).toHaveBeenLastCalledWith(1);
    dial.fire('keydown', { key: 'ArrowDown' });
    expect(dial.onPick).toHaveBeenLastCalledWith(0);
    dial.fire('keydown', { key: 'ArrowDown' });
    expect(dial.onPick).toHaveBeenLastCalledWith(0);

    expect(dial.onPick).toHaveBeenCalledTimes(5);
    expect(dial.attributes.get('aria-valuenow')).toBe('1');
  });

  it('leaves other keys alone', () => {
    const dial = wired();
    const tab = dial.fire('keydown', { key: 'Tab' });
    expect(dial.onPick).not.toHaveBeenCalled();
    expect(tab.preventDefault).not.toHaveBeenCalled();
  });

  it('reads the current channel again when the dial takes focus', () => {
    const dial = wired();
    dial.setCurrent(2);
    expect(dial.attributes.get('aria-valuenow')).toBe('1');
    dial.fire('focus');
    expect(dial.attributes.get('aria-valuenow')).toBe('3');
  });
});
