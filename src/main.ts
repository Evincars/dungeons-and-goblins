import { Game } from './game/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const game = new Game();
game.init(canvas).catch(console.error);
