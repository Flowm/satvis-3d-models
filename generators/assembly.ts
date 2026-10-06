// Assemblies the generators share: finishes, bodies, segmented solar arrays, wings,
// booms, dishes and thrusters, in the frame build.yaml describes (+Z velocity, +Y
// zenith, +X port; metres).

import type { Material } from "@gltf-transform/core";

import type { Finish, Model, Rotation } from "./parts.ts";

/** Finishes more than one generator uses. A generator may add its own beside them. */
export const FINISHES = {
  /** Bare aluminium: frames, spines, array stiffeners, optical heads. */
  aluminium: { color: [0.62, 0.63, 0.65], metallic: 0.9, roughness: 0.35 },
  /** Solar cells and backsheet, both dark. */
  cells: { color: [0.03, 0.045, 0.12], metallic: 0.3, roughness: 0.45 },
  /** Black paint: booms, laser terminals, thrusters. */
  black: { color: [0.015, 0.015, 0.015], metallic: 0, roughness: 0.9 },
  /** White paint and diffuse radomes, seen from either side. */
  white: { color: [0.85, 0.85, 0.86], metallic: 0, roughness: 0.6, doubleSided: true },
  /** Polished metal: dishes and antenna fins, seen from either side. */
  polished: { color: [0.7, 0.71, 0.73], metallic: 0.9, roughness: 0.25, doubleSided: true },
  /** Gold multi-layer insulation, and gold-coated dishes. */
  gold: { color: [0.78, 0.52, 0.16], metallic: 0.9, roughness: 0.35, doubleSided: true },
  /** Silver multi-layer insulation. */
  silverMli: { color: [0.75, 0.76, 0.78], metallic: 0.9, roughness: 0.3 },
  /** Black Kapton multi-layer insulation. */
  blackMli: { color: [0.04, 0.04, 0.045], metallic: 0.4, roughness: 0.4 },
  /** Dielectric mirror film on an Earth-facing side. */
  mirror: { color: [0.9, 0.9, 0.92], metallic: 1, roughness: 0.08 },
  /** User phased arrays: grey tiles. */
  phasedArray: { color: [0.32, 0.33, 0.35], metallic: 0.6, roughness: 0.3 },
} satisfies Record<string, Finish>;

/** A shared finish's name. */
export type FinishName = keyof typeof FINISHES;

/** The finishes an open dish can take: those seen from either side. */
type DishFinish = { [K in FinishName]: (typeof FINISHES)[K] extends { doubleSided: true } ? K : never }[FinishName];

/** Adds or reuses the shared material of `finish`. */
export function material(model: Model, finish: FinishName): Material {
  return model.material(finish, FINISHES[finish]);
}

/** Gap between segments of an array, wide enough to read as seams. */
const SEAM = 0.04;
/** A flat array's thickness; real ones are thinner, but this keeps edges visible. */
const ARRAY_THICKNESS = 0.03;

/** A flat solar array, divided into segments. */
export interface ArraySpec {
  /** From root to tip. */
  span: number;
  /** Across the span, along the velocity unless the array spans along it. */
  width: number;
  /** Segments across the width. */
  columns: number;
  /** Segments along the span. */
  rows: number;
}

/**
 * An array of segments from the middle of its root edge at `root` outwards on `side`
 * (1 port, -1 starboard), with an aluminium stiffener along the root. `lift` raises
 * it out of the horizontal plane, in degrees.
 */
