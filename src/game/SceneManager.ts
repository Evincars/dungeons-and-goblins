import type { Application, Container } from 'pixi.js';
import { StateError } from '../core/errors';

export type SceneName = 'title' | 'settings' | 'key_bindings' | 'character_select' | 'intro' | 'coop_host' | 'coop_join' | 'in_game';

export type SceneFactory = (manager: SceneManager) => Scene;

export interface Scene {
  container: Container;
  destroy(): void;
  /** One fixed simulation tick (60 per second), for scenes that animate or play. */
  update?(): void;
  /** Lets a scene consume Escape for itself (cancelling a prompt); true when it did. */
  handleEscape?(): boolean;
}

/**
 * Which screen is showing (the State pattern, as in Catacomb Snatch Redux). Sub-screens such as the
 * settings can be stacked over the current scene as overlays, so the pause menu stays beneath them.
 */
export class SceneManager {
  private factories = new Map<SceneName, SceneFactory>();
  private current: Scene | null = null;
  private currentName: SceneName | null = null;
  /** Scenes stacked above the current one, such as settings opened from the pause menu. */
  private overlays: Scene[] = [];

  constructor(private readonly app: Application, readonly canvas: HTMLCanvasElement) {}

  private factoryOf(name: SceneName): SceneFactory {
    const factory = this.factories.get(name);
    if (!factory) throw new StateError(`Scene not registered: ${name}`, { name });
    return factory;
  }

  register(name: SceneName, factory: SceneFactory): this {
    this.factories.set(name, factory);
    return this;
  }

  goto(name: SceneName): void {
    // Build the next scene first: if its constructor throws, the current one
    // stays on screen instead of leaving the stage blank.
    const next = this.factoryOf(name)(this);
    while (this.hasOverlay) this.popOverlay();
    if (this.current) {
      this.app.stage.removeChild(this.current.container);
      this.current.destroy();
    }
    this.current = next;
    this.currentName = name;
    this.app.stage.addChild(next.container);
  }

  /** Shows a scene on top of the current one without tearing the current one down. */
  pushOverlay(name: SceneName): void {
    const scene = this.factoryOf(name)(this);
    this.overlays.push(scene);
    this.app.stage.addChild(scene.container);
  }

  popOverlay(): void {
    const scene = this.overlays.pop();
    if (!scene) return;
    this.app.stage.removeChild(scene.container);
    scene.destroy();
  }

  /** Escape on a stacked sub-screen: closes it unless it has something of its own to cancel. */
  escapeOverlay(): void {
    const top = this.overlays[this.overlays.length - 1];
    if (!top || top.handleEscape?.()) return;
    this.popOverlay();
  }

  get hasOverlay(): boolean {
    return this.overlays.length > 0;
  }

  /** Opens a sub-screen: stacked on top while an overlay is open, otherwise a normal scene change. */
  open(name: SceneName): void {
    if (this.hasOverlay) this.pushOverlay(name);
    else this.goto(name);
  }

  /** Leaves a sub-screen, returning to what is underneath or to `fallback` outside an overlay. */
  back(fallback: SceneName): void {
    if (this.hasOverlay) this.popOverlay();
    else this.goto(fallback);
  }

  /** One fixed tick of the current scene (overlays are menus and keep still). */
  update(): void {
    this.current?.update?.();
  }

  get currentScene(): SceneName | null {
    return this.currentName;
  }

  get application(): Application {
    return this.app;
  }
}
