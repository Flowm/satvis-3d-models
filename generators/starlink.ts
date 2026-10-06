// Starlink, by generation. In the frame build.yaml describes: +Z velocity, +Y zenith,
// +X port, metres.
//
// Bus and array sizes are SpaceX's, from its FCC letter of 4 October 2022, Exhibit B
// (planet4589.org/astro/starsim/docs/StarG2.pdf), for v1.5 and V2 mini. The FCC calls
// them conservative, so the satellites as built may be slightly smaller. Thicknesses
// are GCAT estimates.
//
// On every generation the arrays leave from the long sides of the bus, and a spine
// runs along the long axis: SpaceX's V1.5/V2/V3 comparison render (x.com/SpaceX,
// status 1977873370688700846), the V3 update's top view, and its 2020 v1 drawings.
// Which way the bus points along the track is not published; here its long axis runs
// along the velocity and the arrays across it.
//
// Hardware counts come from starlink.com: "3 space lasers" and "3 dual-band (Ka-band
// and E-band) antennas" on V2 mini (/technology), "six ... space lasers" and "four
// quad-band ... backhaul antennas" on V3 (/updates/starlink-version-3-satellites).
// Their places and segment counts are read off SpaceX's renders, approximately.

import type { Document } from "@gltf-transform/core";

import { type Finish, Model, type Placement } from "./parts.ts";

const FINISHES = {
  /** Bare aluminium, as the bus frame, spine and array stiffeners render. */
  aluminium: { color: [0.62, 0.63, 0.65], metallic: 0.9, roughness: 0.35 },
  /** The dark panels on the bus top. */
  deck: { color: [0.04, 0.04, 0.05], metallic: 0.2, roughness: 0.6 },
  /** The dielectric mirror film on the Earth-facing side, from v1.5 on. */
  mirror: { color: [0.9, 0.9, 0.92], metallic: 1, roughness: 0.08 },
  /** User phased arrays, grey tiles under the film. */
  phasedArray: { color: [0.32, 0.33, 0.35], metallic: 0.6, roughness: 0.3 },
  /** Cells and backsheet, both dark. */
  cells: { color: [0.03, 0.045, 0.12], metallic: 0.3, roughness: 0.45 },
  /** Booms, laser terminals and thrusters: "painted matte black" (Kandula et al.). */
  black: { color: [0.015, 0.015, 0.015], metallic: 0, roughness: 0.9 },
  /** v1's "white diffuse parabolic antennas" (SpaceX, 2020). */
  white: { color: [0.85, 0.85, 0.86], metallic: 0, roughness: 0.6, doubleSided: true },
  /** Later backhaul dishes, which render as polished metal. */
  dish: { color: [0.7, 0.71, 0.73], metallic: 0.9, roughness: 0.25, doubleSided: true },
} satisfies Record<string, Finish>;

/** Gap between segments of an array, wide enough to read as seams. */
const SEAM = 0.04;
/** A flat array's thickness; real ones are thinner, but this keeps edges visible. */
const ARRAY_THICKNESS = 0.03;

interface Bus {
  /** Across the track. */
  width: number;
  /** Along the velocity. */
  length: number;
  /** Radially; a GCAT estimate. */
  height: number;
}

interface ArraySpec {
  /** From root to tip. */
  span: number;
  /** Along the velocity. */
  width: number;
  /** Segments across the width, and along the span. */
  columns: number;
  rows: number;
}

/**
 * The bus: an aluminium body, two dark top panels either side of the spine, and
 * the mirror film under it.
 */
function addBus(model: Model, bus: Bus): void {
  const deck = model.material("deck", FINISHES.deck);
  const aluminium = model.material("aluminium", FINISHES.aluminium);
  model.box("bus", aluminium, [bus.width, bus.height, bus.length], { at: [0, 0, 0] });
  for (const side of [1, -1]) {
    const width = bus.width / 2 - 0.12;
    model.box(`deck-${side}`, deck, [width, 0.02, bus.length - 0.2], { at: [side * (width / 2 + 0.06), bus.height / 2 + 0.01, 0] });
  }
  model.box("spine", aluminium, [0.08, 0.05, bus.length], { at: [0, bus.height / 2 + 0.025, 0] });
  model.box("mirror", model.material("mirror", FINISHES.mirror), [bus.width - 0.06, 0.01, bus.length - 0.06], { at: [0, -bus.height / 2 - 0.005, 0] });
}