export function addArray(model: Model, name: string, array: ArraySpec, root: [number, number, number], side: 1 | -1, lift = 0): void {
  const cells = material(model, "cells");
  const radians = (lift * Math.PI) / 180;
  const rowLength = array.span / array.rows;
  const columnWidth = array.width / array.columns;
  const along = (x: number): [number, number] => [root[0] + side * x * Math.cos(radians), root[1] + x * Math.sin(radians)];
  const rotate = lift === 0 ? undefined : { axis: "z" as const, degrees: side * lift };
  for (let row = 0; row < array.rows; row++) {
    for (let column = 0; column < array.columns; column++) {
      const [x, y] = along((row + 0.5) * rowLength);
      const z = root[2] + (column + 0.5) * columnWidth - array.width / 2;
      model.box(`${name}-${row}-${column}`, cells, [rowLength - SEAM, ARRAY_THICKNESS, columnWidth - SEAM], { at: [x, y, z], ...(rotate && { rotate }) });
    }
  }
  const [x, y] = along(0);
  model.box(`${name}-stiffener`, material(model, "aluminium"), [0.08, 0.08, array.width], { at: [x, y, root[2]], ...(rotate && { rotate }) });
}

/**
 * A flat array spanning along the velocity instead, from the middle of its root edge
 * at `root` towards `side` (1 ahead, -1 behind), `width` across the track.
 */
export function addArrayAlongTrack(model: Model, name: string, array: ArraySpec, root: [number, number, number], side: 1 | -1): void {
  const cells = material(model, "cells");
  const rowLength = array.span / array.rows;
  const columnWidth = array.width / array.columns;
  for (let row = 0; row < array.rows; row++) {
    for (let column = 0; column < array.columns; column++) {
      const x = root[0] + (column + 0.5) * columnWidth - array.width / 2;
      const z = root[2] + side * (row + 0.5) * rowLength;
      model.box(`${name}-${row}-${column}`, cells, [columnWidth - SEAM, ARRAY_THICKNESS, rowLength - SEAM], { at: [x, root[1], z] });
    }
  }
  model.box(`${name}-stiffener`, material(model, "aluminium"), [array.width, 0.08, 0.08], { at: [root[0], root[1], root[2]] });
}

/**
 * A boom of two rods `length` long, outwards on `side` from x = `edge`, `spread`
 * apart along the velocity where it starts and where it ends. Equal spreads make a
 * parallel yoke; unequal ones a V.
 */
export function addBoom(model: Model, name: string, edge: number, side: 1 | -1, length: number, spread: [number, number], y = 0): void {
  const black = material(model, "black");
  for (const sign of [1, -1]) {
    const [start, end] = [(sign * spread[0]) / 2, (sign * spread[1]) / 2];
    const rod = Math.hypot(length, start - end);
    const degrees = (Math.atan2(start - end, length) * 180) / Math.PI;
    model.box(`${name}-${sign}`, black, [rod, 0.05, 0.05], {
      at: [edge + (side * length) / 2, y, (start + end) / 2],
      rotate: { axis: "y", degrees: side * degrees },
    });
  }
}

/** Two wings, each on a yoke from one side of the body. */
export interface WingSpec {
  /** Each wing's array. */
  array: ArraySpec;
  /** Where the yokes start: the body's half-width, or half-length for wings along the track. */
  edge: number;
  /** Yoke length; 0 hinges the array on the edge. */
  yoke: number;
  /** Height of the yokes and the array roots. */
  y?: number;
  /** Degrees each array is raised out of the horizontal plane. */
  lift?: number;
  /** Draws each yoke as a V of two rods this far apart at the body and at the array. */
  spread?: [number, number];
  /** A single rod's finish, black unless given. */
  yokeFinish?: FinishName;
  /** Wings off the fore and aft ends, spanning along the velocity. */
  alongTrack?: boolean;
  /** Which sides carry a wing: port and starboard (or ahead and behind) by default. */
  sides?: Array<1 | -1>;
}

