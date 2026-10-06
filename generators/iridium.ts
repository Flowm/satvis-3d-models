// Iridium NEXT (Thales Alenia Space, ELiTeBus). In the frame build.yaml describes:
// +Z velocity, +Y zenith, +X port, metres.
//
// About 860 kg, 3.1 × 2.4 × 1.5 m stowed, spanning 9.4 m (Iridium's labelled render;
// eoPortal). A trapezoidal body whose Earth-facing panel, "3 by 1.5-meter", carries
// the L-band main mission antenna, the Aireon payload and two steerable Ka feeder
// dishes; four Ka crosslinks, two fixed fore and aft and two steerable to the sides;
// two two-panel wings off the ends (Spaceflight101; eoPortal). The fixed fore-and-aft
// crosslinks and the ram-facing hosted payload put the long axis along the velocity.
// Antenna and panel sizes are not published and are read off renders and photos.

import type { Document } from "@gltf-transform/core";

import { addDish, addTrapezoidBody, addWings, material } from "./assembly.ts";
import { type Finish, Model } from "./parts.ts";

/** The main mission antenna's orange element grid. */
const MISSION_ANTENNA: Finish = { color: [0.78, 0.36, 0.14], metallic: 0.2, roughness: 0.6 };
/** The body's white and silver panels. */
const PANEL: Finish = { color: [0.8, 0.81, 0.83], metallic: 0.7, roughness: 0.35 };

/** The trapezoidal body, its antennas, and two wings along the track. */
export function iridiumNext(): Document {
  const model = new Model();
  const body = { nadirWidth: 1.5, zenithWidth: 2.4, height: 1.5, length: 3.1 };
  const [half, end] = [body.height / 2, body.length / 2];
  const boomHeight = 0.3;
  addTrapezoidBody(model, "body", model.material("panel", PANEL), body);
  model.box("zenith-mli", material(model, "gold"), [body.zenithWidth - 0.1, 0.02, body.length - 0.1], { at: [0, half + 0.01, 0] });
  model.box("mission-antenna", model.material("missionAntenna", MISSION_ANTENNA), [1.2, 0.06, 1.2], { at: [0, -half - 0.03, 0.2] });
  model.box("aireon", material(model, "white"), [0.4, 0.3, 0.7], { at: [0, -half - 0.15, 1.15] });
  for (const side of [1, -1]) {
    addDish(model, `feeder-${side}`, "polished", 0.2, [side * 0.55, -half - 0.2, -1.3], "-y", [side * 0.45, -half, -1.3]);
    // The fixed crosslinks, fore and aft, sit below the wing booms' line.
    addDish(model, `crosslink-fixed-${side}`, "white", 0.175, [0, boomHeight - 0.6, side * end], side > 0 ? "+z" : "-z");
    // The steerable ones stand on the zenith face, looking to port and starboard.
    const x = side * (body.zenithWidth / 2 - 0.3);
    addDish(model, `crosslink-steerable-${side}`, "white", 0.175, [x, half + 0.2, -1.3], side > 0 ? "+x" : "-x", [x, half, -1.3]);
  }
  // Two panels a wing, each about 1.4 × 2.6 m, on booms from the ends: 9.4 m tip to tip.
  addWings(model, { array: { span: 2.8, width: 2.6, columns: 1, rows: 2 }, edge: end, yoke: 0.35, y: boomHeight, alongTrack: true });
  return model.doc;
}
