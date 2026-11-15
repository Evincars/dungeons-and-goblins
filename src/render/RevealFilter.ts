import { Filter, GlProgram, GpuProgram, UniformGroup } from 'pixi.js';

/**
 * Clears soft ellipses in whatever it is set on (a batch of walls, a column, a rock), so the figures standing behind
 * it show through (render/SeeThrough.ts): inside each ellipse the art fades towards SEE_THROUGH_ALPHA, smoothly from
 * its rim inwards, as far as that ellipse's strength (which eases in and out over a few frames).
 */

/** At most this many figures clear one thing at once (more are rare; the strongest are kept). */
export const MAX_REVEALS = 4;
/** How solid the middle of a cleared ellipse stays. */
const SEE_THROUGH_ALPHA = 0.22;
/** How far out from the middle (a share of the ellipse's radius) the clearing starts to fade back to solid. */
const SOFT_FROM = 0.45;

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vGlobal;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

void main(void)
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    vGlobal = position;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;

const fragment = `
in vec2 vTextureCoord;
in vec2 vGlobal;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uShapes[${MAX_REVEALS}];
uniform vec4 uStrength;

void main(void)
{
    vec4 color = texture(uTexture, vTextureCoord);
    float keep = 1.0;
    for (int i = 0; i < ${MAX_REVEALS}; i++) {
        vec4 shape = uShapes[i];
        float d = length((vGlobal - shape.xy) / shape.zw);
        float inside = 1.0 - smoothstep(${SOFT_FROM.toFixed(2)}, 1.0, d);
        keep = min(keep, 1.0 - inside * uStrength[i] * ${(1 - SEE_THROUGH_ALPHA).toFixed(2)});
    }
    finalColor = color * keep;
}
`;

const wgsl = `
struct GlobalFilterUniforms {
  uInputSize: vec4<f32>,
  uInputPixel: vec4<f32>,
  uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>,
  uGlobalFrame: vec4<f32>,
  uOutputTexture: vec4<f32>,
};

struct RevealUniforms {
  uShapes: array<vec4<f32>, ${MAX_REVEALS}>,
  uStrength: vec4<f32>,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> reveal: RevealUniforms;

struct VSOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) screenPos: vec2<f32>,
};

@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {
  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  let screenPos = position;
  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  return VSOutput(vec4(position, 0.0, 1.0), aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw), screenPos);
}

@fragment
fn mainFragment(@location(0) uv: vec2<f32>, @location(1) screenPos: vec2<f32>) -> @location(0) vec4<f32> {
  let color = textureSample(uTexture, uSampler, uv);
  var keep = 1.0;
  for (var i = 0; i < ${MAX_REVEALS}; i++) {
    let shape = reveal.uShapes[i];
    let d = length((screenPos - shape.xy) / shape.zw);
    let inside = 1.0 - smoothstep(${SOFT_FROM.toFixed(2)}, 1.0, d);
    keep = min(keep, 1.0 - inside * reveal.uStrength[i] * ${(1 - SEE_THROUGH_ALPHA).toFixed(2)});
  }
  return color * keep;
}
`;

/** Values of an unused slot: a tiny ellipse far off, at no strength. */
const UNUSED_RADIUS = 1;

export class RevealFilter extends Filter {
  private readonly shapes: Float32Array;
  private readonly strength: Float32Array;
  private readonly group: UniformGroup;

  constructor() {
    const group = new UniformGroup({
      uShapes: { value: new Float32Array(MAX_REVEALS * 4), type: 'vec4<f32>', size: MAX_REVEALS },
      uStrength: { value: new Float32Array(4), type: 'vec4<f32>' },
    });
    super({
      glProgram: GlProgram.from({ vertex, fragment, name: 'reveal-filter' }),
      gpuProgram: GpuProgram.from({
        vertex: { source: wgsl, entryPoint: 'mainVertex' },
        fragment: { source: wgsl, entryPoint: 'mainFragment' },
      }),
      resources: { reveal: group },
    });
    this.group = group;
    this.shapes = group.uniforms.uShapes;
    this.strength = group.uniforms.uStrength;
  }

  /** Clears every slot, before this frame's ellipses are set. */
  reset(): void {
    for (let i = 0; i < MAX_REVEALS; i++) this.set(i, 0, 0, UNUSED_RADIUS, UNUSED_RADIUS, 0);
  }

  /** Slot i: an ellipse centred at (x, y) on screen, radii rx and ry, cleared as far as `strength` (0–1). */
  set(i: number, x: number, y: number, rx: number, ry: number, strength: number): void {
    this.shapes[i * 4] = x;
    this.shapes[i * 4 + 1] = y;
    this.shapes[i * 4 + 2] = rx;
    this.shapes[i * 4 + 3] = ry;
    this.strength[i] = strength;
  }

  /** Sends the slots to the GPU. */
  commit(): void {
    this.group.update();
  }
}
