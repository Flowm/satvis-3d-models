// China's space station, Tiangong, in its T configuration: the Tianhe core module
// along the track, Mengtian to port and Wentian to starboard, no visiting vehicles.
// In the frame build.yaml describes: +Z velocity, +Y zenith, +X port, metres, with
// the origin halfway along Tianhe.
//
// Sourced: Tianhe's 16.6 m length, its 2.8 m node and small cylinder and 4.2 m large
// cylinder; the labs' 17.9 m × 4.2 m; the forward port leading and the nadir port
// facing the Earth (CMSA via Sina, 2021); Mengtian on the port berth and Wentian on
// the starboard one; Tianhe's two 12.6 m wings on its small cylinder, still in place,
// as the planned move to the labs' trusses has not happened (EVAs repaired them there
// in 2023 and 2024); and each lab's pair of wings on its tail truss, 27 m a wing and
// over 55 m tip to tip (Wang & Wang, Chinese Science Bulletin 67(34), 2022; People's
// Daily, 2022). Section boundaries, wing widths, the platform, the dishes and the arms
// are read off CMSA's zenith photo of 2023-10-30, scaled by the labs' 4.2 m, so they
// are good to about 0.7 m. All wings are drawn flat, facing the zenith, as there.

import type { Document, Material } from "@gltf-transform/core";

import { addArray, addArrayAlongTrack, addDish, material } from "./assembly.ts";
import { type Finish, Model, type Rotation } from "./parts.ts";

/** The arrays' cells, dark maroon in CMSA's photos, not the shared navy. */
const CELLS: Finish = { color: [0.05, 0.02, 0.02], metallic: 0.3, roughness: 0.45 };

/** The quilted grey-beige blankets on the resource cabins and the trusses. */
const BEIGE: Finish = { color: [0.6, 0.57, 0.5], metallic: 0.2, roughness: 0.7 };

/** Where the node's centre, and so the labs' axes, sit along Tianhe. */
const NODE_Z = 6.6;

/** A cylinder's axis along the track. */
const ALONG: Rotation = { axis: "x", degrees: 90 };
/** A cylinder's axis across the track. */
const ACROSS: Rotation = { axis: "z", degrees: 90 };

/** Tianhe, Mengtian, Wentian and their wings. */
export function tiangong(): Document {
  const model = new Model();
  // Registered first under the shared name, so the shared array helpers use it.
  model.material("cells", CELLS);
  const white = material(model, "white");
  const beige = model.material("beige", BEIGE);
  const aluminium = material(model, "aluminium");

  // Tianhe, front to back: the forward port, the node, the small and large cylinders,
  // the resource cabin and the aft port.
  const along = (name: string, finish: Material, diameter: number, front: number, back: number): void => {
    model.cylinder(name, finish, diameter / 2, front - back, 24, { at: [0, 0, (front + back) / 2], rotate: ALONG });
  };
  along("forward-port", aluminium, 0.9, 8.6, 7.9);
  along("node", white, 2.8, 7.9, 5.3);
  model.cylinder("node-sides", white, 1.1, 3.6, 16, { at: [0, 0, NODE_Z], rotate: ACROSS });
  model.cylinder("nadir-port", aluminium, 0.45, 0.4, 12, { at: [0, -1.55, NODE_Z] });
  along("small-cylinder", white, 2.8, 5.4, 0.7);
  along("large-cylinder", white, 4.2, 0.7, -5.5);
  along("resource-cabin", beige, 4.0, -5.5, -8.3);
  along("aft-port", aluminium, 0.9, -8.3, -8.8);
  addDish(model, "relay-dish", "white", 0.6, [0.5, 1.9, 2.0], "+y", [0.5, 1.4, 2.0]);
  // The core module's arm, folded along the small cylinder.
  model.box("core-arm-1", aluminium, [0.35, 0.35, 4.5], { at: [-0.6, 1.7, 3.2] });
  model.box("core-arm-2", aluminium, [0.35, 0.35, 4.5], { at: [0.2, 1.75, 2.6] });

  // Tianhe's wings off the small cylinder's aft end: two blankets either side of a
  // mast, 12.6 m from the hull to the tip.
  for (const side of [1, -1] as const) {
    model.box(`tianhe-mast-${side}`, aluminium, [12.6, 0.12, 0.5], { at: [side * 7.7, 0, 0.7] });
    for (const offset of [-1.5, 1.5]) {
      addArray(model, `tianhe-wing-${side}-${offset}`, { span: 11.2, width: 2.5, columns: 1, rows: 6 }, [side * 2.8, 0, 0.7 + offset], side);
    }
  }

  // The labs across the track, from the berth outwards: the cone, the work cabin, the
  // airlock or payload cabin, the resource cabin and the tail truss with its wings.
  for (const [side, lab] of [
    [1, "mengtian"],
    [-1, "wentian"],
  ] as const) {
    const across = (name: string, finish: Material, diameter: number, inner: number, outer: number): void => {
      model.cylinder(`${lab}-${name}`, finish, diameter / 2, outer - inner, 24, { at: [(side * (inner + outer)) / 2, 0, NODE_Z], rotate: ACROSS });
    };
    across("cone", white, 2.2, 1.5, 2.6);
    across("work-cabin", white, 4.2, 2.6, 10.6);
    across("airlock-cabin", white, 3.8, 10.6, 15.0);
    across("resource-cabin", beige, 3.2, 15.0, 18.8);
    model.box(`${lab}-truss`, beige, [0.6, 0.6, 1.2], { at: [side * 19.1, 0, NODE_Z] });
    for (const end of [1, -1] as const) {
      const root = NODE_Z + end * 4.6;
      model.box(`${lab}-yoke-${end}`, beige, [0.3, 0.3, 4.0], { at: [side * 19.4, 0, NODE_Z + end * 2.6] });
      model.box(`${lab}-mast-${end}`, aluminium, [0.5, 0.12, 23.2], { at: [side * 19.4, 0, root + end * 11.6] });
      for (const offset of [-1.5, 1.5]) {
        addArrayAlongTrack(model, `${lab}-wing-${end}-${offset}`, { span: 23.2, width: 2.5, columns: 1, rows: 10 }, [side * 19.4 + offset, 0, root], end);
      }
    }
  }
  // Mengtian's exposed platform, deployed ahead of its payload cabin.
  model.box("mengtian-platform", aluminium, [2.6, 1.0, 1.5], { at: [12.3, 0, NODE_Z + 2.85] });
  // Wentian's small arm, stowed along the top of its work cabin.
  model.box("wentian-arm-1", aluminium, [2.6, 0.25, 0.25], { at: [-5.0, 2.25, NODE_Z - 0.3] });
  model.box("wentian-arm-2", aluminium, [2.6, 0.25, 0.25], { at: [-7.6, 2.25, NODE_Z + 0.3] });
  // Wentian's relay dish on its resource cabin, and its EVA hatch on the nadir side.
  addDish(model, "wentian-dish", "white", 0.5, [-15.7, 2.3, NODE_Z], "+y", [-15.7, 1.6, NODE_Z]);
  model.box("wentian-hatch", material(model, "black"), [1.0, 0.05, 1.0], { at: [-12.8, -1.92, NODE_Z] });
  return model.doc;
}
