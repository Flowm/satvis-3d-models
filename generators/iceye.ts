// ICEYE SAR microsatellites. In the frame build.yaml describes: +Z velocity, +Y zenith,
// +X port, metres.
//
// The X-band SAR antenna is "3.2 × 0.4 m", an active phased array of five panels, the
// middle one on the bus and two folding out to each end (eoPortal); it looks to one
// side, so it is drawn rolled 25° about the velocity. Gen4 doubles the antenna (ICEYE),
// but how many of the satellites tracked are Gen4 is not known, so this is Gen3: dark
// panels, a small gold bus behind them and a solar sail of 5 × 2 panels behind that,
// all read off ICEYE's renders and media kit. The sail stands up behind the bus,
// facing sideways, to the Sun of a dawn-dusk orbit. Sizes other than the antenna's
// are estimated.

import type { Document } from "@gltf-transform/core";

import { material } from "./assembly.ts";
import { type Finish, Model } from "./parts.ts";

/** The SAR antenna's dark element panels. */
const SAR: Finish = { color: [0.18, 0.19, 0.2], metallic: 0.5, roughness: 0.45 };

/** The SAR antenna, the bus and the sail above it, all rolled to look to one side. */
export function iceye(): Document {
  const model = new Model();
  const roll = { axis: "z" as const, degrees: 25 };
  const r = (roll.degrees * Math.PI) / 180;
  // A point `d` along the antenna's normal, towards the Earth, rolled with it.
  const along = (d: number): [number, number] => [d * Math.sin(r), -d * Math.cos(r)];
  const busHalf = 0.175;
  const [antennaThickness, sailPanel] = [0.04, 0.48];
  const sar = model.material("sar", SAR);
  for (let panel = 0; panel < 5; panel++) {
    const [x, y] = along(busHalf + antennaThickness / 2);
    model.box(`sar-${panel}`, sar, [0.4, antennaThickness, 0.62], { at: [x, y, (panel - 2) * 0.64], rotate: roll });
  }
  model.box("bus", material(model, "gold"), [2 * busHalf, 2 * busHalf, 0.5], { at: [0, 0, 0], rotate: roll });
  const cells = material(model, "cells");
  for (let column = 0; column < 5; column++) {
    for (let row = 0; row < 2; row++) {
      const [x, y] = along(-(busHalf + sailPanel / 2 + row * (sailPanel + 0.02)));
      model.box(`sail-${column}-${row}`, cells, [0.03, sailPanel, 0.58], { at: [x, y, (column - 2) * 0.6], rotate: roll });
    }
  }
  return model.doc;
}
