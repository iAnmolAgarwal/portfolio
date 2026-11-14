// The opening's timeline: which step is entered when, and how it ends. It knows
// nothing about the page. The steps do the drawing, `onStage` records where the
// opening has got to, and `finish` puts the page in its end state.

export type Stage = 'off' | 'cable' | 'plugged' | 'on' | 'mascot' | 'lit' | 'done';

export interface OpeningStep {
  stage: Stage;
  /** When the step is entered, in milliseconds after `start()`. */
  atMs: number;
  /** Starts the step. The signal aborts if the opening is skipped. */
  enter(signal: AbortSignal): void | Promise<void>;
}

export interface Opening {
  start(): void;
  /** Aborts the signal, drops the steps still to come, and finishes. */
  skip(): void;
  stage(): Stage;
  /** Resolves after `finish()` has been called. It never rejects. */
  finished: Promise<void>;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  );
}

export function createOpening(
  steps: OpeningStep[],
  opts: { onStage(stage: Stage): void; finish(): void },
): Opening {
  const controller = new AbortController();
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  let stage: Stage = 'off';
  let started = false;
  let done = false;
  let stepsToEnter = steps.length;
  let resolveFinished: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  // The one way the opening ends, whether it ran to the end or was skipped. If
  // reporting `done` throws, `finish` still runs, and if `finish` throws,
  // `finished` still resolves: whoever waits on the opening is never left waiting.
  function end(): void {
    if (done) return;
    done = true;
    for (const timer of timers) clearTimeout(timer);
    timers.length = 0;
    try {
      if (stage !== 'done') {
        stage = 'done';
        opts.onStage('done');
      }
    } finally {
      try {
        opts.finish();
      } finally {
        resolveFinished();
      }
    }
  }

  // A step that fails must not stop the opening. An abort is an ordinary way for
  // a step to end; anything else is worth seeing in the console.
  function report(error: unknown): void {
    if (controller.signal.aborted || isAbortError(error)) return;
    console.error(error);
  }

  // The page's own callbacks failing is always worth seeing, skipped or not.
  function reportCallback(error: unknown): void {
    console.error(error);
  }

  function enter(step: OpeningStep): void {
    if (done) return;
    stepsToEnter -= 1;
    const isLast = stepsToEnter === 0;
    stage = step.stage;
    // A stage that could not be reported must not cost the opening its step.
    try {
      opts.onStage(step.stage);
    } catch (error) {
      reportCallback(error);
    }
    if (done) return;

    let result: void | Promise<void> = undefined;
    try {
      result = step.enter(controller.signal);
    } catch (error) {
      report(error);
    }
    const settled = Promise.resolve(result).catch(report);
    // Ending here has no caller to throw to, so what `end` throws is reported.
    if (isLast) void settled.then(end).catch(reportCallback);
  }

  return {
    start() {
      if (started || done) return;
      started = true;
      if (steps.length === 0) {
        end();
        return;
      }
      // Set every timer before entering anything, so that a step which skips the
      // opening finds them all there to cancel.
      for (const step of steps) {
        if (step.atMs > 0) timers.push(setTimeout(() => enter(step), step.atMs));
      }
      for (const step of steps) {
        if (step.atMs <= 0) enter(step);
      }
    },
    skip() {
      controller.abort();
      end();
    },
    stage: () => stage,
    finished,
  };
}
