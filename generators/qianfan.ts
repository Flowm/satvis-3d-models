// Qianfan (Thousand Sails, G60), built by SECM and Genesat. In the frame build.yaml
// describes: +Z velocity, +Y zenith, +X port, metres.
//
// A flat satellite, its main structure cast in one piece ("平板主结构一体化铸造成型",
// CCTV-13), stacked eighteen or twenty to a launch in two columns on vertical locking
// rods (SECM, 导弹与航天运载技术 2026 No. 3). No dimensions are published: the
// 2.2 × 1.4 m plate is measured against people in Genesat's rollout photo of
// 27 December 2023 (±15%). The single wing, four panels on a triangular root, hinged
// on a long side with the panels parallel to it, the three stacking posts, the two
// dishes at one end and the tank are read off the official render. Attitude is not
// published; the plate is drawn level, its long axis along the velocity.

import type { Document } from "@gltf-transform/core";

import { addArray, addDish, material } from "./assembly.ts";
import { type Finish, Model } from "./parts.ts";

/** The light-grey cast plate. */
const PLATE: Finish = { color: [0.66, 0.68, 0.72], metallic: 0.5, roughness: 0.5 };

/** The plate with its posts, dishes and tank, and one wing to port. */
export function qianfan(): Document {
  const model = new Model();
  const [width, height, length] = [1.4, 0.15, 2.2];
  const gold = material(model, "gold");
  model.box("plate", model.material("plate", PLATE), [width, height, length], { at: [0, 0, 0] });
  model.box("zenith-patch", gold, [0.6, 0.03, 0.45], { at: [0.2, height / 2 + 0.015, 0.2] });
  // The stacking posts: two at the ends of one long edge, one mid-way along the other.
  const posts: Array<[number, number]> = [
    [-0.72, 1],
    [-0.72, -1],
    [0.72, 0],
  ];
  for (const [i, [x, z]] of posts.entries()) {
    model.cylinder(`post-${i}`, gold, 0.15, 0.4, 12, { at: [x, 0.05, z] });
  }
  model.cylinder("tank", gold, 0.125, 0.5, 12, { at: [-0.8, 0, -0.4], rotate: { axis: "x", degrees: 90 } });
  for (const side of [1, -1]) {
    addDish(model, `dish-${side}`, "white", 0.225, [side * 0.35, -height / 2 - 0.12, length / 2 + 0.25], "-y", [side * 0.35, -height / 2, length / 2]);
  }
  // The triangular root panel, its apex on the plate's edge, then four panels of about
  // 0.57 × 1.9 m.
  const edge = width / 2;
  const rootDepth = 0.6;
  const wingZ = 0.4;
  model.prism(
    "array-root",
    material(model, "cells"),
    [
      [edge, wingZ],
      [edge + rootDepth, wingZ - 0.95],
      [edge + rootDepth, wingZ + 0.95],
    ],
    0.03,
    { at: [0, 0, 0], rotate: { axis: "x", degrees: 90 } },
  );
  addArray(model, "array", { span: 2.28, width: 1.9, columns: 1, rows: 4 }, [edge + rootDepth, 0, wingZ], 1);
  return model.doc;
}
