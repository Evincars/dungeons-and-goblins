import type { CharacterDef, ClipDef } from './CharacterDef';

const DIR = '/other-orcs';

/** Each sheet is 64×64 frames in four rows (down, up, left, right); only the side rows are played. */
const FRAME = 64;
const LEFT_ROW = 2;
const RIGHT_ROW = 3;
/** The feet stand on the drop shadow drawn into every frame. */
const FEET_Y = 43;

/** The two moving swings are named differently in the first goblin's files. */
type SwingFiles = { walkAttack: string; runAttack: string };

/**
 * A goblin from /other-orcs: all three share the frame layout and clip timing, and differ in their art,
 * their size and how tall their head (or hair) reaches. Swings last about as long standing, walking or
 * running, so a blow lands with the animation whichever one plays.
 */
function goblin(id: string, file: string, headY: number, scale: number, swings: SwingFiles): CharacterDef {
  const clip = (name: string, frameTime: number, mode: ClipDef['mode'], impactFrame?: number): ClipDef =>
    ({ src: `${DIR}/${file}_${name}.png`, frameTime, mode, impactFrame });
  return {
    id,
    frameWidth: FRAME,
    frameHeight: FRAME,
    scale,
    feetY: FEET_Y,
    headY,
    facingRows: { left: LEFT_ROW, right: RIGHT_ROW },
    clips: {
      idle:       clip('idle_full', 10, 'loop'),
      walk:       clip('walk_full', 7, 'loop'),
      run:        clip('run_full', 5, 'loop'),
      attack:     clip('attack_full', 4, 'once', 3),
      walkAttack: clip(swings.walkAttack, 5, 'once', 2),
      runAttack:  clip(swings.runAttack, 4, 'once', 3),
      hurt:       clip('hurt_full', 4, 'once'),
      death:      clip('death_full', 6, 'hold'),
    },
    states: {
      idle: 'idle',
      walk: 'walk',
      run: 'run',
      attack: 'attack',
      walkAttack: 'walkAttack',
      runAttack: 'runAttack',
      hurt: 'hurt',
      death: 'death',
    },
  };
}

/** orc1: the small green grunt with a club. */
export const GOBLIN_GRUNT = goblin('goblin_grunt', 'orc1', 14, 1, {
  walkAttack: 'walk_attack_front _full', runAttack: 'run_attack_front_full',
});

/** orc2: the hooded blue-skinned rogue with a knife. */
export const GOBLIN_ROGUE = goblin('goblin_rogue', 'orc2', 12, 1, {
  walkAttack: 'walk_attack_full', runAttack: 'run_attack_full',
});

/** orc3: the caped warrior with a curved blade, a head taller than the others. */
export const GOBLIN_WARRIOR = goblin('goblin_warrior', 'orc3', 9, 1.15, {
  walkAttack: 'walk_attack_full', runAttack: 'run_attack_full',
});
