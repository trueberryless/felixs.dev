// A single full-screen fragment shader paints the nebula, the gas giant with
// its glowing atmosphere and a little moon. It is far lighter than pulling in a
// 3D engine, and the soft content lets it render below native resolution.
const MAX_PIXELS = 700_000;

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
uniform vec2 uParallax;
uniform float uSink;
uniform float uWarp;

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

// Distance-based glow that hugs a sphere's limb from both sides.
float limbGlow(float signedDistance, float outer, float inner) {
  return signedDistance > 0.0
    ? exp(-signedDistance * outer) * 0.85 + exp(-signedDistance * 5.0) * 0.2
    : exp(signedDistance * inner) * 1.05;
}

void main() {
  vec2 frag = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (frag - 0.5) * vec2(aspect, 1.0);
  float t = uTime;

  // Dropping out of hyperspace: the scene starts zoomed out and settles in.
  vec2 sp = p * (1.0 + uWarp * 0.9);

  vec3 color = mix(
    vec3(0.012, 0.008, 0.04),
    vec3(0.07, 0.035, 0.15),
    smoothstep(-0.8, 0.9, -sp.y * 0.9 + sp.x * 0.25)
  );

  // Nebula: domain-warped noise concentrated along a diagonal band.
  vec2 np = sp + uParallax * 0.035;
  vec2 q = np * 1.7 + vec2(t * 0.012, -t * 0.006);
  vec2 warp = vec2(fbm(q), fbm(q + vec2(5.2, 1.3)));
  float density = fbm(q + 2.4 * warp + vec2(t * 0.008, 0.0));
  float band = exp(-pow((np.y + np.x * 0.55 - 0.16) * 2.3, 2.0));
  float nebula = smoothstep(0.32, 0.95, density) * (0.22 + 0.78 * band);
  vec3 nebulaColor = mix(
    vec3(0.3, 0.1, 0.58),
    vec3(0.78, 0.24, 0.7),
    smoothstep(0.3, 0.8, warp.x)
  );
  nebulaColor = mix(nebulaColor, vec3(0.18, 0.42, 0.92), smoothstep(0.55, 0.85, warp.y));
  color += nebulaColor * nebula * 0.5;
  color += vec3(0.95, 0.7, 1.0) * pow(nebula, 3.0) * band * 0.3;
  float lanes = smoothstep(0.5, 0.78, fbm(q * 2.6 - warp * 1.5));
  color *= 1.0 - lanes * 0.45 * band;

  // Backlit gas giant rising from the bottom edge.
  vec3 light = normalize(vec3(-0.45, 0.85, -0.35));
  vec2 planetCenter = vec2(aspect * 0.18, -1.33 - uSink * 0.2) + uParallax * 0.012;
  float radius = 1.0;
  vec2 d = sp - planetCenter;
  float r = length(d);
  float pixel = 2.0 / uResolution.y;
  float inside = smoothstep(radius, radius - pixel, r);
  if (inside > 0.0) {
    vec3 normal = vec3(d, sqrt(max(radius * radius - r * r, 0.0))) / radius;
    float diffuse = max(dot(normal, light), 0.0);
    float latitude = normal.y * 0.9 + normal.x * 0.25;
    float bands = fbm(vec2(latitude * 9.0, normal.x * 1.2 + t * 0.01));
    vec3 surface = mix(vec3(0.07, 0.04, 0.18), vec3(0.3, 0.16, 0.55), bands);
    surface = mix(
      surface,
      vec3(0.12, 0.3, 0.62),
      smoothstep(0.55, 0.8, fbm(vec2(latitude * 22.0, normal.x * 3.0 - t * 0.015)))
    );
    vec3 planet = surface * (0.06 + 0.08 * normal.z + 1.6 * diffuse);
    float fresnel = pow(1.0 - normal.z, 2.5);
    planet += mix(vec3(0.5, 0.3, 1.0), vec3(0.4, 0.8, 1.0), diffuse) * fresnel * (0.2 + 1.1 * diffuse);
    color = mix(color, planet, inside);
  }

  // Atmosphere and the faint cosmic rays fanning out of it.
  vec2 direction = d / max(r, 1e-4);
  float lit = clamp(dot(direction, normalize(light.xy)) * 0.5 + 0.5, 0.0, 1.0);
  vec3 atmosphere = mix(vec3(0.45, 0.2, 0.85), vec3(0.3, 0.7, 1.0), smoothstep(0.35, 0.9, lit));
  atmosphere = mix(atmosphere, vec3(1.0, 0.5, 0.8), smoothstep(0.78, 1.0, lit) * 0.35);
  float altitude = r - radius;
  color += atmosphere * limbGlow(altitude, 22.0, 70.0) * (0.15 + 0.85 * lit);
  float rays = noise(direction * 34.0 + t * 0.03) * noise(direction * 11.0 - t * 0.02);
  color += atmosphere * pow(rays, 1.6) * exp(-max(altitude, 0.0) * 3.0) * 0.4 * lit * step(0.0, altitude);

  // A small moon catching the same light.
  vec2 moonCenter = vec2(-aspect * 0.3, 0.28) + uParallax * 0.02;
  float moonRadius = 0.032;
  vec2 md = sp - moonCenter;
  float mr = length(md);
  float moonInside = smoothstep(moonRadius, moonRadius - pixel, mr);
  if (moonInside > 0.0) {
    vec3 normal = vec3(md, sqrt(max(moonRadius * moonRadius - mr * mr, 0.0))) / moonRadius;
    float diffuse = max(dot(normal, normalize(vec3(-0.6, 0.5, 0.25))), 0.0);
    float craters = fbm(md * 90.0);
    vec3 moon = mix(vec3(0.55, 0.5, 0.75), vec3(0.85, 0.82, 0.95), craters) * (0.04 + 1.1 * diffuse);
    color = mix(color, moon, moonInside);
  }
  color += vec3(0.6, 0.55, 1.0) * limbGlow(mr - moonRadius, 60.0, 400.0) * 0.12;

  color += vec3(0.55, 0.45, 1.0) * uWarp * 0.3 * exp(-length(p) * 2.5);
  color *= 1.0 - uSink * 0.3;
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

  const program = createProgram(gl);
  if (!program) return undefined;

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
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

  const uniforms = {
    parallax: gl.getUniformLocation(program, "uParallax"),
    resolution: gl.getUniformLocation(program, "uResolution"),
    sink: gl.getUniformLocation(program, "uSink"),
    time: gl.getUniformLocation(program, "uTime"),
    warp: gl.getUniformLocation(program, "uWarp"),
  };

  function resize(width: number, height: number, pixelRatio: number) {
    const scale = Math.min(
      pixelRatio,
      Math.sqrt(MAX_PIXELS / Math.max(width * height, 1))
    );
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.uniform2f(uniforms.resolution, canvas.width, canvas.height);
  }

  function draw({ parallax, sink, time, warp }: NebulaFrame) {
    gl!.uniform1f(uniforms.time, time);
    gl!.uniform2f(uniforms.parallax, parallax.x, -parallax.y);
    gl!.uniform1f(uniforms.sink, sink);
    gl!.uniform1f(uniforms.warp, warp);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  function destroy() {
    gl!.getExtension("WEBGL_lose_context")?.loseContext();
  }

  return { destroy, draw, resize };
}

function createProgram(gl: WebGLRenderingContext) {
  const program = gl.createProgram();
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!program || !vertex || !fragment) return undefined;

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;

  console.warn("[cosmos] Failed to link the nebula shader.");
  return undefined;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
) {
  const shader = gl.createShader(type);
  if (!shader) return undefined;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;

  console.warn(
    "[cosmos] Failed to compile a nebula shader.",
    gl.getShaderInfoLog(shader)
  );
  return undefined;
}

export interface Nebula {
  destroy: () => void;
  draw: (frame: NebulaFrame) => void;
  resize: (width: number, height: number, pixelRatio: number) => void;
}

interface NebulaFrame {
  parallax: { x: number; y: number };
  sink: number;
  time: number;
  warp: number;
}
