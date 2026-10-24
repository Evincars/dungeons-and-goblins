import { Game } from './game/Game';
import { ensure, errorMessage, installGlobalErrorHandlers, report } from './core/errors';
import { hideLoadingScreen } from './ui/LoadingScreen';

/** An error and every `cause` behind it, innermost last, each with its stack. */
function describe(err: unknown): string {
  const parts: string[] = [];
  for (let e: unknown = err; e !== undefined && parts.length < 5; e = e instanceof Error ? e.cause : undefined) {
    parts.push(e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : errorMessage(e));
  }
  return parts.join('\nCaused by: ');
}

function showFatal(err: unknown): void {
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#f88;font:12px monospace;padding:16px;white-space:pre-wrap';
  pre.textContent = `Dungeons & Goblins failed to start:\n\n${describe(err)}`;
  document.body.appendChild(pre);
}

async function main(): Promise<void> {
  installGlobalErrorHandlers();
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  ensure(canvas, 'The page has no #game canvas');
  await new Game().init(canvas);
}

main().catch((err: unknown) => {
  hideLoadingScreen();
  showFatal(report(err, 'Dungeons & Goblins failed to start', 'boot'));
});
