export class Mth {
  static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  static lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  static angleToFacing(ax: number, ay: number): number {
    const angle = Math.atan2(ay, ax);
    const deg = ((angle * 180) / Math.PI + 360) % 360;
    if (deg >= 315 || deg < 45) return 1;
    if (deg < 135) return 2;
    if (deg < 225) return 3;
    return 0;
  }

  static aimToFacing8(ax: number, ay: number): number {
    return Math.trunc((Math.atan2(-ax, ay) * 8) / (Math.PI * 2) + 8.5) & 7;
  }

  static facingToVector(facing: number): { x: number; y: number } {
    switch (facing) {
      case 0: return { x: 0, y: -1 };
      case 1: return { x: 1, y: 0 };
      case 2: return { x: 0, y: 1 };
      case 3: return { x: -1, y: 0 };
      default: return { x: 0, y: 0 };
    }
  }
}
