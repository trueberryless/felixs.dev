import type { Bodies } from "./bodies";
import { createProgram, watchContext } from "./gl";

// A single full-screen fragment shader paints the nebula, the gas giant with
// its atmosphere and the moon. That is all three.js would do here as well, so
// raw WebGL keeps the scene a few kilobytes instead of a ~150 KB dependency.
// Once the sky needs real geometry (rings as meshes, models, post-processing),
// switching to three.js is the better trade.
//
// The soft content renders below native resolution and is scaled up.
const MAX_PIXELS = 600_000;

const VERTEX_SHADER = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uResolution;
uniform float uTime;
uniform float uWarp;
uniform float uDim;
uniform vec2 uNebulaOffset;
// Centre (xy) and radius (z), in units of the viewport height, y up.
uniform vec3 uPlanet;
uniform vec3 uMoon;

// normalize(vec3(-0.45, 0.85, -0.35)): backlit from the upper left.
const vec3 LIGHT = vec3(-0.4397, 0.8305, -0.342);

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rotation = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = rotation * p;
    amplitude *= 0.5;
  }
  return value;
}

// Glow hugging a sphere's limb from both sides.
float limbGlow(float altitude, float outer, float inner) {
  return altitude > 0.0
    ? exp(-altitude * outer) * 0.85 + exp(-altitude * 5.0) * 0.2
    : exp(altitude * inner) * 1.05;
}

vec3 paintNebula(vec2 p, float t) {
  vec3 color = mix(
    vec3(0.012, 0.008, 0.04),
    vec3(0.07, 0.035, 0.15),
    smoothstep(-0.8, 0.9, -p.y * 0.9 + p.x * 0.25)
  );
  vec2 q = p * 1.7 + vec2(t * 0.012, -t * 0.006);
  vec2 warp = vec2(fbm(q), fbm(q + vec2(5.2, 1.3)));
  float density = fbm(q + 2.4 * warp + vec2(t * 0.008, 0.0));
  float band = exp(-pow((p.y + p.x * 0.55 - 0.16) * 2.3, 2.0));
  float nebula = smoothstep(0.32, 0.95, density) * (0.22 + 0.78 * band);
  vec3 tint = mix(vec3(0.3, 0.1, 0.58), vec3(0.78, 0.24, 0.7), smoothstep(0.3, 0.8, warp.x));
  tint = mix(tint, vec3(0.18, 0.42, 0.92), smoothstep(0.55, 0.85, warp.y));
  color += tint * nebula * 0.5;
  color += vec3(0.95, 0.7, 1.0) * pow(nebula, 3.0) * band * 0.3;
  float lanes = smoothstep(0.5, 0.78, fbm(q * 2.6 - warp * 1.5));
  return color * (1.0 - lanes * 0.45 * band);
}

// The gas giant spins about a tilted axis; its bands and a storm drift past.
vec3 paintPlanetSurface(vec3 normal, float t) {
  float tilt = -0.35;
  vec3 n = vec3(
    normal.x * cos(tilt) - normal.y * sin(tilt),
    normal.x * sin(tilt) + normal.y * cos(tilt),
    normal.z
  );
  float longitude = atan(n.x, n.z) + t * 0.05;
  vec2 uv = vec2(longitude, n.y);
  float turbulence = fbm(uv * vec2(2.0, 6.0)) * 0.35;
  float bands = fbm(vec2(n.y * 9.0 + turbulence * 3.0, longitude * 0.6));
  vec3 surface = mix(vec3(0.07, 0.04, 0.18), vec3(0.32, 0.17, 0.58), bands);
  float streaks = smoothstep(0.55, 0.8, fbm(vec2(n.y * 22.0 + turbulence * 4.0, longitude * 1.4)));
  surface = mix(surface, vec3(0.12, 0.3, 0.62), streaks);

  // Wrapping the longitude keeps the storm continuous across the seam, which
  // sits on the far side of the planet.
  float dLongitude = mod(longitude - 1.2 + 3.14159, 6.28318) - 3.14159;
  vec2 storm = vec2(dLongitude * 0.9, n.y - 0.62) / vec2(0.22, 0.07);
  float stormMask = smoothstep(1.0, 0.2, length(storm));
  float swirl = fbm(storm * 1.5 + vec2(atan(storm.y, storm.x) * 0.8 - t * 0.4, 0.0));
  return mix(surface, vec3(0.62, 0.42, 0.92) * (0.6 + swirl), stormMask * 0.85);
}

