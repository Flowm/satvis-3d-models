// Guowang (China SatNet), all four of GCAT's buses: Xingwang C and CL from CAST,
// Xingwang S from SECM, Xingwang Y from GalaxySpace. In the frame build.yaml describes:
// +Z velocity, +Y zenith, +X port, metres.
//
// No image of any of them is published beyond a CCTV render of a stowed Long March 6A
// payload: an elongated box with blue panels folded on its long sides. So this is a
// generic box-and-two-wings broadband satellite at GCAT's estimated size, 3.0 × 1.0 m
// with a 10 m span, and the variants are not told apart.

import type { Document } from "@gltf-transform/core";

import { addWings, material } from "./assembly.ts";
import { Model } from "./parts.ts";

/** A 3 m box with two Earth-facing arrays and two wings of four panels. */
export function guowang(): Document {
  const model = new Model();
  const [width, height, length] = [1.0, 1.0, 3.0];
  model.box("body", material(model, "white"), [width, height, length], { at: [0, 0, 0] });
  for (const z of [-0.7, 0.7]) {
    model.box(`phased-array-${z}`, material(model, "phasedArray"), [0.9, 0.04, 1.3], { at: [0, -height / 2 - 0.02, z] });
  }
  addWings(model, { array: { span: 3.9, width: 2.6, columns: 1, rows: 4 }, edge: width / 2, yoke: 0.5 });
  return model.doc;
}
