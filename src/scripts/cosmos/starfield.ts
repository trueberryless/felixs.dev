import { type Bodies, POINTER_REACH } from "./bodies";
import { createProgram, watchContext } from "./gl";
import { BRIGHT_NEARNESS, STAR_COLORS, type Star } from "./stars";

// Every star is a point sprite, so the whole field is a single draw call and
// costs the main thread almost nothing per frame. The vertex shader mirrors
// `projectStar` in `stars.ts`.
const FLOATS_PER_STAR = 10;

const VERTEX_SHADER = `
attribute vec4 aStar;    // x, y (0 to 1), depth, nearness
attribute vec4 aColor;   // rgb (0 to 1), twinkle phase
attribute vec2 aTwinkle; // twinkle speed, has spikes

uniform vec2 uViewport;
uniform float uPixelRatio;
uniform float uMaxPointSize;
uniform float uTime;
uniform float uAnimate;
uniform float uScroll;
uniform vec2 uView;
uniform float uReach;
uniform float uWarp;
// Centre and radius in CSS pixels.
uniform vec3 uPlanet;
uniform vec3 uMoon;

varying vec3 vColor;
varying float vAlpha;
varying float vIsBright;
varying float vHalo;
varying float vSize;
varying float vHasSpikes;

void main() {
  float depth = aStar.z;
  float nearness = aStar.w;
  vec2 position = vec2(
    aStar.x * uViewport.x - uView.x * depth * uReach,
    mod(aStar.y * uViewport.y - uScroll * depth - uView.y * depth * uReach, uViewport.y)
  );
  float travel = 0.25 + 0.75 * (1.0 - uWarp);
  position = uViewport * 0.5 + (position - uViewport * 0.5) * travel;

  bool isHidden = uWarp == 0.0 && (
    distance(position, uPlanet.xy) < uPlanet.z ||
    distance(position, uMoon.xy) < uMoon.z
  );
  float twinkle = mix(0.85, 0.6 + 0.4 * sin(uTime * aTwinkle.x + aColor.a), uAnimate);
  vAlpha = min(1.0, (0.35 + nearness * 0.6) * twinkle + uWarp * 0.6);
  vColor = aColor.rgb;
  vIsBright = step(${BRIGHT_NEARNESS.toFixed(2)}, nearness);
  vHasSpikes = aTwinkle.y;

  float radius = 0.35 + nearness * mix(0.8, 1.9, vIsBright);
  // Bright stars get a glow seven radii wide; spikes need room for 18.
  float span = vIsBright > 0.5 ? (vHasSpikes > 0.5 ? 18.0 : 7.0) : 2.0;
  vHalo = vIsBright > 0.5 ? 7.0 / span : 1.0;
  vSize = radius * span + 1.0;
  gl_PointSize = min(vSize * uPixelRatio, uMaxPointSize);

  vec2 clip = position / uViewport * 2.0 - 1.0;
  gl_Position = isHidden ? vec4(2.0, 2.0, 0.0, 1.0) : vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;

varying vec3 vColor;
varying float vAlpha;
varying float vIsBright;
varying float vHalo;
varying float vSize;
varying float vHasSpikes;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = length(p);
  float alpha;
  if (vIsBright > 0.5) {
    float r = d / vHalo;
    float glow = r < 0.12
      ? mix(1.0, 0.85, r / 0.12)
      : r < 0.3 ? mix(0.85, 0.25, (r - 0.12) / 0.18) : mix(0.25, 0.0, (r - 0.3) / 0.7);
    glow *= step(r, 1.0);
    float thickness = 0.7 / vSize;
    float spikes = vHasSpikes * 0.35 * (
      (1.0 - smoothstep(0.0, thickness, abs(p.y))) * (1.0 - abs(p.x)) +
      (1.0 - smoothstep(0.0, thickness, abs(p.x))) * (1.0 - abs(p.y))
    );
    alpha = max(glow, spikes);
  } else {
    alpha = 1.0 - smoothstep(0.55, 1.0, d);
  }
  alpha *= vAlpha;
  gl_FragColor = vec4(vColor * alpha, alpha);
}
`;

