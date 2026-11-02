import { expect, it } from 'vitest';
import { nearPlaneForView } from '../src/game/cameraRig';

it('reserves foreground depth on foot and in a skiff, with greater precision from orbit', () => {
  expect(nearPlaneForView(5.2, 5.2)).toBe(.5);
  expect(nearPlaneForView(4200, 4200)).toBe(20);
  // An orbital flight still has a skiff close to the chase camera.
  expect(nearPlaneForView(4200, 15)).toBe(2.25);
  expect(nearPlaneForView(4200, 1.65)).toBe(.5);
});
