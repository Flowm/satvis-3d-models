// Amazon Kuiper (Amazon Leo) production satellites. In the frame build.yaml describes:
// +Z velocity, +Y zenith, +X port, metres.
//
// Amazon publishes almost nothing about the satellite's shape, so most of this is
// estimated. What is sourced: "nadir pointing" and a "0.45 m" parabolic gateway
// antenna (FCC SAT-LOA-20190704-00057, technical appendix); three phased arrays,
// three gateway antennas, yaw steering and a krypton Hall thruster on the prototypes
// (FCC experimental narrative); and one long solar wing of dark cells, two cells
// across, in Amazon's own on-orbit images (Arianespace VA267 launch kit; Mallama et
// al., arXiv 2601.07708). The 1.8 × 0.7 m body is GCAT's estimate, and the 10 × 2 m wing
// is sized to the images' proportions. The prototypes' area-to-mass ratio, 0.04462
// m²/kg, or some 27 m² at about 600 kg, suggests a larger area still, which the images
// do not bear out.

import type { Document } from "@gltf-transform/core";

import { addDish, addThruster, addWings, material } from "./assembly.ts";
import { Model } from "./parts.ts";

/** A box body with three phased arrays and three gateway dishes below, and one wing. */
export function kuiper(): Document {
  const model = new Model();
  const [width, height, length] = [0.7, 0.4, 1.8];
  const underside = -height / 2;
  model.box("body", material(model, "white"), [width, height, length], { at: [0, 0, 0] });
  model.box("mirror", material(model, "mirror"), [width, 0.01, length], { at: [0, underside - 0.005, 0] });
  // Three arrays of about 0.6 m, the aperture a 39 dBi, 1.8° beam implies.
  for (const [i, z] of [-0.6, 0, 0.6].entries()) {
    model.box(`phased-array-${i}`, material(model, "phasedArray"), [0.6, 0.03, 0.55], { at: [0, underside - 0.025, z] });
  }
  const dishes: Array<[number, number]> = [
    [-1, 1],
    [-1, -1],
    [1, -1],
  ];
  for (const [i, [x, z]] of dishes.entries()) {
    addDish(model, `gateway-${i}`, "white", 0.225, [x * (width / 2 + 0.3), underside - 0.15, z * 0.75], "-y", [x * (width / 2), underside, z * 0.6]);
  }
  addThruster(model, length / 2, -1, 0.07);
  // One wing across the track, rotating about its length to follow the Sun.
  addWings(model, { array: { span: 10, width: 2, columns: 2, rows: 10 }, edge: width / 2, yoke: 0.8, sides: [1] });
  return model.doc;
}
