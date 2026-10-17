// Amazon Kuiper (Amazon Leo) production satellites. In the frame build.yaml describes:
// +Z velocity, +Y zenith, +X port, metres.
//
// Amazon publishes almost nothing about the satellite's shape, so much of this is
// estimated. What is sourced: "nadir pointing" and a "0.45 m" parabolic gateway
// antenna (FCC SAT-LOA-20190704-00057, technical appendix); a body "coated in a
// dielectric mirror film" (Amazon, on KA-01); and one long solar wing of dark cells,
// two cells across, in Amazon's on-orbit images (Arianespace's VA267 launch kit).
// Mallama et al. (arXiv 2601.07708, fig. 4 and §5) draw three antenna panels, folded
// at launch, that deploy around the chassis into a large nadir-facing panel, partly
// mirror-faced: two hinged on the chassis's long edges and one on a short end; and the
// array on a short mast at the other end, reaching both ways across the panel row.
// The authors call the figure their own, not "completely accurate". The deployed
// panels also account for the prototypes' area-to-mass ratio, 0.04462 m²/kg, some
// 27 m² at about 600 kg. The 1.8 × 0.7 m body is GCAT's estimate; the 0.7 × 1.8 m side
// panels, the 1.0 × 1.2 m end panel, the 10 × 2 m array and its 0.3 m mast are sized
// to the figure's and the images' proportions. Amazon says
// production satellites improved "every system and sub-system", phased arrays
// included, so the prototypes' three gateway antennas may not hold for them.

import type { Document } from "@gltf-transform/core";

import { addArray, addDish, addThruster, material } from "./assembly.ts";
import { Model } from "./parts.ts";

/** A mirror-filmed chassis, its three deployed antenna panels, three gateway dishes, and the array. */
export function kuiper(): Document {
  const model = new Model();
  const [width, height, length] = [0.7, 0.4, 1.8];
  const underside = -height / 2;
  const mirror = material(model, "mirror");
  model.box("body", mirror, [width, height, length], { at: [0, 0, 0] });
  // The deployed antenna panels around the chassis, phased-array tiles on mirror-faced
  // panels: one on each long edge, one off the leading end; the chassis's own underside
  // carries tiles too.
  const tiles = material(model, "phasedArray");
  model.box("chassis-array", tiles, [0.5, 0.01, 1.4], { at: [0, underside - 0.005, 0] });
  for (const side of [1, -1]) {
    model.box(`panel-${side}`, mirror, [0.68, 0.04, 1.8], { at: [side * 0.7, underside - 0.02, 0] });
    model.box(`panel-${side}-array`, tiles, [0.5, 0.01, 1.4], { at: [side * 0.7, underside - 0.045, 0] });
  }
  model.box("panel-end", mirror, [1.0, 0.04, 1.2], { at: [0, underside - 0.02, length / 2 + 0.62] });
  model.box("panel-end-array", tiles, [0.8, 0.01, 1.0], { at: [0, underside - 0.045, length / 2 + 0.62] });
  // Beyond the panels' outline, on short arms.
  const dishes: Array<[number, number]> = [
    [-1, 0.6],
    [1, 0.6],
    [0, -1.15],
  ];
  for (const [i, [x, z]] of dishes.entries()) {
    // The side dishes hang from the panels' outer edges, the aft one from the chassis end.
    const mount: [number, number, number] = x === 0 ? [0, underside, -length / 2] : [x * 1.04, underside - 0.04, z];
    addDish(model, `gateway-${i}`, "white", 0.225, [x * 1.3, underside - 0.25, z], "-y", mount);
  }
  addThruster(model, length / 2, -1, 0.07);
  // The array across the track, centred on a short mast at the trailing end, turning
  // about its length to follow the Sun.
  const mast = 0.3;
  const [y, z] = [height / 2 + mast, -length / 2 + 0.1];
  model.box("array-mast", material(model, "aluminium"), [0.06, mast, 0.06], { at: [0, height / 2 + mast / 2, z] });
  for (const side of [1, -1] as const) {
    addArray(model, `array-${side}`, { span: 5, width: 2, columns: 2, rows: 5 }, [0, y, z], side);
  }
  return model.doc;
}
