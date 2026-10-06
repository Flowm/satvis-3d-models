// Kepler Communications' optical data relay satellites, Tranche 1 (AETHER-3 to 12,
// GCAT's "Kepler Gen2B"), built by Kepler in Toronto. In the frame build.yaml
// describes: +Z velocity, +Y zenith, +X port, metres.
//
// Kepler's orbital debris plan (FCC SAT-APL-20241118-00263, "ODM Plan") gives 300 kg,
// a 0.9 × 1.2 × 1.8 m stowed size, an aluminium honeycomb body of 1.1 × 1.7 × 0.8 m,
// four Tesat optical terminals on azimuth-elevation drives, a steerable Ku antenna,
// and a xenon Hall thruster with its tank in a backpack. It also states the attitude:
// "the long axis (X) of the primary spacecraft body is aligned with the velocity
// vector … the same face of the spacecraft remains pointed nadir", the equipment deck.
// The trapezoidal section, the copper MLI and the stack of four 1.7 × 0.66 m panels
// stowed on each long side are read off Kepler's thermal-vacuum photo; Kepler's launch
// render shows the wings deployed in a shallow V, about 30° up. Laid flat they would
// span 6.4 m, against GCAT's 6.0 m; in the V they reach 5.5 m. The debris plan's 4.0 m
// envelope and two 0.66 × 1.1 m array entries look like simplifications. Positions on
// the deck are approximate.

import type { Document } from "@gltf-transform/core";

import { addThruster, addTrapezoidBody, addWings, material } from "./assembly.ts";
import { type Finish, Model, type Rotation, rotateVector } from "./parts.ts";

/** Orange aluminised Kapton MLI, as Kepler's photos show the body. */
const COPPER: Finish = { color: [0.72, 0.38, 0.18], metallic: 0.9, roughness: 0.35 };

/** The body: 1.1 m across the Earth-facing deck, 0.8 m across the top. */
const BODY = { nadirWidth: 1.1, zenithWidth: 0.8, height: 0.8, length: 1.7 };

/** The Earth-facing deck's height. */
const DECK = -BODY.height / 2;

/** The trapezoidal body, its deck hardware, the backpack, and two wings in a V. */
export function keplerTranche1(): Document {
  return tranche1(new Model()).doc;
}

/**
 * Tranche 1 hosting OroraTech's SAFIRE Gen4 thermal camera: "four of its SAFIRE Gen4
 * sensor payloads aboard Kepler Communications' next-generation satellites"
 * (OroraTech, January 2026). Each unit is a machined block with two thermal lens
 * barrels and a small visible camera between them (OroraTech's photo of the four
 * units); its size, about 0.25 × 0.14 m, is scaled from the Tesat drives beside it in
 * the integration photo, which also puts it on the Earth-facing deck next to the Ku
 * antenna's tripod.
 */
export function keplerTranche1Safire(): Document {
  const model = tranche1(new Model());
  const [x, z] = [-0.15, -0.3];
  const aluminium = material(model, "aluminium");
  const black = material(model, "black");
  model.box("safire", aluminium, [0.25, 0.12, 0.14], { at: [x, DECK - 0.06, z] });
  for (const side of [1, -1]) {
    model.cylinder(`safire-lens-${side}`, aluminium, 0.05, 0.08, 16, { at: [x + side * 0.075, DECK - 0.16, z] });
    model.cylinder(`safire-lens-${side}-glass`, black, 0.035, 0.01, 16, { at: [x + side * 0.075, DECK - 0.205, z] });
  }
  model.cylinder("safire-camera", black, 0.025, 0.06, 12, { at: [x, DECK - 0.15, z] });
  return model.doc;
}

/** Adds Tranche 1's body, deck hardware, backpack and wings to `model`. */
function tranche1(model: Model): Model {
  const { length, zenithWidth } = BODY;
  const copper = model.material("copper", COPPER);
  const aluminium = material(model, "aluminium");
  const white = material(model, "white");
  const black = material(model, "black");
  addTrapezoidBody(model, "body", copper, BODY);
  model.box("deck", aluminium, [BODY.nadirWidth, 0.02, length], { at: [0, DECK - 0.01, 0] });

  // Four optical terminals near the deck's corners, each head on its drive with its
  // outer end tilted 30° down: the other satellites in the ring are below the local
  // horizontal.
  const headLength = 0.35;
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const centre: [number, number, number] = [sx * 0.38, DECK - 0.26, sz * 0.62];
      const tilt: Rotation = { axis: "x", degrees: sz * 30 };
      model.cylinder(`optical-drive-${sx}-${sz}`, white, 0.1, 0.15, 16, { at: [centre[0], DECK - 0.085, centre[2]] });
      model.box(`optical-head-${sx}-${sz}`, aluminium, [0.2, 0.2, headLength], { at: centre, rotate: tilt });
      const [dx, dy, dz] = rotateVector(tilt, [0, 0, sz * (headLength / 2 + 0.01)]);
      model.cylinder(`optical-aperture-${sx}-${sz}`, black, 0.04, 0.02, 12, {
        at: [centre[0] + dx, centre[1] + dy, centre[2] + dz],
        rotate: [{ axis: "x", degrees: 90 }, tilt],
      });
    }
  }
  // The Ku antenna on a two-axis gimbal, raised clear of the terminals.
  model.cylinder("ku-mast", material(model, "gold"), 0.03, 0.3, 8, { at: [0, DECK - 0.15, 0.05] });
  model.cylinder("ku-gimbal", black, 0.075, 0.2, 12, { at: [0, DECK - 0.4, 0.05] });
  model.box("ku-antenna", white, [0.3, 0.03, 0.25], { at: [0, DECK - 0.515, 0.05] });

  const backpack = 0.2;
  model.box("backpack", copper, [0.3, 0.5, backpack], { at: [0, 0.05, -length / 2 - backpack / 2] });
  addThruster(model, length / 2 + backpack, -1, 0.06, [0, 0.05]);
  for (const sz of [1, -1]) {
    model.box(`radiator-${sz}`, white, [0.35, 0.3, 0.01], { at: [0.25, -0.05, sz * (length / 2 + 0.005)] });
  }

  // Four panels a wing, hinged on the upper edge of each long side.
  addWings(model, { array: { span: 2.64, width: length, columns: 1, rows: 4 }, edge: zenithWidth / 2 + 0.07, yoke: 0, y: BODY.height / 2 - 0.05, lift: 30 });
  return model;
}
