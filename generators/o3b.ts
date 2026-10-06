// O3b, both generations, in equatorial MEO. In the frame build.yaml describes:
// +Z velocity, +Y zenith, +X port, metres.
//
// First generation (Thales Alenia Space): 700 kg, "7.72 m. x 3.2 m. x 1.7 m." deployed
// and "12 steerable antennas" (Arianespace VS05 and VS22 launch kits). The dishes are
// in two rows of six on the Earth face and the three-panel wings come off the long
// sides, as Arianespace's renders show; the panel sizes fit the 7.72 m span.
//
// O3b mPOWER (Boeing 702X): about 1,700 kg and a 27 m span (GCAT). The flat box, the
// two octagonal phased arrays side by side along the wing axis (Boeing's factory
// photo) and the five-panel wings on V-yokes are estimated from photos and renders.

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
  const [width, height, length] = [2.8, 2.5, 1.3];
  model.box("body", material(model, "blackMli"), [width, height, length], { at: [0, 0, 0] });
  const polished = material(model, "polished");
  model.cylinder("phased-array-large", polished, 0.55, 0.1, 8, { at: [0.65, -height / 2 - 0.05, 0] });
  model.cylinder("phased-array-small", polished, 0.4, 0.1, 8, { at: [-0.65, -height / 2 - 0.05, 0] });
  addWings(model, { array: { span: 11.5, width: 1.2, columns: 1, rows: 5 }, edge: width / 2, yoke: 0.7, spread: [0.9, 0.1] });
  return model.doc;
}
