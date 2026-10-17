// Planet's satellites: SuperDove, SkySat (Gen2, "SkySat-C") and Pelican. In the frame
// build.yaml describes: +Z velocity, +Y zenith, +X port, metres. Every one points its
// telescope at the Earth.

import type { Document } from "@gltf-transform/core";

import { material } from "./assembly.ts";
import { type Finish, Model } from "./parts.ts";

/** Pelican's white and silver bus. */
const PELICAN_BUS: Finish = { color: [0.8, 0.8, 0.82], metallic: 0.5, roughness: 0.5 };
/** SuperDove's black faces. */
const DOVE_BODY: Finish = { color: [0.1, 0.1, 0.12], metallic: 0.3, roughness: 0.6 };

/**
 * SuperDove: a 3U CubeSat, 10 × 10 × 34 cm (eoPortal), standing on its telescope, with
 * two deployable panels of about 30 × 26 cm opening sideways from one long face, which
 * carries cells too (Planet; eoPortal's Dove CAD). Planet's render (Gutierrez et al.,
 * SmallSat 2021, SSC21-XII-04, fig. 1) shows the body's faces black.
 */
export function superDove(): Document {
  const model = new Model();
  model.box("body", model.material("doveBody", DOVE_BODY), [0.1, 0.34, 0.1], { at: [0, 0, 0] });
  const cells = material(model, "cells");
  model.box("body-cells", cells, [0.005, 0.32, 0.09], { at: [0.0525, 0, 0] });
  for (const side of [1, -1]) {
    model.box(`panel-${side}`, cells, [0.005, 0.26, 0.3], { at: [0.0525, 0.02, side * (0.05 + 0.15)] });
  }
  model.cylinder("aperture", material(model, "black"), 0.045, 0.02, 16, { at: [0, -0.18, 0] });
  return model.doc;
}

/**
 * SkySat-C: "60 cm x 60 cm x 95 cm", 110 kg (ESA), cells on its four long sides, a
 * 35 cm telescope looking down, and the aperture door, swung open beside it, carrying
 * the downlink antenna (Spaceflight101; eoPortal).
 */
export function skySat(): Document {
  const model = new Model();
  model.box("body", material(model, "cells"), [0.6, 0.95, 0.6], { at: [0, 0, 0] });
  const gold = material(model, "gold");
  const corners: Array<[number, number]> = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  for (const [sx, sz] of corners) {
    model.box(`edge-${sx}-${sz}`, gold, [0.04, 0.95, 0.04], { at: [sx * 0.3, 0, sz * 0.3] });
  }
  model.cylinder("baffle", material(model, "black"), 0.175, 0.12, 24, { at: [0, -0.535, 0] });
  // The door, hinged on the body's lower edge at x = 0.3 and swung 70° out from it.
  const [radius, swing] = [0.275, (70 * Math.PI) / 180];
  const hinge: [number, number] = [0.3, -0.475];
  model.cylinder("door", material(model, "white"), radius, 0.03, 24, {
    at: [hinge[0] + radius * Math.cos(swing), hinge[1] - radius * Math.sin(swing), 0],
    rotate: { axis: "z", degrees: -70 },
  });
  return model.doc;
}

/**
 * Pelican: "two solar panels", two segments each, about 2.8 m tip to tip against
 * GCAT's 3.0 m, its telescope looking down. Planet's renders (planet.com: the modular
 * smallsat platform, and Our Constellations) hinge the panels on the bus's upper long
 * edges, flush with its length, cells facing away from the telescope, on a white and
 * silver bus whose ring end is about square: 0.56 × 0.56 × 0.95 m, read off the
 * renders, where eoPortal's 0.56 × 0.40 × 0.56 m may leave out the payload.
 */
export function pelican(): Document {
  const model = new Model();
  model.box("bus", model.material("pelicanBus", PELICAN_BUS), [0.56, 0.56, 0.95], { at: [0, 0, 0] });
  model.cylinder("baffle", material(model, "black"), 0.175, 0.15, 24, { at: [0, -0.355, 0] });
  const cells = material(model, "cells");
  for (const side of [1, -1]) {
    for (let segment = 0; segment < 2; segment++) {
      model.box(`panel-${side}-${segment}`, cells, [0.53, 0.03, 0.95], { at: [side * (0.28 + 0.275 + segment * 0.55), 0.265, 0] });
    }
  }
  return model.doc;
}