/** Phased-array tiles on the Earth-facing side, at (x, z) centres. */
function addPhasedArrays(model: Model, bus: Bus, size: [number, number], centres: Array<[number, number]>): void {
  const material = model.material("phasedArray", FINISHES.phasedArray);
  for (const [i, [x, z]] of centres.entries()) {
    model.box(`phased-array-${i}`, material, [size[0], 0.03, size[1]], { at: [x, -bus.height / 2 - 0.025, z] });
  }
}

/**
 * An array of segments from a root at (x, y) = `root` outwards on `side` (1 port,
 * -1 starboard), with an aluminium stiffener along its root. `lift` raises it out
 * of the bus plane, in degrees.
 */
function addArray(model: Model, name: string, array: ArraySpec, root: [number, number], side: 1 | -1, lift = 0): void {
  const cells = model.material("cells", FINISHES.cells);
  const radians = (lift * Math.PI) / 180;
  const rowLength = array.span / array.rows;
  const columnWidth = array.width / array.columns;
  const along = (x: number): [number, number] => [root[0] + side * x * Math.cos(radians), root[1] + x * Math.sin(radians)];
  const rotate = lift === 0 ? undefined : { axis: "z" as const, degrees: side * lift };
  for (let row = 0; row < array.rows; row++) {
    for (let column = 0; column < array.columns; column++) {
      const [x, y] = along((row + 0.5) * rowLength);
      const z = (column + 0.5) * columnWidth - array.width / 2;
      model.box(`${name}-${row}-${column}`, cells, [rowLength - SEAM, ARRAY_THICKNESS, columnWidth - SEAM], { at: [x, y, z], ...(rotate && { rotate }) });
    }
  }
  const [x, y] = along(0);
  model.box(`${name}-stiffener`, model.material("aluminium", FINISHES.aluminium), [0.08, 0.08, array.width], { at: [x, y, 0], ...(rotate && { rotate }) });
}

/**
 * The exposed part of the pantograph that deploys an array: two rods in a narrow V,
 * `spread` apart along the velocity at the bus and at the array, as SpaceX's renders
 * and Kandula et al.'s to-scale figure show.
 */
function addBoom(model: Model, name: string, edge: number, side: 1 | -1, length: number, spread: [number, number]): void {
  const black = model.material("black", FINISHES.black);
  for (const sign of [1, -1]) {
    const [atBus, atArray] = [(sign * spread[0]) / 2, (sign * spread[1]) / 2];
    const rod = Math.hypot(length, atBus - atArray);
    const degrees = (Math.atan2(atBus - atArray, length) * 180) / Math.PI;
    model.box(`${name}-${sign}`, black, [rod, 0.05, 0.05], {
      at: [edge + (side * length) / 2, 0, (atBus + atArray) / 2],
      rotate: { axis: "y", degrees: side * degrees },
    });
  }
}

/**
 * A parabolic dish facing the Earth, on an arm from the bus at `mount` (x, z) to the
 * dish at `at` (x, z), level with the underside.
 */
function addDish(model: Model, name: string, finish: "white" | "dish", radius: number, bus: Bus, mount: [number, number], at: [number, number]): void {
  const y = -bus.height / 2 - 0.1;
  const arm: Placement = {
    at: [(mount[0] + at[0]) / 2, y + 0.05, (mount[1] + at[1]) / 2],
    rotate: { axis: "y", degrees: (Math.atan2(-(at[1] - mount[1]), at[0] - mount[0]) * 180) / Math.PI },
  };
  const reach = Math.hypot(at[0] - mount[0], at[1] - mount[1]);
  if (reach > 0) {
    model.box(`${name}-arm`, model.material("black", FINISHES.black), [reach, 0.06, 0.06], arm);
  }
  model.dish(name, model.material(finish, FINISHES[finish]), radius, radius * 0.4, 4, 16, {
    at: [at[0], y, at[1]],
    rotate: { axis: "x", degrees: 180 },
  });
}