void main() {
  vec2 frag = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (frag - 0.5) * vec2(aspect, 1.0);
  float t = uTime;

  // The nebula starts zoomed out while dropping out of warp speed.
  vec3 color = paintNebula(p * (1.0 + uWarp * 0.9) + uNebulaOffset, t);

  vec2 d = p - uPlanet.xy;
  float radius = uPlanet.z;
  float r = length(d);
  float pixel = 2.0 / uResolution.y;
  float inside = smoothstep(radius, radius - pixel, r);
  if (inside > 0.0) {
    vec3 normal = vec3(d, sqrt(max(radius * radius - r * r, 0.0))) / radius;
    float diffuse = max(dot(normal, LIGHT), 0.0);
    vec3 planet = paintPlanetSurface(normal, t) * (0.07 + 0.1 * normal.z + 1.6 * diffuse);
    float fresnel = pow(1.0 - normal.z, 2.5);
    planet += mix(vec3(0.5, 0.3, 1.0), vec3(0.4, 0.8, 1.0), diffuse) * fresnel * (0.2 + 1.1 * diffuse);
    color = mix(color, planet, inside);
  }

  vec2 direction = d / max(r, 1e-4);
  float altitude = (r - radius) / radius;
  float lit = clamp(dot(direction, normalize(LIGHT.xy)) * 0.5 + 0.5, 0.0, 1.0);
  vec3 atmosphere = mix(vec3(0.45, 0.2, 0.85), vec3(0.3, 0.7, 1.0), smoothstep(0.35, 0.9, lit));
  atmosphere = mix(atmosphere, vec3(1.0, 0.5, 0.8), smoothstep(0.78, 1.0, lit) * 0.35);
  // The planet centre sits below the screen, so the angle's seam (straight
  // down) is never visible.
  float angle = atan(direction.x, direction.y);
  float shimmer = 0.88 + 0.12 * noise(vec2(angle * 6.0, t * 0.25));
  color += atmosphere * limbGlow(altitude, 22.0, 70.0) * (0.15 + 0.85 * lit) * shimmer;
  if (altitude > 0.0 && altitude < 0.6) {
    // Cosmic rays and dust streaming away from the atmosphere.
    float flow = altitude * 7.0 - t * 0.12;
    float rays = noise(vec2(angle * 26.0, flow)) * noise(vec2(angle * 9.0 + 4.0, flow * 0.5));
    float dust = smoothstep(0.62, 0.9, fbm(vec2(angle * 40.0, altitude * 18.0 - t * 0.25)));
    float fade = exp(-altitude * 3.0) * lit;
    color += atmosphere * (pow(rays, 1.6) * 0.42 + dust * 0.22) * fade;
  }

  vec2 md = p - uMoon.xy;
  float mr = length(md);
  float moonInside = smoothstep(uMoon.z, uMoon.z - pixel, mr);
  if (moonInside > 0.0) {
    vec3 normal = vec3(md, sqrt(max(uMoon.z * uMoon.z - mr * mr, 0.0))) / uMoon.z;
    float diffuse = max(dot(normal, normalize(vec3(-0.6, 0.5, 0.25))), 0.0);
    float craters = fbm(md / uMoon.z * 3.0);
    vec3 moon = mix(vec3(0.55, 0.5, 0.75), vec3(0.85, 0.82, 0.95), craters) * (0.04 + 1.1 * diffuse);
    color = mix(color, moon, moonInside);
  }
  color += vec3(0.6, 0.55, 1.0) * limbGlow((mr - uMoon.z) / uMoon.z, 2.0, 13.0) * 0.12;

  color += vec3(0.55, 0.45, 1.0) * uWarp * 0.3 * exp(-length(p) * 2.5);
  color *= 1.0 - uDim;
  color *= 1.0 - dot(frag - 0.5, frag - 0.5) * 0.7;
  // Dithering keeps the dark gradients from banding.
  color += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0;

  gl_FragColor = vec4(color, 1.0);
}
`;

export function createNebula(canvas: HTMLCanvasElement): Nebula | undefined {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: "low-power",
    preserveDrawingBuffer: false,
    stencil: false,
  });
  if (!gl) return undefined;

  let state = createState(gl);
  if (!state) return undefined;
  let cssHeight = 1;
  let cssWidth = 1;

  watchContext(canvas, {
    onLost: () => (state = undefined),
    onRestored: () => {
      state = createState(gl);
      applySize();
    },
  });

  function applySize() {
    if (!state) return;
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.uniform2f(state.uniforms.resolution, canvas.width, canvas.height);
  }

  function resize(width: number, height: number, pixelRatio: number) {
    const scale = Math.min(
      pixelRatio,
      Math.sqrt(MAX_PIXELS / Math.max(width * height, 1))
    );
    cssWidth = width;
    cssHeight = height;
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    applySize();
  }

  function draw({ bodies, dim, nebulaOffset, time, warp }: NebulaFrame) {
    if (!state) return;
    const { uniforms } = state;
    gl!.uniform1f(uniforms.time, time);
    gl!.uniform1f(uniforms.warp, warp);
    gl!.uniform1f(uniforms.dim, dim);
    gl!.uniform2f(
      uniforms.nebulaOffset,
      nebulaOffset.x / cssHeight,
      -nebulaOffset.y / cssHeight
    );
    setBody(uniforms.planet, bodies.planet);
    setBody(uniforms.moon, bodies.moon);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  // Converts CSS pixels into the shader's units: viewport heights from the
  // centre of the screen, with y pointing up.
  function setBody(
    location: WebGLUniformLocation | null,
    body: Bodies["planet"]
  ) {
    gl!.uniform3f(
      location,
      (body.x - cssWidth / 2) / cssHeight,
      (cssHeight / 2 - body.y) / cssHeight,
      body.radius / cssHeight
    );
  }

  function destroy() {
    gl!.getExtension("WEBGL_lose_context")?.loseContext();
  }

  return { destroy, draw, resize };
}

function createState(gl: WebGLRenderingContext) {
  const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  if (!program) return undefined;

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  // One oversized triangle covers the viewport without a diagonal seam.
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(program);

  return {
    uniforms: {
      dim: gl.getUniformLocation(program, "uDim"),
      moon: gl.getUniformLocation(program, "uMoon"),
      nebulaOffset: gl.getUniformLocation(program, "uNebulaOffset"),
      planet: gl.getUniformLocation(program, "uPlanet"),
      resolution: gl.getUniformLocation(program, "uResolution"),
      time: gl.getUniformLocation(program, "uTime"),
      warp: gl.getUniformLocation(program, "uWarp"),
    },
  };
}

export interface Nebula {
  destroy: () => void;
  draw: (frame: NebulaFrame) => void;
  resize: (width: number, height: number, pixelRatio: number) => void;
}

interface NebulaFrame {
  bodies: Bodies;
  /** How much to darken the sky while reading, from 0 to 1. */
  dim: number;
  /** The nebula's parallax offset in CSS pixels. */
  nebulaOffset: { x: number; y: number };
  time: number;
  warp: number;
}
