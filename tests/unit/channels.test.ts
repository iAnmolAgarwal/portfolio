import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChannels } from '../../src/scripts/channels';

const AUTO_MS = 7000;
const AFTER_MANUAL_MS = 20000;

function setup(overrides: { auto?: boolean; count?: number } = {}) {
  const onTune = vi.fn<(index: number, manual: boolean) => void>();
  const controller = createChannels({
    count: overrides.count ?? 3,
    autoMs: AUTO_MS,
    afterManualMs: AFTER_MANUAL_MS,
    auto: overrides.auto ?? true,
    onTune,
  });
  return { controller, onTune };
}

describe('createChannels', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts on the first channel without tuning', () => {
    const { controller, onTune } = setup();
    controller.start();
    expect(controller.current()).toBe(0);
    expect(onTune).not.toHaveBeenCalled();
  });

  it('changes channel by itself every 7 seconds and wraps round', () => {
    const { controller, onTune } = setup();
    controller.start();

    vi.advanceTimersByTime(AUTO_MS - 1);
    expect(onTune).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onTune).toHaveBeenCalledTimes(1);
    expect(onTune).toHaveBeenLastCalledWith(1, false);
    expect(controller.current()).toBe(1);

    vi.advanceTimersByTime(AUTO_MS);
    expect(onTune).toHaveBeenCalledTimes(2);
    expect(onTune).toHaveBeenLastCalledWith(2, false);

    vi.advanceTimersByTime(AUTO_MS);
    expect(onTune).toHaveBeenCalledTimes(3);
    expect(onTune).toHaveBeenLastCalledWith(0, false);
    expect(controller.current()).toBe(0);
  });

  it('waits 20 seconds after a manual tune before switching by itself again', () => {
    const { controller, onTune } = setup();
    controller.start();
    vi.advanceTimersByTime(3000);

    controller.tune(2, true);
    expect(onTune).toHaveBeenCalledTimes(1);
    expect(onTune).toHaveBeenLastCalledWith(2, true);
    expect(controller.current()).toBe(2);

    vi.advanceTimersByTime(AFTER_MANUAL_MS - 1);
    expect(onTune).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(onTune).toHaveBeenCalledTimes(2);
    expect(onTune).toHaveBeenLastCalledWith(0, false);

    // Back to the ordinary 7 second rhythm afterwards.
    vi.advanceTimersByTime(AUTO_MS);
    expect(onTune).toHaveBeenCalledTimes(3);
    expect(onTune).toHaveBeenLastCalledWith(1, false);
  });

  it('gives one tune per manual step and never stacks timers', () => {
    const { controller, onTune } = setup();
    controller.start();

    for (let i = 0; i < 10; i += 1) controller.next(true);

    expect(onTune).toHaveBeenCalledTimes(10);
    expect(onTune.mock.calls.map(([index]) => index)).toEqual([1, 2, 0, 1, 2, 0, 1, 2, 0, 1]);
    expect(onTune.mock.calls.every(([, manual]) => manual)).toBe(true);
    expect(controller.current()).toBe(1);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(AFTER_MANUAL_MS);
    expect(onTune).toHaveBeenCalledTimes(11);
    expect(onTune).toHaveBeenLastCalledWith(2, false);
  });

  it('never switches by itself when auto is off, but still tunes by hand', () => {
    const { controller, onTune } = setup({ auto: false });
    controller.start();
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(10 * AFTER_MANUAL_MS);
    expect(onTune).not.toHaveBeenCalled();

    controller.next(true);
    expect(onTune).toHaveBeenCalledTimes(1);
    expect(onTune).toHaveBeenLastCalledWith(1, true);
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(10 * AFTER_MANUAL_MS);
    expect(onTune).toHaveBeenCalledTimes(1);
  });

  it('stop() cancels the pending change', () => {
    const { controller, onTune } = setup();
    controller.start();
    vi.advanceTimersByTime(AUTO_MS);
    expect(onTune).toHaveBeenCalledTimes(1);

    controller.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10 * AFTER_MANUAL_MS);
    expect(onTune).toHaveBeenCalledTimes(1);
    expect(controller.current()).toBe(1);
  });

  it('starts again after a stop with a fresh 7 second wait from the same channel', () => {
    const { controller, onTune } = setup();
    controller.start();
    vi.advanceTimersByTime(AUTO_MS + 5000);
    controller.stop();
    vi.advanceTimersByTime(60000);

    controller.start();
    vi.advanceTimersByTime(AUTO_MS - 1);
    expect(onTune).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(onTune).toHaveBeenCalledTimes(2);
    expect(onTune).toHaveBeenLastCalledWith(2, false);
  });

  it('starts with a longer first wait when it is given one, then goes back to 7 seconds', () => {
    const { controller, onTune } = setup();
    controller.start(12000);

    vi.advanceTimersByTime(11999);
    expect(onTune).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTune).toHaveBeenCalledTimes(1);
    expect(onTune).toHaveBeenLastCalledWith(1, false);

    vi.advanceTimersByTime(AUTO_MS - 1);
    expect(onTune).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(onTune).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('never waits when auto is off, whatever first wait it is given', () => {
    const { controller, onTune } = setup({ auto: false });
    controller.start(12000);
    vi.advanceTimersByTime(60000);
    expect(onTune).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a single timer when start() is called twice', () => {
    const { controller, onTune } = setup();
    controller.start();
    vi.advanceTimersByTime(4000);
    controller.start();
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(AUTO_MS - 1);
    expect(onTune).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTune).toHaveBeenCalledTimes(1);
  });

  it('tunes by hand while stopped without starting a timer', () => {
    const { controller, onTune } = setup();
    controller.tune(2, true);
    expect(onTune).toHaveBeenCalledTimes(1);
    expect(onTune).toHaveBeenLastCalledWith(2, true);
    expect(controller.current()).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps switching after a tune handler throws', () => {
    const onTune = vi.fn<(index: number, manual: boolean) => void>();
    onTune.mockImplementationOnce(() => {
      throw new Error('handler failed');
    });
    const controller = createChannels({
      count: 3,
      autoMs: AUTO_MS,
      afterManualMs: AFTER_MANUAL_MS,
      auto: true,
      onTune,
    });
    controller.start();

    expect(() => controller.next(true)).toThrow('handler failed');
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(AFTER_MANUAL_MS);
    expect(onTune).toHaveBeenCalledTimes(2);
    expect(onTune).toHaveBeenLastCalledWith(2, false);
  });
});
