"use client";

/**
 * Real Earth hero visual.
 *
 * Renders an actual photographic Earth — NASA's Blue Marble (topography +
 * bathymetry, December 2004) — as a textured sphere with Three.js: a slowly
 * rotating globe, a directional sun terminator and a restrained atmospheric
 * rim. The texture is self-hosted under `public/` (no hotlinked remote asset).
 *
 * Degradation: the same NASA image is shown as a static poster immediately and
 * whenever a WebGL context cannot be created (or the renderer fails). The page
 * therefore always shows a real Earth, never a drawn stand-in, and the primary
 * actions never depend on WebGL.
 *
 * The Three.js bundle is imported lazily so it is not part of the landing
 * page's initial payload.
 */
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { detectWebGLSupport } from "@/lib/webgl";

/** NASA Blue Marble (NASA imagery, generally not subject to copyright in the
 * US; self-hosted for reliability and attributed in the landing page). */
export const EARTH_TEXTURE_URL = "/earth-blue-marble-2048.jpg";

type Mode = "poster" | "gl";

type ThreeModule = typeof import("three");

/**
 * Build the Three.js scene. Returns a disposer. `onFail` is invoked if the
 * renderer cannot be created or the texture cannot be loaded, so the caller can
 * fall back to the static poster.
 */
function initGlobe(THREE: ThreeModule, host: HTMLElement, onFail: () => void): () => void {
  let renderer: import("three").WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    onFail();
    return () => {};
  }

  const width = host.clientWidth || 640;
  const height = host.clientHeight || 640;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
  camera.position.set(0, 0.15, 3.05);

  const radius = 1;
  const geometry = new THREE.SphereGeometry(radius, 96, 96);

  const texture = new THREE.TextureLoader().load(
    EARTH_TEXTURE_URL,
    undefined,
    undefined,
    () => {
      // Texture failed to load: tear down and show the poster instead.
      onFail();
    },
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.92,
    metalness: 0.0,
  });
  const earth = new THREE.Mesh(geometry, material);
  // Tilt the axis so the terminator reads as a real, rotating world.
  earth.rotation.z = (23.4 * Math.PI) / 180;
  scene.add(earth);

  // Atmospheric rim: a slightly larger back-facing shell with a fresnel glow.
  const atmosphereGeometry = new THREE.SphereGeometry(radius * 1.16, 96, 96);
  const atmosphereMaterial = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = 1.0 - abs(dot(vView, vNormal));
        rim = pow(rim, 2.4);
        vec3 inner = vec3(0.10, 0.48, 0.78);
        vec3 outer = vec3(0.38, 0.84, 0.98);
        vec3 color = mix(inner, outer, rim);
        gl_FragColor = vec4(color, rim * 0.85);
      }
    `,
  });
  const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
  scene.add(atmosphere);

  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.set(3.2, 1.6, 2.4);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x2c6ea6, 0.55);
  fill.position.set(-3, -1, -2);
  scene.add(fill);
  scene.add(new THREE.AmbientLight(0x0b2038, 1.1));

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  let frame = 0;
  let last = performance.now();
  const render = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!reduceMotion) {
      earth.rotation.y += dt * 0.045;
      atmosphere.rotation.y = earth.rotation.y;
    }
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  };
  frame = requestAnimationFrame(render);

  const resize = () => {
    const w = host.clientWidth || width;
    const h = host.clientHeight || height;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  const onContextLost = (event: Event) => {
    event.preventDefault();
    onFail();
  };
  renderer.domElement.addEventListener("webglcontextlost", onContextLost);

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
    scene.remove(earth, atmosphere);
    geometry.dispose();
    material.dispose();
    texture.dispose();
    atmosphereGeometry.dispose();
    atmosphereMaterial.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

export function EarthGlobe({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<Mode>("poster");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!detectWebGLSupport().supported) return; // stay on the poster

    let disposed = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      try {
        const THREE = await import("three");
        if (disposed) return;
        cleanup = initGlobe(THREE, host, () => {
          if (!disposed) setMode("poster");
        });
        if (disposed) {
          cleanup?.();
          return;
        }
        setMode("gl");
      } catch {
        if (!disposed) setMode("poster");
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <div
      role="img"
      aria-label="Rotating view of Earth from NASA's Blue Marble imagery"
      className={cn("relative aspect-square", className)}
    >
      <div ref={hostRef} aria-hidden className="absolute inset-0" />

      {/* Poster: a real Earth image, shown immediately and whenever WebGL is
          unavailable. Fades out once the 3D globe is live. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={EARTH_TEXTURE_URL}
        alt=""
        aria-hidden
        draggable={false}
        className={cn(
          "absolute inset-0 h-full w-full select-none rounded-full object-cover shadow-[0_40px_120px_-30px_rgba(3,9,20,0.9)] transition-opacity duration-700",
          mode === "gl" ? "opacity-0" : "opacity-100",
        )}
        style={{ filter: "saturate(1.05) brightness(1.02)" }}
      />

      {/* Atmospheric halo behind the sphere, matching the GL rim. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          boxShadow:
            "0 0 90px 12px rgba(44,160,220,0.22), inset 0 0 80px 10px rgba(10,60,110,0.35)",
        }}
      />
    </div>
  );
}