/** Laser terminals: black boxes with a round aperture, at the bus ends, at (x, z). */
function addLasers(model: Model, positions: Array<[number, number]>): void {
  const black = model.material("black", FINISHES.black);
  for (const [i, [x, z]] of positions.entries()) {
    const end = Math.sign(z);
    model.box(`laser-${i}`, black, [0.3, 0.25, 0.3], { at: [x, 0, z] });
    model.cylinder(`laser-${i}-aperture`, black, 0.1, 0.12, 12, { at: [x, 0, z + end * 0.2], rotate: { axis: "x", degrees: 90 } });
  }
}

/** The argon Hall thruster, mid-way along an end, firing along the long axis. */
function addThruster(model: Model, bus: Bus, end: 1 | -1): void {
  model.cylinder("thruster", model.material("black", FINISHES.black), 0.12, 0.3, 12, {
    at: [0, 0, end * (bus.length / 2 + 0.15)],
    rotate: { axis: "x", degrees: 90 },
  });
}

/**
 * v1.0 and v1.5: one array, 8.1 × 2.8 m, on a 2.8 × 1.3 m bus. On station "the solar
 * array goes vertical" (SpaceX, 2020), raised from the bus on two short posts as
 * SpaceX's 2020 drawing shows, and turns about its hinge to follow the Sun; it is
 * drawn upright, with the 2 × 12 panels of that drawing. Underneath, four phased
 * arrays in a block over most of the length and two "white diffuse parabolic
 * antennas", one at each end. v1.0's visors and v1.5's laser terminals are too
 * small to see at satvis's scale.
 */
export function starlinkV1(): Document {
  const model = new Model();
  const bus: Bus = { width: 1.3, length: 2.8, height: 0.2 };
  addBus(model, bus);
  addPhasedArrays(model, bus, [0.55, 0.8], [
    [0.3, -0.85],
    [-0.3, -0.85],
    [0.3, 0],
    [-0.3, 0],
  ]);
  addDish(model, "gateway-fore", "white", 0.2, bus, [0, bus.length / 2], [0, bus.length / 2 + 0.25]);
  addDish(model, "gateway-aft", "white", 0.2, bus, [0, -bus.length / 2], [0, -bus.length / 2 - 0.25]);
  const posts = 0.15;
  for (const z of [-0.5, 0.5]) {
    model.box(`post-${z}`, model.material("aluminium", FINISHES.aluminium), [0.06, posts, 0.06], { at: [-bus.width / 2 + 0.05, bus.height / 2 + posts / 2, z] });
  }
  addArray(model, "array", { span: 8.1, width: bus.length, columns: 2, rows: 12 }, [-bus.width / 2 + 0.05, bus.height / 2 + posts], -1, 90);
  return model.doc;
}

/** V2 mini's bus, shared by the Direct to Cell variant. */
const V2_BUS: Bus = { width: 2.7, length: 4.1, height: 0.3 };

/**
 * V2 mini, and V2 mini Optimized, which no source shows differing from it: two arrays,
 * 12.8 × 4.1 m each, on a 4.1 × 2.7 m bus, laid flat with the cells to the zenith, as
 * SpaceX draws them; they turn about the boom to follow the Sun. The gap between the
 * array roots is about 0.65 of an array's length in SpaceX's render and in HEO
 * Robotics' image of STARLINK-30058, which leaves 2.8 m of boom each side and a 34 m
 * span; Spaceflight Now's "about 100 feet (30 meters)" is rounder.
 */
export function starlinkV2Mini(): Document {
  return v2Mini(new Model()).doc;
}

/**
 * V2 mini Direct to Cell: a V2 mini with SpaceX's "2.7 m x 2.3 m advanced phased
 * array" for phones (Direct to Cell update, January 2024), flat on the Earth-facing
 * side as the stack photo shows it. Whether it deploys further is not published.
 */
export function starlinkV2MiniDirectToCell(): Document {
  const model = v2Mini(new Model());
  model.box("direct-to-cell", model.material("phasedArray", FINISHES.phasedArray), [2.7, 0.06, 2.3], { at: [0, -V2_BUS.height / 2 - 0.07, 0] });
  return model.doc;
}

