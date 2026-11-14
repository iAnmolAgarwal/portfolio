// Where the mascot's torch points to light the rail, worked out from where the
// torch and the rail are. Kept apart from the scene itself (`mascot.ts`), which
// only plays what this works out.

/** Which way the light goes: `down` a rail beside the set, or `up` to a strip above it. */
export type BeamTarget = 'down' | 'up';

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Sweep {
  /** The torch's turn when the sweep starts, in degrees, as CSS `rotate` takes it. */
  from: number;
  /** Its turn when the sweep ends. */
  to: number;
  /**
   * Turns at evenly spaced moments of the sweep, from `from` to `to`, when the
   * light must cross the rail evenly rather than turn evenly.
   */
  steps?: number[];
  /** How long the beam has to be to reach the rail's farthest corner. */
  length: number;
}

/** The beam's narrow end, as a share of its wide end. Matches its clip-path. */
export const BEAM_MOUTH = 0.02;

/**
 * Where on a rail down the side the light starts and ends, as shares of the
 * rail's length. It starts with its leading edge at the first share, on the
 * rail's near side, and ends with its trailing edge at the second, on the far
 * side. The rail fades in over its first 14% and out over its last. The two
 * shares are set so that at the size the scene was designed at, the torch turns
 * from 4 to 76 degrees below level, as in the approved drawing.
 */
const LIGHT_FROM = 0.14;
const LIGHT_TO = 0.9;

/**
 * How far along the beam the rail's farthest corner falls. The light has all but
 * faded by there. Set so the beam is as long as in the approved drawing.
 */
const BEAM_REACH = 0.88;

/** How many even stretches a strip's sweep is aimed in. */
const STRIP_STEPS = 16;

function degrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Where the torch points to light the rail from one end to the other, and how
 * long its beam must be.
 *
 * `down`: a rail down the side of the set, lit from its near top to its far
 * bottom as the approved scene does. `up`: a strip above the torch, lit along its
 * middle from its left end to its right end, the light crossing it at an even
 * pace so that the strip can be opened in step with it.
 *
 * @param pivot Where the torch turns.
 * @param rail The rail's box.
 * @param target Which way the light goes.
 * @param beam The beam's shape: its half-angle in radians, and the gap between
 *   the pivot and the beam's narrow end.
 */
export function beamSweep(
  pivot: Point,
  rail: Box,
  target: BeamTarget,
  beam: { halfAngle: number; gap: number },
): Sweep {
  const width = rail.right - rail.left;
  const height = rail.bottom - rail.top;

  // How far the torch has turned from pointing straight left to point at a spot:
  // a quarter turn is straight down (or up, negative), a half turn straight right.
  // CSS turns clockwise for a positive angle; the torch turns the other way.
  const turnTo = (spot: Point): number => Math.atan2(spot.y - pivot.y, pivot.x - spot.x);
  const css = (radians: number): number => -degrees(radians);

  const farthest = Math.max(
    ...[rail.left, rail.right].flatMap((x) =>
      [rail.top, rail.bottom].map((y) => Math.hypot(x - pivot.x, y - pivot.y)),
    ),
  );
  const length = Math.max(0, farthest - beam.gap) / BEAM_REACH;

  if (target === 'up') {
    const middle = (rail.top + rail.bottom) / 2;
    // A strip that is not above the torch cannot be lit from below.
    if (middle >= pivot.y) {
      const level = css(turnTo({ x: rail.left, y: pivot.y - 1 }));
      return { from: level, to: level, steps: [level, level], length };
    }
    const steps = Array.from({ length: STRIP_STEPS + 1 }, (_, index) =>
      css(turnTo({ x: rail.left + (width * index) / STRIP_STEPS, y: middle })),
    );
    return { from: steps[0], to: steps[steps.length - 1], steps, length };
  }

  // The light enters at a point on the rail's near side and leaves at one on its far side.
  const enters: Point = { x: rail.right, y: rail.top + LIGHT_FROM * height };
  const leaves: Point = { x: rail.left, y: rail.top + LIGHT_TO * height };
  const first = turnTo(enters) - beam.halfAngle;
  const last = Math.max(first, turnTo(leaves) + beam.halfAngle);
  return { from: css(first), to: css(last), length };
}