export function createStarfield(
  canvas: HTMLCanvasElement
): Starfield | undefined {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: false,
    depth: false,
    powerPreference: "low-power",
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    stencil: false,
  });
  if (!gl) return undefined;

  let state = createState(gl);
  if (!state) return undefined;
  let stars: Star[] = [];
  let width = 1;
  let height = 1;
  let pixelRatio = 1;

  watchContext(canvas, {
    onLost: () => (state = undefined),
    onRestored: () => {
      state = createState(gl);
      upload();
    },
  });

  function upload() {
    if (!state) return;
    const data = new Float32Array(stars.length * FLOATS_PER_STAR);
    for (const [index, star] of stars.entries()) {
      const [r, g, b] = STAR_COLORS[star.color] ?? STAR_COLORS[0];
      data.set(
        [
          star.x,
          star.y,
          star.depth,
          star.nearness,
          r / 255,
          g / 255,
          b / 255,
          star.phase,
          star.twinkleSpeed,
          star.hasSpikes ? 1 : 0,
        ],
        index * FLOATS_PER_STAR
      );
    }
    gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW);
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.uniform2f(state.uniforms.viewport, width, height);
    gl!.uniform1f(state.uniforms.pixelRatio, pixelRatio);
  }

  function resize(
    nextWidth: number,
    nextHeight: number,
    nextPixelRatio: number,
    nextStars: Star[]
  ) {
    width = nextWidth;
    height = nextHeight;
    pixelRatio = nextPixelRatio;
    stars = nextStars;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    upload();
  }

  function draw({ animate, bodies, scroll, time, view, warp }: StarfieldFrame) {
    if (!state) return;
    const { uniforms } = state;
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.uniform1f(uniforms.time, time);
    gl!.uniform1f(uniforms.animate, animate ? 1 : 0);
    gl!.uniform1f(uniforms.scroll, scroll);
    gl!.uniform2f(uniforms.view, view.x, view.y);
    gl!.uniform1f(uniforms.warp, warp);
    gl!.uniform3f(
      uniforms.planet,
      bodies.planet.x,
      bodies.planet.y,
      bodies.planet.radius
    );
    gl!.uniform3f(
      uniforms.moon,
      bodies.moon.x,
      bodies.moon.y,
      bodies.moon.radius
    );
    gl!.drawArrays(gl!.POINTS, 0, stars.length);
  }

  function destroy() {
    gl!.getExtension("WEBGL_lose_context")?.loseContext();
  }

  return { destroy, draw, resize };
}

function createState(gl: WebGLRenderingContext) {
  const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  if (!program) return undefined;

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  const stride = FLOATS_PER_STAR * 4;
  for (const [name, size, offset] of [
    ["aStar", 4, 0],
    ["aColor", 4, 16],
    ["aTwinkle", 2, 32],
  ] as const) {
    const location = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
  }
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const pointSizeRange = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as
    Float32Array | undefined;
  gl.uniform1f(uniform("uMaxPointSize"), pointSizeRange?.[1] ?? 64);
  gl.uniform1f(uniform("uReach"), POINTER_REACH);

  return {
    uniforms: {
      animate: uniform("uAnimate"),
      moon: uniform("uMoon"),
      pixelRatio: uniform("uPixelRatio"),
      planet: uniform("uPlanet"),
      scroll: uniform("uScroll"),
      time: uniform("uTime"),
      view: uniform("uView"),
      viewport: uniform("uViewport"),
      warp: uniform("uWarp"),
    },
  };
}

export interface Starfield {
  destroy: () => void;
  draw: (frame: StarfieldFrame) => void;
  resize: (
    width: number,
    height: number,
    pixelRatio: number,
    stars: Star[]
  ) => void;
}

interface StarfieldFrame {
  animate: boolean;
  bodies: Bodies;
  scroll: number;
  time: number;
  view: { x: number; y: number };
  warp: number;
}
