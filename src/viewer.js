// Scene, camera, controls, lighting, framing and display modes.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { NEUTRAL_MATERIAL } from './loaders.js';
import { AnimationPlayer } from './animation.js';
import { createGrid, fitGrid, setGridColor, createAxes, fitAxes, setAxesColors } from './helpers.js';

// Viewport colours per theme (UI colours live in theme.css).
export const THEMES = {
  dark: {
    background: '#0d0d0d',
    grid: '#262626',
    wire: '#e6e6e6',
    edge: '#ffffff',
    axes: ['#f2f2f2', '#b3b3b3', '#7a7a7a'],
  },
  light: {
    background: '#f2f2f2',
    grid: '#d0d0d0',
    wire: '#1a1a1a',
    edge: '#000000',
    axes: ['#111111', '#4d4d4d', '#8a8a8a'],
  },
};

const ISO_DIRECTION = new THREE.Vector3(1, 0.8, 1).normalize();
const SNAP_MS = 300;
const POLE_EPS = 1e-4; // radians away from straight up/down

export class Viewer {
  constructor(container) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    // Neutral tone mapping keeps light grays from blowing out to flat white.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 1000);
    this.camera.position.set(3, 2, 3);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    // Neutral white studio lighting (no tinted lights).
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.6;
    // Key light follows the camera so the side you're looking at is always lit.
    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.keyLight.position.set(1, 2, 1.5);
    this.keyLight.target.position.set(0, 0, -1);
    this.camera.add(this.keyLight, this.keyLight.target);
    this.scene.add(this.camera);

    // Display state
    this.mode = 'shaded'; // 'shaded' | 'wireframe' | 'edges'
    this.clay = false;
    this.showGrid = false;
    this.showAxes = false;
    this.theme = 'dark';

