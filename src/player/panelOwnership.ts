export type ActivePanel = 'crafting' | 'storage';

export interface PanelOwnershipState {
  craftingOpen: boolean;
  storageOpen: boolean;
}

export interface PanelOwnershipSnapshot extends PanelOwnershipState {
  activePanel: ActivePanel | null;
  worldInputBlocked: boolean;
}

export function activePanelForState(state: PanelOwnershipState): ActivePanel | null {
  if (state.storageOpen) return 'storage';
  if (state.craftingOpen) return 'crafting';
  return null;
}

export function worldInputBlockedByPanel(state: PanelOwnershipState): boolean {
  return activePanelForState(state) !== null;
}

export function panelOwnershipSnapshot(state: PanelOwnershipState): PanelOwnershipSnapshot {
  const activePanel = activePanelForState(state);
  return {
    ...state,
    activePanel,
    worldInputBlocked: activePanel !== null,
  };
}
