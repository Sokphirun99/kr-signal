import { useEffect, useRef } from "react";

export interface GlowThreadsProps {
  /** Palette of three colors for the thread strands (hex format). */
  colors?: [string, string, string];
  /** Hex background color behind the threads. */
  background?: string;
  /** Speed multiplier for thread drift and oscillation. */
  speed?: number;
  /** Number of active threads in each bundle (3 to 16). */
  count?: number;
  /** Additional CSS class names. */
  className?: string;
}

const VERTEX_SHADER_SOURCE = `
  attribute vec2 aPos;
  void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER_SOURCE = `
  precision highp float;

  uniform vec2  uRes;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uCount;
  uniform vec3  uColA;
  uniform vec3  uColB;
  uniform vec3  uColC;
  uniform vec3  uBg;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  vec3 ramp(float t) {
    vec3 c = mix(uColA, uColB, smoothstep(0.0, 0.55, t));
    return mix(c, uColC, smoothstep(0.5, 1.0, t));
  }

  vec3 fan(vec2 uv, float baseAngle, float curl, float freq,
           float phase, float strength, float t) {
    float r = length(uv);
    float ang = baseAngle + curl * r;
    float ca = cos(ang), sa = sin(ang);
    vec2 p = mat2(ca, -sa, sa, ca) * uv;

    float breathe = 0.20 + 0.13 * sin(t * 0.23 + phase);

    vec3 acc = vec3(0.0);
    for (int i = 0; i < 16; i++) {
      if (float(i) >= uCount) break;
      float fi = float(i);
      float k  = fi / max(uCount - 1.0, 1.0);

      float y = sin(p.x * freq + phase + fi * 0.4 + t * 0.32)
                * breathe * (0.55 + 0.9 * k)
                + (k - 0.5) * 0.14;

      float d = abs(p.y - y);
      float glow = exp(-d * 80.0) * 0.6 + 0.012 / (d + 0.012);
      acc += ramp(k) * glow;
    }
    return acc * strength;
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    float t = uTime * uSpeed;

    vec3 col = vec3(0.0);
    col += fan(uv,                      -0.45,  0.38, 1.8, 1.7, 0.080, t);
    col += fan(uv,                       0.28, -0.52, 1.4, 4.3, 0.055, t);
    col += fan(uv + vec2(0.16, 0.30),   -0.90,  0.22, 2.2, 9.1, 0.032, t);

    col = 1.0 - exp(-col * 1.5);

    float g = hash(gl_FragCoord.xy + fract(uTime) * vec2(113.0, 271.0));
    col *= 0.94 + 0.12 * g;
    col += (g - 0.5) * 0.018;

    gl_FragColor = vec4(uBg + col, 1.0);
  }
`;

/**
 * Converts a hex color string to normalized RGB float array [r, g, b].
 */
function hexToRgb(hexString: string): [number, number, number] {
  const cleanHex = hexString.replace("#", "");
  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) return [0, 0, 0];
  return [
    ((num >> 16) & 255) / 255,
    ((num >> 8) & 255) / 255,
    (num & 255) / 255,
  ];
}

/**
 * GlowThreadsBackground component renders an interactive or animated WebGL canvas background
 * featuring glowing light threads that bend and drift dynamically across the screen.
 */
export default function GlowThreadsBackground({
  colors = ["#10b981", "#a7f3d0", "#059669"],
  background = "#070a08",
  speed = 1.0,
  count = 9,
  className = "",
}: GlowThreadsProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ colors, background, speed, count });

  useEffect(() => {
    stateRef.current = { colors, background, speed, count };
  }, [colors, background, speed, count]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) {
      console.warn("WebGL not supported; falling back to dark background");
      return;
    }

    const compileShader = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader compile error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertShader = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fragShader = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vertShader || !fragShader) return;

    const program = gl.createProgram();
    if (!program) return;

    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return;
    }

    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );

    const aPosLocation = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPosLocation);
    gl.vertexAttribPointer(aPosLocation, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {
      uRes: gl.getUniformLocation(program, "uRes"),
      uTime: gl.getUniformLocation(program, "uTime"),
      uSpeed: gl.getUniformLocation(program, "uSpeed"),
      uCount: gl.getUniformLocation(program, "uCount"),
      uColA: gl.getUniformLocation(program, "uColA"),
      uColB: gl.getUniformLocation(program, "uColB"),
      uColC: gl.getUniformLocation(program, "uColC"),
      uBg: gl.getUniformLocation(program, "uBg"),
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.floor(canvas.clientWidth * dpr);
      const height = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    window.addEventListener("resize", resize);

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const startTime = performance.now();
    let animationFrameId: number;

    const render = (now: number) => {
      resize();
      const elapsedTime = prefersReducedMotion ? 0 : (now - startTime) / 1000;
      const { colors: currentColors, background: currentBg, speed: currentSpeed, count: currentCount } = stateRef.current;

      gl.uniform2f(uniforms.uRes, canvas.width, canvas.height);
      gl.uniform1f(uniforms.uTime, elapsedTime);
      gl.uniform1f(uniforms.uSpeed, currentSpeed);
      gl.uniform1f(uniforms.uCount, currentCount);

      const colorA = hexToRgb(currentColors[0]);
      const colorB = hexToRgb(currentColors[1]);
      const colorC = hexToRgb(currentColors[2]);
      const bg = hexToRgb(currentBg);

      gl.uniform3fv(uniforms.uColA, colorA);
      gl.uniform3fv(uniforms.uColB, colorB);
      gl.uniform3fv(uniforms.uColC, colorC);
      gl.uniform3fv(uniforms.uBg, bg);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (!prefersReducedMotion) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      gl.deleteBuffer(buffer);
      gl.deleteShader(vertShader);
      gl.deleteShader(fragShader);
      gl.deleteProgram(program);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 h-full w-full pointer-events-none z-0 ${className}`}
      style={{ background }}
    />
  );
}