/** Adds the V2 mini's bus, antennas, booms and arrays to `model`. */
function v2Mini(model: Model): Model {
  const bus = V2_BUS;
  const [hx, hz] = [bus.width / 2, bus.length / 2];
  addBus(model, bus);
  // "5 advanced Ku-band phased array antennas" (starlink.com/technology), in the 2 × 3
  // grid of the nadir render, one place of six taken by other hardware.
  addPhasedArrays(model, bus, [1.2, 1.25], [
    [0.65, -1.35],
    [-0.65, -1.35],
    [0.65, 0],
    [-0.65, 0],
    [0.65, 1.35],
  ]);
  // On arms outside the outline: two at the corners of one end, one at the other.
  addDish(model, "backhaul-0", "dish", 0.35, bus, [hx, hz - 0.3], [hx + 0.45, hz]);
  addDish(model, "backhaul-1", "dish", 0.35, bus, [-hx, hz - 0.3], [-hx - 0.45, hz]);
  addDish(model, "backhaul-2", "dish", 0.35, bus, [hx, -hz + 0.3], [hx + 0.45, -hz]);
  addLasers(model, [
    [-0.6, hz + 0.15],
    [0.6, -hz - 0.15],
    [-0.6, -hz - 0.15],
  ]);
  addThruster(model, bus, 1);
  addWings(model, bus, { span: 12.8, width: 4.1, columns: 2, rows: 16 }, 2.8, [0.15, 0.7]);
  return model;
}

/**
 * V3, launched on Starship from 28 September 2026. Each array is "four segments" of a
 * "19-metre-long" blanket "stitched together" (SpaceX); side by side, that is a
 * 19.5 m array. SpaceX's renders put its width at about 0.55 of the bus length in the
 * V3 update's top view, and at a little under V2's 4.1 m beside V2 mini in the
 * comparison: 3.7 m. FCC's 2022 Starship form factor gives the same length but 6.36 m
 * of width, an envelope SpaceX calls conservative; its 6.4 × 2.7 m bus matches the
 * renders. The gap between array roots is about 0.4 of an array's length: 2.5 m of
 * boom each side, a 47 m span. GCAT's 160 m reads the four segments end to end. Three
 * lasers sit at each end of the spine and four backhaul dishes on curved arms at the
 * corners.
 */
export function starlinkV3(): Document {
  const model = new Model();
  const bus: Bus = { width: 2.7, length: 6.4, height: 0.3 };
  const [hx, hz] = [bus.width / 2, bus.length / 2];
  addBus(model, bus);
  // How many user arrays V3 carries is not published; the render shows a 2 × 3 grid.
  addPhasedArrays(model, bus, [1.2, 2], [
    [0.65, -2.1],
    [-0.65, -2.1],
    [0.65, 0],
    [-0.65, 0],
    [0.65, 2.1],
    [-0.65, 2.1],
  ]);
  for (const [i, [sx, sz]] of (
    [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ] as Array<[number, number]>
  ).entries()) {
    addDish(model, `backhaul-${i}`, "dish", 0.55, bus, [sx * hx, sz * (hz - 0.8)], [sx * (hx + 0.7), sz * (hz - 0.3)]);
  }
  addLasers(model, [
    [-0.7, hz + 0.15],
    [0, hz + 0.15],
    [0.7, hz + 0.15],
    [-0.7, -hz - 0.15],
    [0, -hz - 0.15],
    [0.7, -hz - 0.15],
  ]);
  addWings(model, bus, { span: 19.5, width: 3.7, columns: 4, rows: 32 }, 2.5, [0.2, 0.6]);
  return model.doc;
}

/** Both arrays, each on its boom, `gap` metres out from the bus's long sides. */
function addWings(model: Model, bus: Bus, array: ArraySpec, gap: number, spread: [number, number]): void {
  for (const side of [1, -1] as const) {
    const edge = side * (bus.width / 2);
    const name = side > 0 ? "port" : "starboard";
    addBoom(model, `boom-${name}`, edge, side, gap, spread);
    addArray(model, `array-${name}`, array, [edge + side * gap, 0], side);
  }
}
