// O3b, both generations, in equatorial MEO. In the frame build.yaml describes:
// +Z velocity, +Y zenith, +X port, metres.
//
// First generation (Thales Alenia Space): 700 kg, "7.72 m. x 3.2 m. x 1.7 m." deployed
// and "12 steerable antennas" (Arianespace VS05 and VS22 launch kits). The dishes are
// in two rows of six on the Earth face and the three-panel wings come off the long
// sides, as Arianespace's renders show; the panel sizes fit the 7.72 m span.
//
// O3b mPOWER (Boeing 702X): about 1,700 kg and a 27 m span (GCAT). Boeing's delivery
// photos of F11 to F13 (September 2026) stack the satellites with their stowed wings
// between them, so the wings hinge from the faces whose edge with the Earth face is
// the long one, and the two octagonal phased arrays sit side by side along that long
// side, across the wing axis, as SES's desk model also shows. On that model each wing
// is four panels about as wide as the box is long, on V-yokes that meet at one point
// on the body; the sizes are estimated from those photos and renders.

import type { Document } from "@gltf-transform/core";

import { addDish, addWings, material } from "./assembly.ts";
import { Model } from "./parts.ts";

/** First generation: a gold box with twelve Earth-facing dishes and two wings. */
export function o3b(): Document {
  const model = new Model();
  const [width, height, length] = [1.7, 1.3, 3.2];
  const underside = -height / 2;
  model.box("body", material(model, "gold"), [width, height, length], { at: [0, 0, 0] });
  // Two rows of six, each dish on a short gimbal post.
  for (const x of [-0.45, 0.45]) {
    for (let i = 0; i < 6; i++) {
      const z = -1.25 + i * 0.5;
      addDish(model, `dish-${x}-${i}`, "white", 0.175, [x, underside - 0.15, z], "-y", [x, underside, z]);
    }
  }
  addWings(model, { array: { span: 2.7, width: 1.8, columns: 1, rows: 3 }, edge: width / 2, yoke: 0.3 });
  return model.doc;
}

/** mPOWER: a flat black box, two phased arrays, and two long wings on V-yokes. */
export function o3bMpower(): Document {
  const model = new Model();
  const [width, height, length] = [1.3, 2.5, 2.8];
  model.box("body", material(model, "blackMli"), [width, height, length], { at: [0, 0, 0] });
  const polished = material(model, "polished");
  model.cylinder("phased-array-large", polished, 0.55, 0.1, 8, { at: [0, -height / 2 - 0.05, 0.65] });
  model.cylinder("phased-array-small", polished, 0.4, 0.1, 8, { at: [0, -height / 2 - 0.05, -0.65] });
  addWings(model, { array: { span: 12.2, width: 2.7, columns: 1, rows: 4 }, edge: width / 2, yoke: 0.7, spread: [0.1, 1.2] });
  return model.doc;
}