    this.wireMaterial = new THREE.MeshBasicMaterial({ wireframe: true, toneMapped: false });
    this.edgeMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.35, toneMapped: false });
    this.edges = null; // built the first time "edges" mode is used for a model

    this.grid = createGrid();
    this.axes = createAxes();
    this.grid.visible = this.axes.visible = false;
    this.scene.add(this.grid, this.axes);

    this.model = null;
    this.box = null;
    this.snap = null; // running camera animation (view cube)
    this.glide = null; // running "center model" animation
    this.setTool('rotate');
    this.frameCallbacks = [];

    this.player = null; // AnimationPlayer when the model has animations
    this.lastFrame = performance.now();

    window.addEventListener('resize', () => this.onResize());
    this.renderer.setAnimationLoop((now) => {
      // Cap the step so switching back to the window doesn't jump the animation.
      const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
      this.lastFrame = now;
      this.player?.update(dt);
      if (this.snap) this.stepSnap(now);
      else if (this.glide) this.stepGlide(now);
      else this.controls.update();
      this.renderer.render(this.scene, this.camera);
      for (const cb of this.frameCallbacks) cb();
    });
  }

  /** Run `cb` after every rendered frame (the view cube uses this). */
  onFrame(cb) {
    this.frameCallbacks.push(cb);
  }

  onResize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /* ---------------- Model ---------------- */

  /** Replace the current model with a new one and frame it. */
  setModel(object, animations = []) {
    this.player?.dispose();
    this.player = null;
    if (this.model) {
      this.scene.remove(this.model);
      disposeObject(this.model);
    }
    this.model = object;
    const player = new AnimationPlayer(object, animations);
    if (player.hasClips) this.player = player;
    this.edges = null;
    object.traverse((o) => {
      if (o.isMesh) o.userData.lighterMaterial = o.material;
    });
    this.scene.add(object);

    this.box = new THREE.Box3().setFromObject(object);
    fitGrid(this.grid, this.box);
    fitAxes(this.axes, this.box);
    this.applyDisplay();
    this.frame();
  }

  /* ---------------- View tools ---------------- */

  /**
   * Choose what LEFT-drag does: 'rotate', 'pan' or 'zoom'. Right-drag always
   * pans and the wheel / middle-drag always zoom, whatever the tool.
   */
  setTool(tool) {
    this.tool = tool;
    this.controls.mouseButtons = {
      LEFT: { rotate: THREE.MOUSE.ROTATE, pan: THREE.MOUSE.PAN, zoom: THREE.MOUSE.DOLLY }[tool],
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
  }

  /**
   * Bring the model back to the middle of the screen (after panning), keeping
   * the current zoom and viewing angle. Camera and orbit point slide together
   * over ~300 ms.
   */
  centerModel() {
    if (!this.box || this.box.isEmpty()) return;
    this.snap = null;
    const center = this.box.getCenter(new THREE.Vector3());
    this.glide = {
      fromTarget: this.controls.target.clone(),
      fromPosition: this.camera.position.clone(),
      delta: center.sub(this.controls.target),
      start: performance.now(),
    };
  }

  stepGlide(now) {
    const { fromTarget, fromPosition, delta, start } = this.glide;
    const t = Math.min(1, (now - start) / SNAP_MS);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const offset = delta.clone().multiplyScalar(eased);
    this.controls.target.copy(fromTarget).add(offset);
    this.camera.position.copy(fromPosition).add(offset);
    this.camera.lookAt(this.controls.target);
    if (t === 1) {
      this.glide = null;
      this.controls.update();
    }
  }

  /** Point the camera so the whole model fits in view. */
  frame({ keepDirection = false } = {}) {
    if (!this.box || this.box.isEmpty()) return;
    this.snap = null;
    this.glide = null;

    const sphere = this.box.getBoundingSphere(new THREE.Sphere());
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = (sphere.radius / Math.sin(fov / 2)) * 1.1;

    const direction = keepDirection
      ? this.camera.position.clone().sub(this.controls.target).normalize()
      : ISO_DIRECTION;
    this.camera.position.copy(sphere.center).addScaledVector(direction, distance);
    this.camera.near = distance / 100;
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(sphere.center);
    this.controls.update();
  }

  /**
   * Animate the camera to look at the model from `direction` (view cube).
   *
   * The camera moves in spherical coordinates (around the vertical axis and
   * up/down separately) so it never swings over the top or bottom pole, which
   * would flip the view. For TOP / BOTTOM the current rotation around the
   * vertical axis is kept, so the model doesn't spin when you look down on it
   * from the back.
   */
  viewFrom(direction) {
    this.glide = null;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const from = new THREE.Spherical().setFromVector3(offset);
    const to = new THREE.Spherical().setFromVector3(direction.clone().normalize());
    to.radius = from.radius;

    const isTopOrBottom = Math.abs(direction.clone().normalize().y) > 0.999;
    if (isTopOrBottom) to.theta = from.theta;
    // Never sit exactly on a pole: the orbit controls can't tell which way is up there.
    to.phi = THREE.MathUtils.clamp(to.phi, POLE_EPS, Math.PI - POLE_EPS);

    // Turn the short way round (e.g. 350° → 10° goes +20°, not −340°).
    let dTheta = to.theta - from.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));

    this.snap = {
      from,
      dTheta,
      dPhi: to.phi - from.phi,
      start: performance.now(),
    };
  }

  stepSnap(now) {
    const { from, dTheta, dPhi, start } = this.snap;
    const t = Math.min(1, (now - start) / SNAP_MS);
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const current = new THREE.Spherical(from.radius, from.phi + dPhi * eased, from.theta + dTheta * eased);
    this.camera.position.setFromSpherical(current).add(this.controls.target);
    this.camera.lookAt(this.controls.target);
    if (t === 1) {
      this.snap = null;
      this.controls.update();
    }
  }

  /* ---------------- Display modes ---------------- */

  setMode(mode) {
    this.mode = mode;
    this.applyDisplay();
  }

  toggleClay() {
    this.clay = !this.clay;
    this.applyDisplay();
  }

  toggleGrid() {
    this.showGrid = !this.showGrid;
    this.applyDisplay();
  }

  toggleAxes() {
    this.showAxes = !this.showAxes;
    this.applyDisplay();
  }

  applyDisplay() {
    this.grid.visible = this.showGrid && !!this.model;
    this.axes.visible = this.showAxes && !!this.model;
    if (!this.model) return;

    this.model.traverse((o) => {
      if (!o.isMesh) return;
      const base = this.clay ? NEUTRAL_MATERIAL : o.userData.lighterMaterial;
      o.material = this.mode === 'wireframe' ? this.wireMaterial : base;
    });

    if (this.mode === 'edges' && !this.edges) this.buildEdges();
    this.edges?.forEach((e) => (e.visible = this.mode === 'edges'));
  }

  /** Feature edges (creases sharper than 30°) drawn over the shaded model. */
  buildEdges() {
    const meshes = [];
    this.model.traverse((o) => o.isMesh && meshes.push(o));
    this.edges = meshes.map((mesh) => {
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), this.edgeMaterial);
      lines.userData.lighterEdge = true;
      mesh.add(lines);
      return lines;
    });
  }

  /* ---------------- Theme ---------------- */

  async setTheme(name) {
    this.theme = name;
    const t = THEMES[name];
    this.scene.background = new THREE.Color(t.background);
    this.wireMaterial.color.set(t.wire);
    this.edgeMaterial.color.set(t.edge);
    setGridColor(this.grid, t.grid);
    await document.fonts.load("500 40px Poppins");
    setAxesColors(this.axes, t.axes);
  }

  /* ---------------- Screenshot ---------------- */

  /** The current view as a PNG (the 3D view only, no UI). */
  screenshot() {
    this.renderer.render(this.scene, this.camera);
    return new Promise((resolve) => this.renderer.domElement.toBlob(resolve, 'image/png'));
  }

  /* ---------------- Info ---------------- */

  /** Triangle / vertex counts and bounding-box size for the top bar. */
  stats() {
    let triangles = 0;
    let vertices = 0;
    this.model?.traverse((o) => {
      if (!(o.isMesh || o.isPoints)) return;
      const g = o.geometry;
      const count = g.attributes.position.count;
      vertices += count;
      if (o.isMesh) triangles += (g.index ? g.index.count : count) / 3;
    });
    const size = this.box.getSize(new THREE.Vector3());
    return { triangles: Math.round(triangles), vertices, size };
  }
}

function disposeObject(root) {
  root.traverse((o) => {
    o.geometry?.dispose();
    if (o.userData.lighterEdge) return; // shares the viewer's edge material
    const materials = [o.userData.lighterMaterial ?? o.material].flat().filter(Boolean);
    for (const m of materials) {
      if (m === NEUTRAL_MATERIAL) continue;
      for (const value of Object.values(m)) if (value?.isTexture) value.dispose();
      m.dispose();
    }
  });
}
