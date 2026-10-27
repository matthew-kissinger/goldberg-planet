import { describe, expect, it } from 'vitest';
import { applyAxisDeadzone, applyRadialDeadzone, gamepadFrameFromState, type GamepadButtonLike, type GamepadLike } from '../src/player/gamepad';

function buttons(down: number[] = [], values: Record<number, number> = {}): GamepadButtonLike[] {
  return Array.from({ length: 16 }, (_, i) => ({
    pressed: down.includes(i),
    value: values[i] ?? (down.includes(i) ? 1 : 0),
  }));
}

function pad(axes: number[], down: number[] = [], values: Record<number, number> = {}): GamepadLike {
  return { id: 'test pad', mapping: 'standard', connected: true, axes, buttons: buttons(down, values) };
}

describe('gamepad controls', () => {
  it('applies axis and radial deadzones with rescaling', () => {
    expect(applyAxisDeadzone(0.1)).toBe(0);
    expect(applyAxisDeadzone(1)).toBe(1);
    expect(applyAxisDeadzone(-1)).toBe(-1);
    const stick = applyRadialDeadzone(0.7, 0);
    expect(stick.x).toBeGreaterThan(0.6);
    expect(stick.y).toBeCloseTo(0);
    expect(stick.magnitude).toBeGreaterThan(0.6);
  });

  it('maps standard sticks to move and look frames', () => {
    const frame = gamepadFrameFromState(pad([0.5, -1, 0.5, 0.25]), [], 1 / 60);
    expect(frame.active).toBe(true);
    expect(frame.moveX).toBeGreaterThan(0.35);
    expect(frame.moveY).toBeGreaterThan(0.9);
    expect(frame.lookX).toBeGreaterThan(0);
    expect(frame.lookY).toBeGreaterThan(0);
  });

  it('emits chop and craft edges once while held chop keeps repeating', () => {
    const first = gamepadFrameFromState(pad([0, 0, 0, 0], [2, 3]), [], 1 / 60);
    expect(first.chop).toBe(true);
    expect(first.chopPressed).toBe(true);
    expect(first.craft).toBe(true);
    const previous = buttons([2, 3]).map((b) => !!b.pressed || (b.value ?? 0) > 0.55);
    const held = gamepadFrameFromState(pad([0, 0, 0, 0], [2, 3]), previous, 1 / 60);
    expect(held.chop).toBe(true);
    expect(held.chopPressed).toBe(false);
    expect(held.craft).toBe(false);
  });

  it('treats the right trigger as chop', () => {
    const frame = gamepadFrameFromState(pad([0, 0, 0, 0], [], { 7: 1 }), [], 1 / 60);
    expect(frame.chop).toBe(true);
    expect(frame.chopPressed).toBe(true);
  });

  it('maps Start to the plane and A/B to panel confirm/cancel edges', () => {
    const first = gamepadFrameFromState(pad([0, 0, 0, 0], [0, 1, 9]), [], 1 / 60);
    expect(first.plane).toBe(true);
    expect(first.confirm).toBe(true);
    expect(first.cancel).toBe(true);
    expect(first.jump).toBe(true);
    const previous = buttons([0, 1, 9]).map((b) => !!b.pressed || (b.value ?? 0) > 0.55);
    const held = gamepadFrameFromState(pad([0, 0, 0, 0], [0, 1, 9]), previous, 1 / 60);
    expect(held.plane).toBe(false);
    expect(held.confirm).toBe(false);
    expect(held.jump).toBe(true);
  });

  it('uses LB as the zoom and diagnostics modifier', () => {
    const zoom = gamepadFrameFromState(pad([0, 0, 0, 0.8], [4]), [], 1 / 60);
    expect(zoom.zoom).toBeGreaterThan(0.5);
    expect(zoom.lookY).toBe(0);
    expect(gamepadFrameFromState(pad([0, 0, 0, 0], [4, 11]), [], 1 / 60).diag).toBe(true);
    expect(gamepadFrameFromState(pad([0, 0, 0, 0], [11]), [], 1 / 60).help).toBe(true);
  });
});
