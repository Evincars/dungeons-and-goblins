/**
 * The dungeon layout as a bitmap.
 *
 * Legend:
 *   W = solid wall
 *   . = floor
 *   P = player spawn
 *   G = goblin nest
 *   S = skeleton nest
 *   O = orc nest
 *   K = troll/boss nest
 *   t = torch
 *   B = breakable wall
 *   H = pit/hole
 *   C = chest
 *   i = item pickup
 */

export type MapCell =
  | 'W' | '.' | 'P' | 'G' | 'S' | 'O' | 'K'
  | 't' | 'B' | 'H' | 'C' | 'i';

/** 30 columns × 25 rows */
export const DUNGEON_MAP: readonly string[] = [
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  'W.....t....WWWWWWWWWW.........W',
  'W..P.......W........W....G....W',
  'W..........W..t.....W.........W',
  'W.t........WBWWWWWWWBW........W',
  'WWWWWWWWWWWW........WWWWBWWWWWW',
  'W..........W........W.........W',
  'W...G......W....S...W....t....W',
  'W..........WWWWWWWWWW.........W',
  'W..t.......W.........H........W',
  'WWWWWWWWWWWW.........WWWWWWWWWW',
  'W.G........W..........W.......W',
  'W..........W....K.....W.......W',
  'W....t.....W..........W..O....W',
  'WWWBWWWWWWWWWWWWBWWWWWWWWWWWWWW',
  'W..........W..........W.......W',
  'W..t.......W....G.....W..t....W',
  'W..........W..........W.......W',
  'WWWWWWWWWWWBWWWWWWWWWWBWWWWWWWW',
  'W..........W..........W.......W',
  'W...C......W...t......W.......W',
  'W..........W.....i....W..S....W',
  'W..t.......W..........W.......W',
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
];

export const MAP_W = 31;
export const MAP_H = 25;
