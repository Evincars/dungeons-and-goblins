export type Binding = { key: string; gamepad?: number };

export const ACTIONS = ['up', 'down', 'left', 'right', 'attack', 'cast', 'use', 'sprint', 'inventory'] as const;
export type ActionName = (typeof ACTIONS)[number];

export const Settings = {
  bindings: {
    up:        { key: 'KeyW' },
    down:      { key: 'KeyS' },
    left:      { key: 'KeyA' },
    right:     { key: 'KeyD' },
    attack:    { key: 'Space' },
    cast:      { key: 'KeyQ' },
    use:       { key: 'KeyE' },
    sprint:    { key: 'ShiftLeft' },
    inventory: { key: 'Tab' },
  } satisfies Record<ActionName, Binding>,

  musicVolume: 0.5,
  sfxVolume: 1.0,
};
