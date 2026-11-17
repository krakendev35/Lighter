// Maps a file extension to a three.js loader and returns a THREE.Object3D.
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';

// Neutral matte gray for files without colour info (plan: #bfbfbf).
// DoubleSide: many STL/OBJ files have faces wound the wrong way, and a viewer
// should never make parts of a model disappear because of that.
export const NEUTRAL_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xbfbfbf,
  roughness: 0.8,
  metalness: 0,
  side: THREE.DoubleSide,
});

export const SUPPORTED = ['stl', 'obj', 'gltf', 'glb', 'fbx', 'ply', '3mf'];

export function extensionOf(name) {
  return name.split('.').pop().toLowerCase();
}

/**
 * Load a model from an ArrayBuffer.
 * @param {ArrayBuffer} buffer file contents
 * @param {string} name file name (used to pick the loader)
 * @returns {Promise<{ object: THREE.Object3D, animations: THREE.AnimationClip[] }>}
 */
export async function loadModel(buffer, name) {
  const ext = extensionOf(name);

  switch (ext) {
    case 'stl': {
      const geometry = new STLLoader().parse(buffer);
      geometry.computeVertexNormals();
      const material = geometry.hasColors
        ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide })
        : NEUTRAL_MATERIAL;
      return { object: new THREE.Mesh(geometry, material), animations: [] };
    }
    case 'obj': {
      // TODO (milestone 4): resolve .mtl and textures from the file's folder.
      const text = new TextDecoder().decode(buffer);
      const object = new OBJLoader().parse(text);
      object.traverse((child) => {
        if (child.isMesh) child.material = NEUTRAL_MATERIAL;
      });
      return { object, animations: [] };
    }
    case 'gltf':
    case 'glb': {
      const gltf = await new GLTFLoader().parseAsync(buffer, '');
      return { object: gltf.scene, animations: gltf.animations };
    }
    case 'fbx': {
      // TODO (milestone 4): resolve external textures from the file's folder.
      const object = new FBXLoader().parse(buffer, '');
      return { object, animations: object.animations ?? [] };
    }
    case 'ply': {
      const geometry = new PLYLoader().parse(buffer);
      const hasColors = !!geometry.attributes.color;
      // A PLY without faces is a point cloud.
      if (!geometry.index) {
        const material = new THREE.PointsMaterial({
          size: 2,
          sizeAttenuation: false,
          color: hasColors ? 0xffffff : 0xbfbfbf,
          vertexColors: hasColors,
        });
        return { object: new THREE.Points(geometry, material), animations: [] };
      }
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      const material = hasColors
        ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide })
        : NEUTRAL_MATERIAL;
      return { object: new THREE.Mesh(geometry, material), animations: [] };
    }
    case '3mf': {
      const object = new ThreeMFLoader().parse(buffer);
      return { object, animations: [] };
    }
    default:
      throw new Error(`Unsupported file type: .${ext}`);
  }
}
