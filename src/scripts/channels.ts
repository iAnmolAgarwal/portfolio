// Which channel is showing, and when the set changes channel by itself.
// It knows nothing about the page: every change is reported through `onTune`.

export interface ChannelController {
  /** Begin switching by itself, with a fresh `autoMs` wait. Does not tune. */
  start(): void;
  /** Cancel the pending automatic change. The current channel is kept. */
  stop(): void;
  current(): number;
  tune(index: number, manual: boolean): void;
  next(manual: boolean): void;
}

export function createChannels(opts: {
  count: number;
  autoMs: number;
  afterManualMs: number;
  auto: boolean;
  onTune(index: number, manual: boolean): void;
}): ChannelController {
  const { count, autoMs, afterManualMs, auto, onTune } = opts;
  let index = 0;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function cancel(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  // There is only ever one pending change: scheduling always replaces it.
  function schedule(waitMs: number): void {
    cancel();
    if (!auto || !running) return;
    timer = setTimeout(() => {
      timer = undefined;
      tune(index + 1, false);
    }, waitMs);
  }

  function tune(target: number, manual: boolean): void {
    // Wrap, so that one past the last channel is the first.
    index = ((target % count) + count) % count;
    // Schedule before reporting, so a handler that throws cannot stop the set.
    schedule(manual ? afterManualMs : autoMs);
    onTune(index, manual);
  }

  return {
    start() {
      running = true;
      schedule(autoMs);
    },
    stop() {
      running = false;
      cancel();
    },
    current: () => index,
    tune,
    next(manual) {
      tune(index + 1, manual);
    },
  };
}
