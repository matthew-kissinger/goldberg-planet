import { describe, expect, it } from 'vitest';
import { GamepadControls, applyAxisDeadzone, applyRadialDeadzone, gamepadFrameFromState, type GamepadButtonLike, type GamepadLike } from '../src/player/gamepad';

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

  it('emits edges only once for mine, place, and craft actions', () => {
    const first = gamepadFrameFromState(pad([0, 0, 0, 0], [2, 3], { 7: 1 }), [], 1 / 60);
    expect(first.mine).toBe(true);
    expect(first.minePressed).toBe(true);
    expect(first.place).toBe(true);
    expect(first.placePressed).toBe(true);
    expect(first.craft).toBe(true);
    const held = gamepadFrameFromState(pad([0, 0, 0, 0], [2, 3], { 7: 1 }), buttons([2, 3], { 7: 1 }).map((b) => !!b.pressed || (b.value ?? 0) > 0.55), 1 / 60);
    expect(held.mine).toBe(true);
    expect(held.minePressed).toBe(false);
    expect(held.place).toBe(true);
    expect(held.placePressed).toBe(false);
    expect(held.craft).toBe(false);
  });

  it('uses LB as a route and pack modifier instead of hotbar cycling', () => {
    const lbRight = gamepadFrameFromState(pad([0, 0, 0, 0], [4, 15]), [], 1 / 60);
    expect(lbRight.pin).toBe(true);
    expect(lbRight.slotDelta).toBe(0);
    const lbLeft = gamepadFrameFromState(pad([0, 0, 0, 0], [4, 14]), [], 1 / 60);
    expect(lbLeft.clearPin).toBe(true);
    expect(lbLeft.slotDelta).toBe(0);
    const pack = gamepadFrameFromState(pad([0, 0, 0, 0], [1, 4]), [], 1 / 60);
    expect(pack.pack).toBe(true);
    expect(pack.use).toBe(false);
  });

  it('cycles hotbar on unmodified D-pad left and right', () => {
    expect(gamepadFrameFromState(pad([0, 0, 0, 0], [15]), [], 1 / 60).slotDelta).toBe(1);
    expect(gamepadFrameFromState(pad([0, 0, 0, 0], [14]), [], 1 / 60).slotDelta).toBe(-1);
  });

  it('keeps injected edge actions one-shot while continuous input persists', () => {
    const controls = new GamepadControls();
    controls.inject({ moveX: 0.75, craft: true, slotDelta: 1, mine: true, minePressed: true }, 3);
    const first = controls.frame(1 / 60);
    const second = controls.frame(1 / 60);
    const third = controls.frame(1 / 60);

    expect(first.moveX).toBeCloseTo(0.75);
    expect(first.craft).toBe(true);
    expect(first.slotDelta).toBe(1);
    expect(first.mine).toBe(true);
    expect(first.minePressed).toBe(true);

    expect(second.moveX).toBeCloseTo(0.75);
    expect(second.craft).toBe(false);
    expect(second.slotDelta).toBe(0);
    expect(second.mine).toBe(true);
    expect(second.minePressed).toBe(false);

    expect(third.moveX).toBeCloseTo(0.75);
    expect(third.craft).toBe(false);
    expect(third.mine).toBe(true);
  });
});
