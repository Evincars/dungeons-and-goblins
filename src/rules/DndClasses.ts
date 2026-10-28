/** The D&D classes the heroes belong to (a leaf module: rules that read class data at load time depend on it, not on the whole of Classes.ts). */
export const DND_CLASSES = ['fighter', 'wizard', 'rogue', 'warlock', 'bard', 'cleric'] as const;
export type DndClass = (typeof DND_CLASSES)[number];
