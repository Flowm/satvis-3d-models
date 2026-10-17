// Generic geostationary communications satellites, one per bus. In the frame build.yaml
// describes: +Z velocity, +Y zenith, +X port, metres.
//
// All share the layout of a three-axis geostationary comsat: the body's long
// axis points at the Earth, the apogee engine on the far end; the arrays turn on the
// north and south faces, which carry the radiators and, in a geostationary orbit, lie
// across the velocity; two deployed reflectors hang off the east and west faces, the
// leading and trailing ones, lit by feeds at the Earth deck's edge; a smaller
// reflector stands on the Earth deck. Payloads differ from satellite to satellite, so
// the antennas are placeholders: sizes and positions are estimated, as is which way
// the body's sides run where only its outline is published. Unless a function says
// otherwise, its body and span are GCAT's medians for the bus's satellites in orbit,
// and its panel count is an estimate that fills the span.

import type { Document } from "@gltf-transform/core";

import { addWings, material } from "./assembly.ts";
import { Model } from "./parts.ts";

/** A bus's outline. */
interface Comsat {
  /** North to south: the side the arrays turn on. */
  width: number;
  /** From the Earth deck to the anti-Earth face. */
  height: number;
  /** East to west, along the velocity. */
  depth: number;
  /** Tip to tip across both arrays. */
  span: number;
  /** Panels in each wing. */
  panels: number;
  /** Each panel's width, along the velocity. */
  panelWidth: number;
  /** From the body's side to a wing's first panel. */
  yoke: number;
  /** The east and west reflectors' radius. */
  reflector: number;
}

/**
 * Eurostar 3000: GCAT's median outline for the bus in orbit, 2.7 m across, 5.5 m
 * high and 39 m across the arrays, and the "L" array of four long panels a wing
 * (Airbus's variants run from three short panels to five long ones).
 */
export function eurostar3000(): Document {
  return comsat({ width: 2.7, height: 5.5, depth: 2.7, span: 39, panels: 4, panelWidth: 2.4, yoke: 2, reflector: 1.25 });
}

/**
 * Boeing 702HP: GCAT's 3 m across, 6 m high and 40.9 m across the arrays, with five
 * flat panels a wing, an estimate; the concentrator troughs of the first 702s, which
 * fogged in orbit, are not drawn.
 */
export function bss702hp(): Document {
  return comsat({ width: 3, height: 6, depth: 3, span: 40.9, panels: 5, panelWidth: 2.6, yoke: 2.5, reflector: 1.4 });
}

/**
 * DFH-4: a 2.36 × 2.1 × 3.6 m body and a 30 m span (CAST, via CGWIC); three panels a
 * wing is an estimate.
 */
export function dfh4(): Document {
  return comsat({ width: 2.1, height: 3.6, depth: 2.36, span: 30, panels: 3, panelWidth: 2.2, yoke: 2, reflector: 1.1 });
}

/**
 * Lockheed Martin A2100, its A, AX, AXS and M variants included: 2.5 m across, 6 m
 * high and 26.9 m across the arrays, the AX's outline. The A is smaller (1.9 × 4.4 m,
 * 18.9 m) and the AEHF's M longer (9.8 m).
 */
export function a2100(): Document {
  return comsat({ width: 2.5, height: 6, depth: 2.5, span: 26.9, panels: 4, panelWidth: 2.2, yoke: 2, reflector: 1.2 });
}

/** DFH-3 and DFH-3B, BeiDou-2's GEO and IGSO satellites among them: 1.7 × 3 m and 18 m. */
export function dfh3(): Document {
  return comsat({ width: 1.7, height: 3, depth: 1.7, span: 18, panels: 3, panelWidth: 1.6, yoke: 1.5, reflector: 0.8 });
}

/**
 * Thales Alenia Spacebus 4000, B2 to C4: 2.3 × 5 m and 30 m, the B2's outline; the
 * C3 and C4 reach 37 m.
 */
export function spacebus4000(): Document {
  return comsat({ width: 2.3, height: 5, depth: 2.3, span: 30, panels: 4, panelWidth: 2.2, yoke: 2, reflector: 1.1 });
}

