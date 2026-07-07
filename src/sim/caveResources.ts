import type { MaterialItemId } from './crafting';
import type { NaturalVoidKind, NaturalVoidSample } from '../world/caves';

export interface CaveResourceColumns {
  naturalVoidAt(tile: number, layer: number): NaturalVoidSample | null;
}

export interface CaveResourceDrop {
  item: 'glowCrystal';
  amount: number;
  caveKind: Exclude<NaturalVoidKind, 'arch'>;
  depth: number;
  label: string;
}

type CrystalCaveSample = NaturalVoidSample & { kind: Exclude<NaturalVoidKind, 'arch'> };

function isCrystalCaveSample(sample: NaturalVoidSample | null): sample is CrystalCaveSample {
  return !!sample && sample.kind !== 'arch';
}

export function caveResourceAt(
  columns: CaveResourceColumns,
  tile: number,
  layer: number,
  material: MaterialItemId,
): CaveResourceDrop | null {
  if (material !== 'rock') return null;
  const samples = [
    columns.naturalVoidAt(tile, layer - 1),
    columns.naturalVoidAt(tile, layer + 1),
  ].filter(isCrystalCaveSample);
  if (samples.length === 0) return null;
  const sample = samples.sort((a, b) => b.depth - a.depth)[0];
  const amount = sample.kind === 'dryCave' ? 2 : 1;
  return {
    item: 'glowCrystal',
    amount,
    caveKind: sample.kind,
    depth: sample.depth,
    label: `${sample.kind === 'dryCave' ? 'dry cave' : 'sea cave'} glow crystal ${amount}`,
  };
}
