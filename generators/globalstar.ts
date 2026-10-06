// Globalstar second generation (Thales Alenia Space). In the frame build.yaml
// describes: +Z velocity, +Y zenith, +X port, metres.
//
// About 700 kg, a "trapezoidal main body with two solar arrays", its antennas on "the
// Earth deck, which is the larger of the two rectangular faces" (Arianespace press
// kit); "two deployable, three segment solar arrays" (Spaceflight101). No dimensions
// are published: GCAT's row is a copy of O3b's. The body, the two octagonal phased
// arrays and the C-band antenna are sized from renders, the wings to GCAT's 12 m.

import type { Document } from "@gltf-transform/core";

import { addTrapezoidBody, addWings, material } from "./assembly.ts";
import { type Finish, Model } from "./parts.ts";

/** The phased arrays' black radomes. */
const RADOME: Finish = { color: [0.05, 0.05, 0.06], metallic: 0.3, roughness: 0.5 };

/** The body, wide face to the Earth, its three antennas, and wings off the ends. */
export function globalstar2(): Document {
  const model = new Model();
  const body = { nadirWidth: 2.0, zenithWidth: 1.4, height: 1.3, length: 3.0 };
  const half = body.height / 2;
  addTrapezoidBody(model, "body", material(model, "gold"), body);
  const radome = model.material("radome", RADOME);
  model.cylinder("phased-array-large", radome, 0.6, 0.12, 8, { at: [0, -half - 0.06, 0.7] });
  model.cylinder("phased-array-small", radome, 0.45, 0.12, 8, { at: [0, -half - 0.06, -0.4] });
  model.cylinder("c-band", material(model, "gold"), 0.3, 0.08, 8, { at: [0, -half - 0.04, -1.2] });
  // Three panels a wing, about 1.4 × 1.8 m, on short yokes from the end faces: 12 m.
  addWings(model, { array: { span: 4.2, width: 1.8, columns: 1, rows: 3 }, edge: body.length / 2, yoke: 0.3, alongTrack: true });
  return model.doc;
}
