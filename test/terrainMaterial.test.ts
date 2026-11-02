import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { createTerrainMaterial } from '../src/render/terrainMaterial';
import { encodePackedMat } from '../src/render/mesher';
import { MAT } from '../src/world/terrain';
import { buildSolarSystemConfigs } from '../src/world/planetConfig';
import { planetVisualProfile } from '../src/render/planetVisualProfile';

type GraphNode = Record<string, unknown> & { constructor: { name: string } };

/** Evaluate the scalar TSL graph itself, using real mesher data, without a GPU. */
function scalar(input: unknown, packed: number): number {
  const n = input as GraphNode;
  if (n.constructor.name === 'ConstNode') return Number(n.value);
  if (n.isUniformNode && typeof n.value === 'number') return n.value;
  if (n.constructor.name === 'AttributeNode' && n._attributeName === 'packedMat') return packed;
  if (n.constructor.name === 'ConvertNode') return scalar(n.node, packed);
  if (n.isVaryingNode || n.isSubBuildNode) return scalar(n.node, packed);
  if (n.constructor.name === 'SplitNode') {
    const source = n.node as GraphNode;
    if (source.method !== 'unpack4xU8') throw new Error('Unexpected split source');
    const shift = 'xyzw'.indexOf(String(n.components)) * 8;
    return (scalar(source.aNode, packed) >>> shift) & 255;
  }
  const a = scalar(n.aNode, packed);
  const b = scalar(n.bNode, packed);
  if (n.method === 'clamp') return Math.min(scalar(n.cNode, packed), Math.max(b, a));
  switch (n.op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
    case '>>': return a >>> b;
    case '&': return a & b;
    case '==': return Number(a === b);
    case '||': return Number(Boolean(a || b));
    default: throw new Error(`Unsupported scalar node: ${n.constructor.name} ${n.op ?? n.method}`);
  }
}

function graphNodes(root: unknown): GraphNode[] {
  const seen = new Set<GraphNode>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const n = value as GraphNode;
    if (!n.isNode || seen.has(n)) return;
    seen.add(n);
    for (const child of Object.values(n)) {
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  };
  visit(root);
  return [...seen];
}

describe('terrain shader input contracts', () => {
  it('reuses every shader output across world profiles, with real roughness response and zero vacuum haze', () => {
    const handle = createTerrainMaterial();
    const material = handle.material;
    const outputs = [material.colorNode, material.normalNode, material.roughnessNode, material.emissiveNode];
    const haze = graphNodes(material.colorNode).find(n => n.isUniformNode && n.value === .55)!;
    expect(haze).toBeDefined();
    const version = material.version;
    for (const cfg of buildSolarSystemConfigs('material-profiles')) {
      handle.applyPlanetConfig(cfg);
      const p = planetVisualProfile(cfg).surface;
      const rock = encodePackedMat(MAT.ROCK, false, false, false, 1);
      expect(scalar(material.roughnessNode, rock)).toBeCloseTo(p.roughness - p.wetResponse);
      expect(haze.value).toBe(cfg.atmosphere.density > .001 ? p.haze : 0);
      expect([material.colorNode, material.normalNode, material.roughnessNode, material.emissiveNode]).toEqual(outputs);
      expect(material.version).toBe(version);
    }
    material.dispose();
  });
  it('converts packed metadata before rasterization and shares a flat varying across material outputs', () => {
    const { material } = createTerrainMaterial();
    const packed = graphNodes(material.colorNode).find((n) => n.name === 'vPackedMaterial');
    expect(packed?.isVaryingNode).toBe(true);
    expect(packed?.interpolationType).toBe('flat');
    const vertexNodes = graphNodes(packed!.node);
    expect(vertexNodes.some((n) => n._attributeName === 'packedMat')).toBe(true);
    expect(vertexNodes.some((n) => n.constructor.name === 'ConvertNode' && n.convertTo === 'uint')).toBe(true);
    for (const output of [material.roughnessNode, material.metalnessNode, material.emissiveNode]) {
      expect(graphNodes(output)).toContain(packed);
    }
    material.dispose();
  });

  it('applies the linear vertex palette once', () => {
    const { material } = createTerrainMaterial();
    expect(graphNodes(material.colorNode).some((n) => n._attributeName === 'color')).toBe(true);
    // Three multiplies the colorNode by the color attribute again when this is true.
    expect(material.vertexColors).toBe(false);
    material.dispose();
  });

  it('decodes moisture independently of wall, pentagon and flora flags', () => {
    const { material } = createTerrainMaterial();
    for (const moisture of [0, 0.5, 1]) {
      const expected = 0.88 - Math.round(moisture * 31) / 31 * 0.32;
      for (let flags = 0; flags < 8; flags++) {
        const packed = new Float32Array([
          encodePackedMat(MAT.ROCK, !!(flags & 1), !!(flags & 2), !!(flags & 4), moisture),
        ])[0];
        expect(scalar(material.roughnessNode, packed)).toBeCloseTo(expected, 8);
      }
    }
    material.dispose();
  });

  it('gives crystal a distinct material response despite the unused fourth packed byte', () => {
    const { material } = createTerrainMaterial();
    const rock = encodePackedMat(MAT.ROCK, false, false, false, 0);
    const crystal = encodePackedMat(MAT.CRYSTAL, false, false, false, 0);
    expect(crystal >>> 24).toBe(0);
    expect(scalar(material.metalnessNode, rock)).toBe(0);
    expect(scalar(material.metalnessNode, crystal)).toBeCloseTo(0.38);
    expect(scalar(material.roughnessNode, crystal)).toBeLessThan(scalar(material.roughnessNode, rock));
    material.dispose();
  });

  it('updates the existing planet-origin uniform shared by color and emissive noise', () => {
    const handle = createTerrainMaterial();
    handle.setCameraOrigin(123, -456, 789);
    const colorNodes = graphNodes(handle.material.colorNode);
    const origin = colorNodes.find((n) => n.value instanceof THREE.Vector3 && n.value.equals(new THREE.Vector3(123, -456, 789)));
    expect(origin).toBeDefined();
    expect(graphNodes(handle.material.emissiveNode)).toContain(origin);
    handle.setCameraOrigin(-10, 20, 900);
    expect((origin!.value as THREE.Vector3).toArray()).toEqual([-10, 20, 900]);
    handle.material.dispose();
  });
});
