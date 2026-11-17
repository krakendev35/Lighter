// Scene, camera, controls, lighting and framing.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

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
    this.setBackground('#0d0d0d');

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

    this.model = null;

    window.addEventListener('resize', () => this.onResize());
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  setBackground(color) {
    this.scene.background = new THREE.Color(color);
  }

  onResize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /** Replace the current model with a new one and frame it. */
  setModel(object) {
    if (this.model) {
      this.scene.remove(this.model);
      disposeObject(this.model);
    }
    this.model = object;
    this.scene.add(object);
    this.frame();
  }

  /** Point the camera so the whole model fits in view ("F" key). */
  frame() {
    if (!this.model) return;
    const box = new THREE.Box3().setFromObject(this.model);
    if (box.isEmpty()) return;

    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = (sphere.radius / Math.sin(fov / 2)) * 1.1;

    const direction = new THREE.Vector3(1, 0.8, 1).normalize();
    this.camera.position.copy(sphere.center).addScaledVector(direction, distance);
    this.camera.near = distance / 100;
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(sphere.center);
    this.controls.update();
  }

  /** Triangle count and bounding-box size for the top-bar meta. */
  stats() {
    let triangles = 0;
    this.model?.traverse((child) => {
      if (!child.isMesh) return;
      const g = child.geometry;
      triangles += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    });
    const size = new THREE.Box3().setFromObject(this.model).getSize(new THREE.Vector3());
    return { triangles: Math.round(triangles), size };
  }
}

function disposeObject(root) {
  root.traverse((child) => {
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((m) => m && m.dispose && m.dispose());
  });
}
