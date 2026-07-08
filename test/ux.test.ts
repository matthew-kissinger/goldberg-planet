import { describe, expect, it } from 'vitest';
import { activePanelForState, panelOwnershipSnapshot, worldInputBlockedByPanel } from '../src/player/panelOwnership';
import { classifyUx } from '../src/player/ux';

describe('adaptive UX profile', () => {
  it('classifies touch phones as compact bottom-sheet layouts', () => {
    const ux = classifyUx({ width: 390, height: 844, coarse: true, hasTouch: true, touchEnabled: true, gamepadActive: false });
    expect(ux.device).toBe('phone');
    expect(ux.inputMode).toBe('touch');
    expect(ux.orientation).toBe('portrait');
    expect(ux.compact).toBe(true);
    expect(ux.panelMode).toBe('bottom-sheet');
    expect(ux.touchTargetPx).toBe(58);
  });

  it('keeps tablet portrait panels roomy but stacked', () => {
    const ux = classifyUx({ width: 820, height: 1180, coarse: true, hasTouch: true, touchEnabled: true, gamepadActive: false });
    expect(ux.device).toBe('tablet');
    expect(ux.orientation).toBe('portrait');
    expect(ux.panelMode).toBe('bottom-sheet');
    expect(ux.touchTargetPx).toBe(64);
  });

  it('treats short non-touch displays as laptop layouts', () => {
    const ux = classifyUx({ width: 1280, height: 720, coarse: false, hasTouch: false, touchEnabled: false, gamepadActive: false });
    expect(ux.device).toBe('laptop');
    expect(ux.inputMode).toBe('keyboard-mouse');
    expect(ux.panelMode).toBe('corner');
  });

  it('prioritizes active gamepad mode on desktop', () => {
    const ux = classifyUx({ width: 1920, height: 1080, coarse: false, hasTouch: false, touchEnabled: false, gamepadActive: true });
    expect(ux.device).toBe('desktop');
    expect(ux.inputMode).toBe('gamepad');
    expect(ux.summary).toContain('gamepad');
  });

  it('reports hybrid mode when touch and gamepad are both active', () => {
    const ux = classifyUx({ width: 1024, height: 768, coarse: true, hasTouch: true, touchEnabled: true, gamepadActive: true });
    expect(ux.device).toBe('tablet');
    expect(ux.inputMode).toBe('hybrid');
    expect(ux.panelMode).toBe('split');
  });
});

describe('panel ownership', () => {
  it('leaves world input open when no panel is active', () => {
    const state = { craftingOpen: false, storageOpen: false };
    expect(activePanelForState(state)).toBeNull();
    expect(worldInputBlockedByPanel(state)).toBe(false);
    expect(panelOwnershipSnapshot(state)).toMatchObject({ activePanel: null, worldInputBlocked: false });
  });

  it('blocks world input for each panel owner', () => {
    expect(panelOwnershipSnapshot({ craftingOpen: true, storageOpen: false })).toMatchObject({ activePanel: 'crafting', worldInputBlocked: true });
    expect(panelOwnershipSnapshot({ craftingOpen: false, storageOpen: true })).toMatchObject({ activePanel: 'storage', worldInputBlocked: true });
  });

  it('uses deterministic close-priority ownership when legacy states overlap', () => {
    const state = { craftingOpen: true, storageOpen: true };
    expect(panelOwnershipSnapshot(state)).toMatchObject({
      activePanel: 'storage',
      worldInputBlocked: true,
      craftingOpen: true,
      storageOpen: true,
    });
  });
});
