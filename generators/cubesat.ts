// Generic CubeSats, one per size GCAT's "Cubesat NU" buses name. In the frame
// build.yaml describes: +Z velocity, +Y zenith, +X port, metres.
//
// Sizes follow the CubeSat Design Specification (Cal Poly, rev. 14.1): a unit is
// 10 cm across and 11.35 cm long, rails included; two units across are 22.63 cm, as
// the 6U and 12U specification gives them. How the units stack in the 8U and 16U,
// 2 × 1 × 4 and 2 × 2 × 4, is read off GCAT's 0.4 × 0.2 m dimensions for them.
//
// GCAT draws about half the 3U, 6U and 12U in orbit, and most 16U, with two deployed
// panels; these models show them, the smaller sizes with body-mounted cells only. A
// wing is a row of panels the size of the broad face, hinged on its long edges; the
// spans, 0.3 m for the 3U, 0.7 m for the 6U and 1.6 m for the 12U and 16U, are
// GCAT's medians. Flying long axis forward with the panels to the zenith is one
// common attitude among many.

import type { Document } from "@gltf-transform/core";

import { material } from "./assembly.ts";
import { Model } from "./parts.ts";

/** One unit's width, and two units' across. */
const WIDTH = { 1: 0.1, 2: 0.2263 } as const;
/** One unit's length along the rails. */
const UNIT_LENGTH = 0.1135;
/** A rail's square section. */
const RAIL = 0.0085;
/** How far the rails' feet stand proud of each end. */
const STANDOFF = 0.0065;

/** A CubeSat's size and its deployed panels. */
interface CubeSat {
  /** Units across the broad face, which faces the zenith. */
  across: 1 | 2;
  /** Units deep, from the Earth-facing side to the zenith side. */
  deep: 1 | 2;
  /** Units along the rails, which run along the velocity. */
  long: number;
  /** Panels in each of the two wings; none for body-mounted cells only. */
  panels?: number;
}

/** The generic CubeSats by generator name, each the file it is built into. */
export const CUBESATS: Record<string, () => Document> = {
  "cubesat-1u": () => cubesat({ across: 1, deep: 1, long: 1 }),
  "cubesat-1.5u": () => cubesat({ across: 1, deep: 1, long: 1.5 }),
  "cubesat-2u": () => cubesat({ across: 1, deep: 1, long: 2 }),
  "cubesat-3u": () => cubesat({ across: 1, deep: 1, long: 3, panels: 1 }),
  "cubesat-4u": () => cubesat({ across: 1, deep: 1, long: 4 }),
  "cubesat-6u": () => cubesat({ across: 2, deep: 1, long: 3, panels: 1 }),
  "cubesat-8u": () => cubesat({ across: 2, deep: 1, long: 4 }),
  "cubesat-12u": () => cubesat({ across: 2, deep: 2, long: 3, panels: 3 }),
  "cubesat-16u": () => cubesat({ across: 2, deep: 2, long: 4, panels: 3 }),
};

/** An aluminium frame of four rails, cells on its long faces, and any wings. */
function cubesat({ across, deep, long, panels = 0 }: CubeSat): Document {
  const model = new Model();
  const aluminium = material(model, "aluminium");
  const cells = material(model, "cells");
  const [width, height, length] = [WIDTH[across], WIDTH[deep], long * UNIT_LENGTH];
  const body = length - 2 * STANDOFF;

  model.box("body", aluminium, [width - 2 * RAIL, height - 2 * RAIL, body], { at: [0, 0, 0] });
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      model.box(`rail-${sx}-${sy}`, aluminium, [RAIL, RAIL, length], { at: [(sx * (width - RAIL)) / 2, (sy * (height - RAIL)) / 2, 0] });
    }
  }
  // Cells cover each long face between the rails, short of the end frames.
  const cellLength = body - 0.02;
  for (const s of [1, -1]) {
    model.box(`cells-x${s}`, cells, [0.002, height - 2 * RAIL, cellLength], { at: [(s * (width - 2 * RAIL)) / 2, 0, 0] });
    model.box(`cells-y${s}`, cells, [width - 2 * RAIL, 0.002, cellLength], { at: [0, (s * (height - 2 * RAIL)) / 2, 0] });
  }

  // Panels a few millimetres thick: the shared arrays' seams and stiffeners are
  // sized for satellites a hundred times larger.
  for (const side of [1, -1]) {
    for (let panel = 0; panel < panels; panel++) {
      model.box(`panel-${side}-${panel}`, cells, [width - 0.004, 0.003, body], { at: [side * (width / 2 + (panel + 0.5) * width), height / 2, 0] });
    }
  }
  return model.doc;
}
