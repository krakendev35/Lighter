// Floor grid (fades out with distance) and grayscale XYZ axes.
import * as THREE from 'three';

// The grid shader writes colours straight to the screen, so it needs the raw
// sRGB values of a hex colour (no colour-space conversion).
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/* ---------------- Grid ---------------- */

export function createGrid() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Vector3() },
      uCell: { value: 1 },
      uCenter: { value: new THREE.Vector2() },
      uFade: { value: 10 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uCell;
      uniform vec2 uCenter;
      uniform float uFade;
      varying vec3 vWorld;

      // 1.0 on a grid line, 0.0 elsewhere, anti-aliased to ~1px.
      float gridLine(vec2 p) {
        vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
        return 1.0 - min(min(g.x, g.y), 1.0);
      }

      void main() {
        float minor = gridLine(vWorld.xz / uCell);
        float major = gridLine(vWorld.xz / (uCell * 10.0));
        float alpha = max(minor * 0.5, major);
        float d = length(vWorld.xz - uCenter) / uFade;
        alpha *= 1.0 - smoothstep(0.2, 1.0, d);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uColor, alpha);
      }`,
  });

  const grid = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  grid.rotation.x = -Math.PI / 2;
  return grid;
}

/** Size the grid to the model: sits just under it, cell size a power of 10. */
export function fitGrid(grid, box) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = Math.max(size.x, size.y, size.z) || 1;
  const fade = s * 3;
  const u = grid.material.uniforms;

  u.uCell.value = Math.pow(10, Math.round(Math.log10(s / 10)));
  u.uCenter.value.set(center.x, center.z);
  u.uFade.value = fade;
  // A hair below the model so its bottom face doesn't flicker against the grid.
  grid.position.set(center.x, box.min.y - s * 0.001, center.z);
  grid.scale.set(fade * 2, fade * 2, 1);
}

export function setGridColor(grid, hex) {
  grid.material.uniforms.uColor.value.copy(hexToRgb(hex));
}

/* ---------------- Axes ---------------- */

const AXES = [
  { dir: new THREE.Vector3(1, 0, 0), label: 'X' },
  { dir: new THREE.Vector3(0, 1, 0), label: 'Y' },
  { dir: new THREE.Vector3(0, 0, 1), label: 'Z' },
];

export function createAxes() {
  const group = new THREE.Group();
  group.userData.parts = AXES.map(({ dir, label }) => {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), dir]),
      new THREE.LineBasicMaterial({ toneMapped: false }),
    );
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ sizeAttenuation: false, depthTest: false, toneMapped: false }),
    );
    sprite.scale.set(0.03, 0.03, 1);
    sprite.renderOrder = 10;
    group.add(line, sprite);
    return { line, sprite, label };
  });
  return group;
}

/**
 * Axes start at the world origin and are a bit shorter than the model.
 * Only the lines are scaled: the labels have a fixed on-screen size and
 * would blow up if their parent were scaled.
 */
export function fitAxes(axes, box) {
  const size = box.getSize(new THREE.Vector3());
  const length = Math.max(size.x, size.y, size.z) * 0.6 || 1;
  axes.userData.parts.forEach(({ line, sprite }, i) => {
    line.scale.setScalar(length);
    sprite.position.copy(AXES[i].dir).multiplyScalar(length * 1.08);
  });
}

/** colors: [x, y, z] — three grays. Call after Poppins has loaded. */
export function setAxesColors(axes, colors) {
  axes.userData.parts.forEach((part, i) => {
    part.line.material.color.set(colors[i]);
    part.sprite.material.map?.dispose();
    part.sprite.material.map = labelTexture(part.label, colors[i]);
    part.sprite.material.needsUpdate = true;
  });
}

function labelTexture(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.font = "500 40px Poppins, 'Segoe UI', sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 32, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
