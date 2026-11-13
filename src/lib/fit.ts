// What the scene gives up on a short screen:
// 0 everything shown; 1 no small drawings; 2 no cable or notes, plug only;
// 3 also no project line.
export type Give = 0 | 1 | 2 | 3;

/**
 * The lowest level whose needed height fits the available height. `needed`
 * holds the height the scene takes at each level, 0 to 3. When nothing fits
 * the answer is 3, the most the scene can give up.
 */
export function giveLevel(
  needed: readonly [number, number, number, number],
  available: number,
): Give {
  if (needed[0] <= available) return 0;
  if (needed[1] <= available) return 1;
  if (needed[2] <= available) return 2;
  return 3;
}
