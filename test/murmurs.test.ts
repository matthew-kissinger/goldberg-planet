import { describe, expect, it } from 'vitest';
import {
  MURMUR_SITES_PER_WINDOW,
  MURMUR_WINDOW_MINUTES,
  murmurProfile,
  murmurSites,
  nearestMurmurSite,
  normalizeMurmurObservations,
  observeMurmur,
  type MurmurSite,
} from '../src/sim/murmurs';

function site(id: number, tile: number, observed = false): MurmurSite {
  const profile = murmurProfile('windThread');
  return {
    id,
    day: 0,
    window: 0,
    slot: id,
    tile,
    kind: profile.kind,
    label: profile.label,
    detail: profile.detail,
    note: profile.note,
    hint: profile.hint,
    active: true,
    observed,
    minutesRemaining: MURMUR_WINDOW_MINUTES,
  };
}

describe('World Murmurs', () => {
  it('generates deterministic active sites per time window', () => {
    const a = murmurSites('murmur-seed', 2, 12, 500, new Set());
    const b = murmurSites('murmur-seed', 2, 12, 500, new Set());
    const nextWindow = murmurSites('murmur-seed', 2, MURMUR_WINDOW_MINUTES + 12, 500, new Set());

    expect(a).toHaveLength(MURMUR_SITES_PER_WINDOW);
    expect(b).toEqual(a);
    expect(a.every((entry) => entry.active)).toBe(true);
    expect(a.map((entry) => entry.id)).not.toEqual(nextWindow.map((entry) => entry.id));
    expect(a.every((entry) => entry.tile >= 0 && entry.tile < 500)).toBe(true);
  });

  it('chooses the nearest local unobserved site in tile order', () => {
    const sites = [site(10, 44), site(11, 22), site(12, 8, true)];
    expect(nearestMurmurSite([8, 22, 44], sites)).toMatchObject({ id: 11, tile: 22 });
    expect(nearestMurmurSite([8], sites)).toBeNull();
    expect(nearestMurmurSite([44], sites.map((entry) => ({ ...entry, active: false })))).toBeNull();
  });

  it('records observations and refreshes generated site state', () => {
    const observed = new Set<number>();
    const first = murmurSites('observation-seed', 0, 30, 500, observed)[0];
    const result = observeMurmur(observed, first);

    expect(result).toMatchObject({
      ok: true,
      firstObservation: true,
      message: expect.stringContaining(first.label),
    });
    expect(observed.has(first.id)).toBe(true);

    const refreshed = murmurSites('observation-seed', 0, 30, 500, observed).find((entry) => entry.id === first.id);
    expect(refreshed?.observed).toBe(true);
    expect(observeMurmur(observed, refreshed!)).toMatchObject({
      ok: false,
      firstObservation: false,
      message: `${first.label} already noted`,
    });
  });

  it('normalizes saved observation ids', () => {
    expect(normalizeMurmurObservations([3, -1, 2.8, 3, Number.NaN, 'nope'])).toEqual([2, 3]);
    expect(normalizeMurmurObservations(null)).toEqual([]);
  });
});
