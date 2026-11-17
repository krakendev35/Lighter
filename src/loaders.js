// Maps a file extension to a three.js loader and returns a THREE.Object3D.
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';

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

const basename = (p) => p.split('/').pop();

/**
 * Build a resolver for the files a model refers to (textures, .mtl, .bin).
 *
 * @param {string[]} files  paths relative to the model's folder, using "/"
 * @param {(relPath: string) => string} toUrl  turns one of those into a loadable URL
 * @returns {(url: string) => string | null}  null = leave the URL alone
 *
 * Lookup order: exact relative path, then the same file name anywhere in the
 * folder. The second step matters for FBX/OBJ files that still point at the
 * artist's own disk (e.g. "C:\Users\artist\maps\wood.png").
 */
export function makeResolver(files, toUrl) {
  const byPath = new Map();
  const byName = new Map();
  for (const f of files) {
    byPath.set(f.toLowerCase(), f);
    const name = basename(f).toLowerCase();
    if (!byName.has(name)) byName.set(name, f);
  }

  return (url) => {
    if (/^(data|blob|https?):/i.test(url)) return null;
    let p = url;
    try {
      p = decodeURIComponent(p); // glTF writes "my%20texture.png"
    } catch {
      /* not encoded */
    }
    p = p.replace(/\\/g, '/').replace(/^(\.\/)+/, '').toLowerCase();
    const hit = byPath.get(p) ?? byName.get(basename(p));
    return hit ? toUrl(hit) : null;
  };
}

/**
 * Load a model from an ArrayBuffer.
 * @param {ArrayBuffer} buffer file contents
 * @param {string} name file name (used to pick the loader)
 * @param {((url: string) => string | null) | null} resolve finds files next to the model
 * @returns {Promise<{ object: THREE.Object3D, animations: THREE.AnimationClip[] }>}
 */
export async function loadModel(buffer, name, resolve = null) {
  const ext = extensionOf(name);

  // Every loader fetches textures etc. through this manager, so one URL
  // modifier covers all formats.
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => resolve?.(url) ?? url);
  manager.addHandler(/\.tga$/i, new TGALoader(manager));

  // A texture that couldn't be found would render black; once everything has
  // finished loading, drop those so the material falls back to its colour.
  let result = null;
  let allDone = false;
  manager.onProgress = (_url, loaded, total) => (allDone = loaded === total);
  manager.onLoad = () => result && removeMissingTextures(result.object);

  result = await parse(ext, buffer, manager);
  if (allDone) removeMissingTextures(result.object); // finished before parse returned
  return result;
}

async function parse(ext, buffer, manager) {
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
      const text = new TextDecoder().decode(buffer);
      const loader = new OBJLoader(manager);
      const materials = await loadMtl(text, manager);
      if (materials) loader.setMaterials(materials);
      const object = loader.parse(text);
      object.traverse((child) => {
        if (!child.isMesh) return;
        if (!materials) child.material = NEUTRAL_MATERIAL;
        else [child.material].flat().forEach((m) => (m.side = THREE.DoubleSide));
      });
      return { object, animations: [] };
    }
    case 'gltf':
    case 'glb': {
      const gltf = await new GLTFLoader(manager).parseAsync(buffer, '');
      return { object: gltf.scene, animations: gltf.animations };
    }
    case 'fbx': {
      const object = new FBXLoader(manager).parse(buffer, '');
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
      const object = new ThreeMFLoader(manager).parse(buffer);
      return { object, animations: [] };
    }
    default:
      throw new Error(`Unsupported file type: .${ext}`);
  }
}

/** Load the first .mtl named by `mtllib` lines that can be found. */
async function loadMtl(objText, manager) {
  const names = [...objText.matchAll(/^\s*mtllib\s+(.+?)\s*$/gm)].map((m) => m[1]);
  for (const mtlName of names) {
    try {
      const materials = await new MTLLoader(manager).loadAsync(mtlName);
      materials.preload();
      return materials;
    } catch {
      console.warn(`Material file not found: ${mtlName}`);
    }
  }
  return null;
}

function removeMissingTextures(root) {
  root.traverse((o) => {
    for (const m of [o.material].flat().filter(Boolean)) {
      for (const [key, value] of Object.entries(m)) {
        if (value?.isTexture && !value.image) {
          m[key] = null;
          m.needsUpdate = true;
        }
      }
    }
  });
}
