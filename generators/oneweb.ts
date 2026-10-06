// OneWeb Gen 1, on Airbus's Arrow bus. In the frame build.yaml describes: +Z velocity,
// +Y zenith, +X port, metres.
//
// "147.5 kg", with "Two TTC omni antennas ; two Ku-band antennas ; two Ka-band
// antennas" (Arianespace/Starsem ST28 launch kit), "reaction wheels, solar array drive
// motors, and gateway antennas" (OneWeb's orbital debris plan, FCC
// SAT-LOI-20160428-00041). The body is about 1 × 1 × 1.3 m (eoPortal) and spans 5 m
// with its arrays (GCAT). Its trapezoidal section, the two finned Ku user antennas,
// the gold Ka dishes beneath them and the single panel per wing, stowed on the sloping
// sides, are read off launch-stack photos (Spaceflight Now, 2020). Which way the
// 1.3 m axis points along the track is not published; the booms on the sloping sides
// put the arrays across it.

import type { Document } from "@gltf-transform/core";

import { addDish, addThruster, addTrapezoidBody, addWings, material } from "./assembly.ts";
import { Model } from "./parts.ts";

/**
 * The antenna face, 1.0 m wide, looks at the Earth; the zenith face is about 0.7 m
 * wide and 0.9 m above it, as the stack photos measure.
 */
export function oneweb(): Document {
  const model = new Model();
  const body = { nadirWidth: 1.0, zenithWidth: 0.7, height: 0.9, length: 1.3 };
  const half = body.height / 2;
  addTrapezoidBody(model, "body", material(model, "gold"), body);
  model.box("radiator", material(model, "white"), [body.zenithWidth - 0.05, 0.02, body.length - 0.05], { at: [0, half + 0.01, 0] });

  // Two Ku user antennas, polished boxes of vertical fins along the velocity.
  const polished = material(model, "polished");
  const [kuLength, kuZ] = [0.55, 0.12];
  for (const side of [1, -1]) {
    const x = side * 0.23;
    model.box(`ku-${side}`, polished, [0.42, 0.04, kuLength], { at: [x, -half - 0.02, kuZ] });
    for (let fin = 0; fin < 7; fin++) {
      model.box(`ku-${side}-fin-${fin}`, polished, [0.012, 0.1, kuLength], { at: [x - 0.18 + fin * 0.06, -half - 0.09, kuZ] });
    }
  }
  // Two steerable Ka gateway dishes, on arms from behind the Ku antennas' trailing end.
  const trailing = kuZ - kuLength / 2;
  for (const side of [1, -1]) {
    addDish(model, `ka-${side}`, "gold", 0.175, [side * 0.3, -half - 0.2, trailing - 0.15], "-y", [side * 0.2, -half, trailing - 0.05]);
  }
  addThruster(model, body.length / 2, -1, 0.06);

  // One panel per wing, about 0.9 × 1.3 m, on a 1.15 m boom from mid-height of each
  // sloping side: a 5.0 m span.
  addWings(model, { array: { span: 0.9, width: body.length, columns: 1, rows: 1 }, edge: (body.nadirWidth + body.zenithWidth) / 4, yoke: 1.15 });
  return model.doc;
}
