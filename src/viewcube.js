// View cube overlay + camera snapping.
//
// A ~96px cube in the top-right corner that turns with the camera. Hovering
// highlights a face, edge or corner; clicking it animates the camera (~300 ms)
// to look at the model from that side.
import * as THREE from 'three';

const SIZE = 96; // CSS pixels
const BAND = 0.2; // width of the edge/corner zones (cube is 1 unit)

// Same order as BoxGeometry's material slots: +X, -X, +Y, -Y, +Z, -Z.
const FACES = [
  { label: 'RIGHT', dir: [1, 0, 0] },
  { label: 'LEFT', dir: [-1, 0, 0] },
  { label: 'TOP', dir: [0, 1, 0] },
  { label: 'BOTTOM', dir: [0, -1, 0] },
  { label: 'FRONT', dir: [0, 0, 1] },
  { label: 'BACK', dir: [0, 0, -1] },
];

const PALETTES = {
  dark: { face: '#141414', border: '#3a3a3a', label: '#8a8a8a', hoverFace: '#ffffff', hoverLabel: '#000000' },
  light: { face: '#ffffff', border: '#c8c8c8', label: '#6b6b6b', hoverFace: '#000000', hoverLabel: '#ffffff' },
};

export class ViewCube {
  constructor(viewer, parent) {
    this.viewer = viewer;

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'viewcube';
    parent.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(SIZE, SIZE, false);

    this.scene = new THREE.Scene();
    // Orthographic and slightly larger than the cube's diagonal so corners never clip.
    this.camera = new THREE.OrthographicCamera(-0.9, 0.9, 0.9, -0.9, 0.1, 10);

    this.materials = FACES.map(() => new THREE.MeshBasicMaterial());
    this.cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.materials);
    this.scene.add(this.cube);

    // White (or black) box laid over a hovered edge or corner.
    this.highlight = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.textures = null; // { normal: [], hover: [] }
    this.hovered = null; // direction array, e.g. [1, 1, 0]
    this.raycaster = new THREE.Raycaster();

    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerleave', () => this.setHovered(null));
    this.canvas.addEventListener('click', () => {
      if (this.hovered) this.viewer.viewFrom(new THREE.Vector3(...this.hovered));
    });

    viewer.onFrame(() => this.render());
  }

  /** Turn the little camera exactly like the main camera, then draw. */
  render() {
    const q = this.viewer.camera.quaternion;
    this.camera.quaternion.copy(q);
    this.camera.position.set(0, 0, 3).applyQuaternion(q);
    this.renderer.render(this.scene, this.camera);
  }

  async setTheme(name) {
    const p = PALETTES[name];
    await document.fonts.load('600 28px Poppins');
    this.textures?.normal.concat(this.textures.hover).forEach((t) => t.dispose());
    this.textures = {
      normal: FACES.map((f) => faceTexture(f.label, p.face, p.label, p.border)),
      hover: FACES.map((f) => faceTexture(f.label, p.hoverFace, p.hoverLabel, p.border)),
    };
    this.highlight.material.color.set(p.hoverFace);
    this.updateMaterials();
  }

  onPointerMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.cube)[0];
    if (!hit) return this.setHovered(null);

    // Which zone was hit: each axis is -1 / 0 / +1. One non-zero axis = face,
    // two = edge, three = corner.
    const dir = hit.point.toArray().map((v) => (Math.abs(v) > 0.5 - BAND ? Math.sign(v) : 0));
    this.setHovered(dir);
  }

  setHovered(dir) {
    if (String(dir) === String(this.hovered)) return;
    this.hovered = dir;
    this.canvas.style.cursor = dir ? 'pointer' : '';
    this.updateMaterials();
  }

  updateMaterials() {
    if (!this.textures) return;
    const dir = this.hovered;
    const nonZero = dir ? dir.filter((v) => v !== 0).length : 0;
    const hoveredFace = nonZero === 1 ? FACES.findIndex((f) => String(f.dir) === String(dir)) : -1;

    this.materials.forEach((m, i) => {
      m.map = i === hoveredFace ? this.textures.hover[i] : this.textures.normal[i];
      m.needsUpdate = true;
    });

    // Edge or corner: cover that zone with a slightly raised box.
    this.highlight.visible = nonZero >= 2;
    if (nonZero >= 2) {
      dir.forEach((v, axis) => {
        const size = v === 0 ? 1 - 2 * BAND : BAND + 0.02;
        const pos = v === 0 ? 0 : v * (0.5 - BAND / 2 + 0.01);
        this.highlight.scale.setComponent(axis, size);
        this.highlight.position.setComponent(axis, pos);
      });
    }
  }
}

function faceTexture(label, background, color, border) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = border;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 124, 124);
  ctx.fillStyle = color;
  ctx.font = `600 ${label.length > 5 ? 24 : 28}px Poppins, 'Segoe UI', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 64, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