/** Spacebus NEO: 3.5 × 8.4 m and 45 m, the NEO200's outline; the NEO100 is 2.5 × 5 m and 30 m. */
export function spacebusNeo(): Document {
  return comsat({ width: 3.5, height: 8.4, depth: 3.5, span: 45, panels: 5, panelWidth: 2.8, yoke: 2.5, reflector: 1.4 });
}

/** Airbus Eurostar Neo: 3 × 7 m and 40 m. */
export function eurostarNeo(): Document {
  return comsat({ width: 3, height: 7, depth: 3, span: 40, panels: 5, panelWidth: 2.6, yoke: 2.5, reflector: 1.4 });
}

/** Boeing 702SP, all-electric: 2.1 × 4.8 m and 40 m. */
export function bss702sp(): Document {
  return comsat({ width: 2.1, height: 4.8, depth: 2.1, span: 40, panels: 5, panelWidth: 2, yoke: 2, reflector: 1 });
}

/** ISRO's I-1K and I-2K, NavIC's satellites on the I-1K: 1.6 × 2.4 m and 9.5 m, the I-2K's outline. */
export function i2k(): Document {
  return comsat({ width: 1.6, height: 2.4, depth: 1.6, span: 9.5, panels: 2, panelWidth: 1.4, yoke: 1, reflector: 0.7 });
}

/** ISRO's I-3K: 1.8 × 3.1 m and 20 m. */
export function i3k(): Document {
  return comsat({ width: 1.8, height: 3.1, depth: 1.8, span: 20, panels: 3, panelWidth: 1.6, yoke: 2, reflector: 1 });
}

/**
 * ISS Reshetnev Ekspress-1000H, HTB, K and N: 2 × 4 m and 15 m. The plain
 * Ekspress-1000 is left out: GCAT puts GLONASS-K navigation satellites on it.
 */
export function ekspress1000(): Document {
  return comsat({ width: 2, height: 4, depth: 2, span: 15, panels: 2, panelWidth: 1.8, yoke: 1, reflector: 0.9 });
}

/** The body, its radiators and engine, the antennas, and two wings. */
function comsat(bus: Comsat): Document {
  const { width, height, depth, reflector } = bus;
  const model = new Model();
  const gold = material(model, "gold");
  const black = material(model, "black");
  const white = material(model, "white");
  const aluminium = material(model, "aluminium");
  const deck = -height / 2;

  model.box("body", gold, [width, height, depth], { at: [0, 0, 0] });
  for (const side of [1, -1]) {
    model.box(`radiator-${side}`, material(model, "mirror"), [0.02, height * 0.8, depth * 0.85], { at: [side * (width / 2 + 0.01), 0, 0] });
  }
  model.box("earth-deck", aluminium, [width, 0.04, depth], { at: [0, deck - 0.02, 0] });
  model.cylinder("apogee-engine", black, 0.25, 0.6, 16, { at: [0, height / 2 + 0.3, 0] });

  // The east and west reflectors, each tilted 45° to look down and in at its feed.
  for (const side of [1, -1]) {
    const reach = depth / 2 + reflector;
    const y = deck + reflector * 1.2;
    model.box(`reflector-arm-${side}`, black, [0.08, 0.08, reach - depth / 2], { at: [0, y, side * (depth / 2 + reach) / 2] });
    model.dish(`reflector-${side}`, white, reflector, reflector * 0.3, 4, 24, { at: [0, y, side * reach], rotate: { axis: "x", degrees: -side * 135 } });
    model.cylinder(`feed-${side}`, black, 0.15, 0.5, 12, { at: [0, deck - 0.29, side * (depth / 2 - 0.3)] });
  }
  model.cylinder("deck-tower", aluminium, 0.12, 0.6, 12, { at: [width / 4, deck - 0.34, 0] });
  model.dish("deck-reflector", white, reflector * 0.5, reflector * 0.15, 3, 20, { at: [width / 4, deck - 0.64, 0], rotate: { axis: "x", degrees: 180 } });

  const wing = (bus.span - width) / 2 - bus.yoke;
  addWings(model, { array: { span: wing, width: bus.panelWidth, columns: 1, rows: bus.panels }, edge: width / 2, yoke: bus.yoke });
  return model.doc;
}
