import { describe, expect, it } from 'vitest';
import { strangerSeasonForecast } from '../src/sim/eventSeasons';

describe('stranger event seasons', () => {
  it('forecasts the current and next Skyfall/Murmur overlap windows', () => {
    const forecast = strangerSeasonForecast('season-seed', 1, 355, 1000, new Set(), new Set(), 3);

    expect(forecast).toHaveLength(3);
    expect(forecast[0]).toMatchObject({
      index: 0,
      day: 1,
      minute: 355,
      startsInMinutes: 0,
      urgency: 'now',
      focus: 'split',
      unobservedMurmurs: 3,
    });
    expect(forecast[0].skyfall?.active).toBe(true);
    expect(forecast[0].murmurs).toHaveLength(3);
    expect(forecast[0].label).toContain('/');
    expect(forecast[0].tradeoff).toContain('or 3 notes');
    expect(forecast[0].routeHint).toContain('choose whether');
    expect(forecast[0].chain).toMatchObject({
      fallClaimed: false,
      notesObserved: 0,
      notesTotal: 3,
      linked: false,
      fullChord: false,
      stage: 'unstarted',
    });

    expect(forecast[1]).toMatchObject({
      index: 1,
      day: 1,
      minute: 360,
      startsInMinutes: 5,
      urgency: 'soon',
    });
  });

  it('goes quiet when the overlapping fall and murmurs are already known', () => {
    const open = strangerSeasonForecast('season-complete', 0, 40, 1000, new Set(), new Set(), 1)[0];
    const harvested = new Set(open.skyfall ? [open.skyfall.id] : []);
    const observed = new Set(open.murmurs.map((site) => site.id));
    const quiet = strangerSeasonForecast('season-complete', 0, 40, 1000, harvested, observed, 1)[0];

    expect(quiet.focus).toBe('quiet');
    expect(quiet.unobservedMurmurs).toBe(0);
    expect(quiet.skyfall?.harvested).toBe(true);
    expect(quiet.detail).toContain('0/3 unnoted murmurs');
    expect(quiet.tradeoff).toBe('all known in this window');
    expect(quiet.routeHint).toBe('use this as a travel window or rest at home');
    expect(quiet.chain).toMatchObject({
      fallClaimed: true,
      notesObserved: 3,
      linked: true,
      fullChord: true,
      stage: 'fullChord',
      payoffLabel: 'full season chord',
    });
    expect(quiet.chain.payoffDetail).toContain('one route memory');
  });

  it('links a season chain after the fall and at least one overlapping note', () => {
    const open = strangerSeasonForecast('season-link', 0, 40, 1000, new Set(), new Set(), 1)[0];
    const harvested = new Set(open.skyfall ? [open.skyfall.id] : []);
    const observed = new Set([open.murmurs[0].id]);
    const linked = strangerSeasonForecast('season-link', 0, 40, 1000, harvested, observed, 1)[0];

    expect(linked.focus).toBe('listening');
    expect(linked.chain).toMatchObject({
      fallClaimed: true,
      notesObserved: 1,
      notesTotal: 3,
      linked: true,
      fullChord: false,
      stage: 'linked',
      payoffLabel: 'season link',
    });
    expect(linked.chain.progressLabel).toBe('fall claimed + 1/3 notes');
    expect(linked.chain.routeEffect).toContain('linked season route');
  });

  it('rolls future windows across the next day without losing the countdown', () => {
    const forecast = strangerSeasonForecast('season-rollover', 0, 1435, 1000, new Set(), new Set(), 2);

    expect(forecast[0]).toMatchObject({ day: 0, minute: 1435, startsInMinutes: 0 });
    expect(forecast[1]).toMatchObject({ day: 1, minute: 0, startsInMinutes: 5, urgency: 'soon' });
  });

  it('returns no forecast for an empty planet', () => {
    expect(strangerSeasonForecast('empty', 0, 0, 0, new Set(), new Set())).toEqual([]);
  });
});
