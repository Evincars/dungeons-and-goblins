/** One trip into the dungeon: how deep the party has gone. A new run starts from the title screen. */
export const run = { depth: 1 };

export function startRun(): void {
  run.depth = 1;
}

/** The exit was taken: the next level lies one deeper. */
export function descend(): void {
  run.depth++;
}
