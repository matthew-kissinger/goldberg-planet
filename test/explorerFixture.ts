import { readFile } from 'node:fs/promises';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
let promise: Promise<GLTF> | undefined;
/** Load the delivered binary through the actual runtime consumer. */
export function explorerFixture(): Promise<GLTF> {
  return promise ??= readFile(new URL('../assets/explorer/explorer.glb', import.meta.url)).then(bytes =>
    new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''),
  );
}
