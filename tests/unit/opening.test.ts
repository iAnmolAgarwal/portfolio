import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpening, type OpeningStep, type Stage } from '../../src/scripts/opening';

const abortError = (): DOMException => new DOMException('The opening was skipped.', 'AbortError');

// Four stand-in steps at the real timeline's times. Each takes 300 ms and, like a
// real animation, rejects with an abort error when the signal fires mid-way.
function setup() {
  const entered: Array<{ stage: Stage; at: number }> = [];
  const signals: AbortSignal[] = [];
  const onStage = vi.fn<(stage: Stage) => void>();
  const finish = vi.fn<() => void>();

  const step = (stage: Stage, atMs: number): OpeningStep => ({
    stage,
    atMs,
    enter(signal) {
      entered.push({ stage, at: Date.now() });
      signals.push(signal);
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 300);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(abortError());
        });
      });
    },
  });

  const steps = [step('off', 0), step('cable', 500), step('plugged', 4200), step('on', 4400)];
  const opening = createOpening(steps, { onStage, finish });
  const stages = (): Stage[] => onStage.mock.calls.map(([stage]) => stage);
  return { opening, entered, signals, onStage, finish, stages };
}

describe('createOpening', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does nothing until it is started', async () => {
    const { opening, entered, onStage, finish } = setup();
    await vi.advanceTimersByTimeAsync(10000);
    expect(opening.stage()).toBe('off');
    expect(entered).toEqual([]);
    expect(onStage).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
  });

  it('enters each stage in order at its time', async () => {
    const { opening, entered, stages } = setup();
    opening.start();
    expect(entered).toEqual([{ stage: 'off', at: 0 }]);
    expect(opening.stage()).toBe('off');

    await vi.advanceTimersByTimeAsync(499);
    expect(stages()).toEqual(['off']);

    await vi.advanceTimersByTimeAsync(1);
    expect(stages()).toEqual(['off', 'cable']);
    expect(opening.stage()).toBe('cable');

    await vi.advanceTimersByTimeAsync(3699);
    expect(stages()).toEqual(['off', 'cable']);

    await vi.advanceTimersByTimeAsync(1);
    expect(opening.stage()).toBe('plugged');

    await vi.advanceTimersByTimeAsync(200);
    expect(opening.stage()).toBe('on');
    expect(entered).toEqual([
      { stage: 'off', at: 0 },
      { stage: 'cable', at: 500 },
      { stage: 'plugged', at: 4200 },
      { stage: 'on', at: 4400 },
    ]);
  });

  it('finishes once, after the last step has settled', async () => {
    const { opening, signals, finish, stages } = setup();
    let resolved = false;
    void opening.finished.then(() => {
      resolved = true;
    });
    opening.start();

    await vi.advanceTimersByTimeAsync(4699);
    expect(finish).not.toHaveBeenCalled();
    expect(resolved).toBe(false);
    expect(opening.stage()).toBe('on');

    await vi.advanceTimersByTimeAsync(1);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(true);
    expect(opening.stage()).toBe('done');
    expect(stages()).toEqual(['off', 'cable', 'plugged', 'on', 'done']);
    // Nothing was skipped, so nothing was aborted.
    expect(signals.every((signal) => !signal.aborted)).toBe(true);

    await vi.advanceTimersByTimeAsync(10000);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(stages()).toHaveLength(5);
  });

  it('reports done before it calls finish', async () => {
    const order: string[] = [];
    const opening = createOpening([{ stage: 'off', atMs: 0, enter: () => undefined }], {
      onStage: (stage) => order.push(`stage ${stage}`),
      finish: () => order.push(`finish while ${opening.stage()}`),
    });
    opening.start();
    await opening.finished;
    expect(order).toEqual(['stage off', 'stage done', 'finish while done']);
  });

  it.each([
    { at: 100, before: ['off'] },
    { at: 1000, before: ['off', 'cable'] },
    { at: 4300, before: ['off', 'cable', 'plugged'] },
    { at: 5000, before: ['off', 'cable', 'plugged', 'on', 'done'] },
  ])('skip() at $at ms gives one finish and no later step', async ({ at, before }) => {
    const { opening, entered, signals, finish, stages } = setup();
    opening.start();
    await vi.advanceTimersByTimeAsync(at);
    expect(stages()).toEqual(before);
    const enteredBefore = entered.length;

    opening.skip();
    expect(finish).toHaveBeenCalledTimes(1);
    expect(opening.stage()).toBe('done');
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    await expect(opening.finished).resolves.toBeUndefined();

    await vi.advanceTimersByTimeAsync(10000);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(entered).toHaveLength(enteredBefore);
    expect(stages().filter((stage) => stage === 'done')).toEqual(['done']);
    expect(stages().at(-1)).toBe('done');
    expect(stages()).toHaveLength(before.includes('done') ? before.length : before.length + 1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('calls finish once when skipped twice', async () => {
    const { opening, finish, stages } = setup();
    opening.start();
    await vi.advanceTimersByTimeAsync(1000);
    opening.skip();
    opening.skip();
    await vi.advanceTimersByTimeAsync(10000);
    opening.skip();
    expect(finish).toHaveBeenCalledTimes(1);
    expect(stages()).toEqual(['off', 'cable', 'done']);
  });

  it('finishes at once when skipped before it starts, and then never starts', async () => {
    const { opening, entered, finish, stages } = setup();
    opening.skip();
    expect(finish).toHaveBeenCalledTimes(1);
    expect(stages()).toEqual(['done']);

    opening.start();
    await vi.advanceTimersByTimeAsync(10000);
    expect(entered).toEqual([]);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(stages()).toEqual(['done']);
  });

  it('stops cleanly when a step skips the opening itself', async () => {
    const seen: string[] = [];
    const finish = vi.fn<() => void>();
    const opening = createOpening(
      [
        {
          stage: 'off',
          atMs: 0,
          enter(signal) {
            opening.skip();
            seen.push(signal.aborted ? 'off, aborted' : 'off');
          },
        },
        {
          stage: 'cable',
          atMs: 500,
          enter() {
            seen.push('cable');
          },
        },
      ],
      { onStage: () => undefined, finish },
    );
    opening.start();
    await vi.advanceTimersByTimeAsync(10000);
    expect(seen).toEqual(['off, aborted']);
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it('carries on when a step rejects with an abort error', async () => {
    const finish = vi.fn<() => void>();
    const stages: Stage[] = [];
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const opening = createOpening(
      [
        { stage: 'off', atMs: 0, enter: () => Promise.reject(abortError()) },
        { stage: 'cable', atMs: 500, enter: () => undefined },
        { stage: 'on', atMs: 4400, enter: () => Promise.reject(abortError()) },
      ],
      { onStage: (stage) => stages.push(stage), finish },
    );

    expect(() => opening.start()).not.toThrow();
    await vi.advanceTimersByTimeAsync(4400);
    expect(stages).toEqual(['off', 'cable', 'on', 'done']);
    expect(finish).toHaveBeenCalledTimes(1);
    // An abort is an ordinary way for a step to end, so it is not reported.
    expect(errors).not.toHaveBeenCalled();
  });

  it('carries on, and reports it, when a step fails for another reason', async () => {
    const finish = vi.fn<() => void>();
    const stages: Stage[] = [];
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rejected = new Error('clip missing');
    const thrown = new Error('element missing');
    const opening = createOpening(
      [
        { stage: 'off', atMs: 0, enter: () => Promise.reject(rejected) },
        {
          stage: 'cable',
          atMs: 500,
          enter: () => {
            throw thrown;
          },
        },
        { stage: 'on', atMs: 4400, enter: () => Promise.reject(rejected) },
      ],
      { onStage: (stage) => stages.push(stage), finish },
    );

    expect(() => opening.start()).not.toThrow();
    await vi.advanceTimersByTimeAsync(4400);
    expect(stages).toEqual(['off', 'cable', 'on', 'done']);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls.map(([error]) => error)).toEqual([rejected, thrown, rejected]);
  });

  it('waits for the step that is entered last, whatever order the steps are given in', async () => {
    const finish = vi.fn<() => void>();
    const stages: Stage[] = [];
    const opening = createOpening(
      [
        { stage: 'on', atMs: 4400, enter: () => undefined },
        { stage: 'off', atMs: 0, enter: () => undefined },
        { stage: 'cable', atMs: 500, enter: () => undefined },
      ],
      { onStage: (stage) => stages.push(stage), finish },
    );
    opening.start();
    await vi.advanceTimersByTimeAsync(4399);
    expect(finish).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(stages).toEqual(['off', 'cable', 'on', 'done']);
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it('finishes straight away when there are no steps', async () => {
    const finish = vi.fn<() => void>();
    const onStage = vi.fn<(stage: Stage) => void>();
    const opening = createOpening([], { onStage, finish });
    opening.start();
    await opening.finished;
    expect(finish).toHaveBeenCalledTimes(1);
    expect(onStage.mock.calls).toEqual([['done']]);
  });

  it('starts only once', async () => {
    const { opening, entered, finish } = setup();
    opening.start();
    opening.start();
    await vi.advanceTimersByTimeAsync(600);
    opening.start();
    await vi.advanceTimersByTimeAsync(10000);
    expect(entered.map((entry) => entry.stage)).toEqual(['off', 'cable', 'plugged', 'on']);
    expect(finish).toHaveBeenCalledTimes(1);
  });

  describe("when the page's own callbacks throw", () => {
    const broken = new Error('the page could not be finished');

    it('still resolves finished, and reports it, when finish throws at the natural end', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const finish = vi.fn<() => void>(() => {
        throw broken;
      });
      const opening = createOpening([{ stage: 'cable', atMs: 500, enter: () => undefined }], {
        onStage: () => undefined,
        finish,
      });
      let resolved = false;
      void opening.finished.then(() => {
        resolved = true;
      });

      opening.start();
      // An unhandled rejection here would fail the run.
      await vi.advanceTimersByTimeAsync(500);
      expect(finish).toHaveBeenCalledTimes(1);
      expect(resolved).toBe(true);
      expect(opening.stage()).toBe('done');
      expect(errors.mock.calls.map(([error]) => error)).toEqual([broken]);
    });

    it('reports it even when finish had already aborted the signal', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const opening = createOpening([{ stage: 'cable', atMs: 500, enter: () => undefined }], {
        onStage: () => undefined,
        finish: () => {
          opening.skip();
          throw broken;
        },
      });
      opening.start();
      await vi.advanceTimersByTimeAsync(500);
      await expect(opening.finished).resolves.toBeUndefined();
      expect(errors.mock.calls.map(([error]) => error)).toEqual([broken]);
    });

    it('still resolves finished when finish throws on a skip, and the skipper hears of it', async () => {
      const finish = vi.fn<() => void>(() => {
        throw broken;
      });
      const skipped = createOpening([{ stage: 'cable', atMs: 500, enter: () => undefined }], {
        onStage: () => undefined,
        finish,
      });
      skipped.start();
      expect(() => skipped.skip()).toThrow(broken);
      await expect(skipped.finished).resolves.toBeUndefined();
      expect(skipped.stage()).toBe('done');
      // A second skip finds the opening over and does nothing.
      expect(() => skipped.skip()).not.toThrow();
      expect(finish).toHaveBeenCalledTimes(1);
    });

    it('still calls finish and resolves finished when reporting done throws', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const finish = vi.fn<() => void>();
      const opening = createOpening([{ stage: 'cable', atMs: 500, enter: () => undefined }], {
        onStage: (stage) => {
          if (stage === 'done') throw broken;
        },
        finish,
      });
      opening.start();
      await vi.advanceTimersByTimeAsync(500);
      await expect(opening.finished).resolves.toBeUndefined();
      expect(finish).toHaveBeenCalledTimes(1);
      expect(errors.mock.calls.map(([error]) => error)).toEqual([broken]);
    });

    it('still enters the step and finishes when reporting a stage throws', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const finish = vi.fn<() => void>();
      const entered: Stage[] = [];
      const step = (stage: Stage, atMs: number): OpeningStep => ({
        stage,
        atMs,
        enter: () => {
          entered.push(stage);
        },
      });
      const opening = createOpening([step('off', 0), step('cable', 500), step('on', 4400)], {
        onStage: (stage) => {
          if (stage === 'off' || stage === 'on') throw broken;
        },
        finish,
      });

      expect(() => opening.start()).not.toThrow();
      await vi.advanceTimersByTimeAsync(4400);
      expect(entered).toEqual(['off', 'cable', 'on']);
      expect(finish).toHaveBeenCalledTimes(1);
      await expect(opening.finished).resolves.toBeUndefined();
      expect(errors.mock.calls.map(([error]) => error)).toEqual([broken, broken]);
    });
  });
});
