// The little WebGL plumbing the nebula and the starfield share. WebGL 1 is
// frozen, so this code should never need to change.

export function createProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string
) {
  const program = gl.createProgram();
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!program || !vertex || !fragment) return undefined;

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;

  console.warn(
    "[cosmos] Failed to link a shader.",
    gl.getProgramInfoLog(program)
  );
  return undefined;
}

/**
 * A GPU reset or a backgrounded tab can drop the context. This asks for it
 * back and rebuilds once restored; until then the renderer should skip drawing.
 */
export function watchContext(
  canvas: HTMLCanvasElement,
  { onLost, onRestored }: { onLost: () => void; onRestored: () => void }
) {
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    onLost();
  });
  canvas.addEventListener("webglcontextrestored", onRestored);
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
    "[cosmos] Failed to compile a shader.",
    gl.getShaderInfoLog(shader)
  );
  return undefined;
}
