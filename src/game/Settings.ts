export type Binding = { key: string; gamepad?: number };

export const Settings = {
  bindings: {
    up:        { key: 'KeyW' },
    down:      { key: 'KeyS' },
    left:      { key: 'KeyA' },
    right:     { key: 'KeyD' },
    attack:    { key: 'Space' },
    use:       { key: 'KeyE' },
    sprint:    { key: 'ShiftLeft' },
    inventory: { key: 'Tab' },
  } as Record<string, Binding>,

  musicVolume: 0.5,
  sfxVolume: 1.0,
};