/** Adds the wings `spec` describes, each a yoke and an array. */
export function addWings(model: Model, spec: WingSpec): void {
  const { array, edge, yoke, y = 0, lift = 0, spread, yokeFinish = "black", alongTrack = false, sides = [1, -1] } = spec;
  for (const side of sides) {
    const name = `${alongTrack ? (side > 0 ? "fore" : "aft") : side > 0 ? "port" : "starboard"}-wing`;
    if (alongTrack) {
      if (yoke > 0) {
        model.box(`${name}-yoke`, material(model, yokeFinish), [0.05, 0.05, yoke], { at: [0, y, side * (edge + yoke / 2)] });
      }
      addArrayAlongTrack(model, name, array, [0, y, side * (edge + yoke)], side);
    } else {
      if (spread) {
        addBoom(model, `${name}-yoke`, side * edge, side, yoke, spread, y);
      } else if (yoke > 0) {
        model.box(`${name}-yoke`, material(model, yokeFinish), [yoke, 0.05, 0.05], { at: [side * (edge + yoke / 2), y, 0] });
      }
      addArray(model, name, array, [side * (edge + yoke), y, 0], side, lift);
    }
  }
}

/** A body of trapezoidal section, extruded along the velocity. */
export interface TrapezoidBody {
  /** Width of the Earth-facing side. */
  nadirWidth: number;
  /** Width of the zenith side. */
  zenithWidth: number;
  /** From the Earth-facing side to the zenith side. */
  height: number;
  /** Along the velocity. */
  length: number;
}

/** Adds a trapezoidal body centred on the origin. */
export function addTrapezoidBody(model: Model, name: string, skin: Material, body: TrapezoidBody): void {
  const [nadir, zenith, half] = [body.nadirWidth / 2, body.zenithWidth / 2, body.height / 2];
  model.prism(
    name,
    skin,
    [
      [-nadir, -half],
      [nadir, -half],
      [zenith, half],
      [-zenith, half],
    ],
    body.length,
    { at: [0, 0, 0] },
  );
}

/** Which way a dish opens. */
export type Facing = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";

/** The turn that points a dish, which opens towards +y, the way `facing` says. */
const FACING: Record<Facing, Rotation[]> = {
  "+y": [],
  "-y": [{ axis: "x", degrees: 180 }],
  "+z": [{ axis: "x", degrees: 90 }],
  "-z": [{ axis: "x", degrees: -90 }],
  "+x": [{ axis: "z", degrees: -90 }],
  "-x": [{ axis: "z", degrees: 90 }],
};

/**
 * A parabolic dish, `radius` across and opening towards `facing`, its vertex at
 * `at`; with a `mount` on the body, a black arm runs from there to the vertex.
 */
export function addDish(model: Model, name: string, finish: DishFinish, radius: number, at: [number, number, number], facing: Facing, mount?: [number, number, number]): void {
  if (mount) {
    const d = [at[0] - mount[0], at[1] - mount[1], at[2] - mount[2]] as const;
    const reach = Math.hypot(...d);
    if (reach > 0) {
      // Tilt the arm's long x axis up to the elevation, then turn it to the azimuth.
      const elevation = (Math.atan2(d[1], Math.hypot(d[0], d[2])) * 180) / Math.PI;
      const azimuth = (Math.atan2(-d[2], d[0]) * 180) / Math.PI;
      model.box(`${name}-arm`, material(model, "black"), [reach, 0.05, 0.05], {
        at: [(at[0] + mount[0]) / 2, (at[1] + mount[1]) / 2, (at[2] + mount[2]) / 2],
        rotate: [
          { axis: "z", degrees: elevation },
          { axis: "y", degrees: azimuth },
        ],
      });
    }
  }
  model.dish(name, material(model, finish), radius, radius * 0.4, 4, 16, { at, rotate: FACING[facing] });
}

/** A Hall thruster's nozzle on the fore (1) or aft (-1) end face at z = `face`. */
export function addThruster(model: Model, face: number, end: 1 | -1, radius: number, at: [number, number] = [0, 0]): void {
  const length = 2 * radius;
  model.cylinder("thruster", material(model, "black"), radius, length, 12, {
    at: [at[0], at[1], end * (face + length / 2)],
    rotate: { axis: "x", degrees: 90 },
  });
}
