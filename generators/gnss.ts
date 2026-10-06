// Navigation satellites: GLONASS-M, BeiDou-3 MEO (CAST and SECM), GPS IIR, IIF and III,
// and Galileo FOC. In the frame build.yaml describes: +Y zenith, +X port, metres.
//
// All of them yaw-steer: the antenna face points at the Earth, the arrays turn about
// the cross-track axis, and the satellite yaws to keep them facing the Sun
// (Montenbruck et al., Advances in Space Research 56:1015, 2015). So +X here is the
// solar array axis, and +Z the body axis the yaw steering keeps in the orbit plane,
// which is along the velocity only near noon and midnight.
//
// Body sizes, array areas and the offsets of antennas and retro-reflectors come from
// the satellite metadata used for orbit determination: the IGS metadata SINEX
// (files.igs.org/pub/station/general/igs_satellite_metadata.snx), the European GNSS
// Service Centre's Galileo metadata (gsc-europa.eu), and the papers that publish
// box-wing models: Duan et al. 2020 (J Geod 94:72, GLONASS; GPS Solut 24, GPS),
// Steigenberger et al. 2020 (GPS III), and the CSNO metadata in Satellite Navigation
// 2:20 (2021) and Remote Sensing 16:3900 (2024) for BeiDou. Where a paper gives an
// area and not a size, panel sizes are fitted to the area and the published span.
// Antenna details are read off photos and renders and are approximate.

import type { Document } from "@gltf-transform/core";

import { addWings, type FinishName, material } from "./assembly.ts";
import { Model } from "./parts.ts";

/**
 * The L-band navigation antenna's helices, white cylinders pointing at the Earth from
 * the plane y = `face`: `count` on a ring of `ringRadius` round `centre` (x, z), and
 * `inner` more on a ring of half that radius.
 */
function addHelices(model: Model, face: number, centre: [number, number], ringRadius: number, count: number, inner: number, size: [number, number]): void {
  const white = material(model, "white");
  const [radius, height] = size;
  for (const [ring, n] of [
    [ringRadius, count],
    [ringRadius / 2, inner],
  ] as const) {
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      model.cylinder(`helix-${ring}-${i}`, white, radius, height, 8, { at: [centre[0] + ring * Math.cos(a), face - height / 2, centre[1] + ring * Math.sin(a)] });
    }
  }
}

/** A laser retro-reflector array: a dark plate facing the Earth. */
function addRetroReflector(model: Model, size: [number, number], at: [number, number, number]): void {
  model.box("retro-reflector", material(model, "blackMli"), [size[0], 0.05, size[1]], { at });
}

/** A box of `size` (x, y, z) at `centre`, in a shared finish. */
function addBox(model: Model, name: string, finish: FinishName, size: [number, number, number], centre: [number, number, number] = [0, 0, 0]): void {
  model.box(name, material(model, finish), size, { at: centre });
}

/**
 * GLONASS-M (Uragan-M): a pressurised cylinder, Ø1.63 × 2.03 m, on the Earth-facing
 * antenna platform, which overhangs it by 0.5 m (Duan et al. 2020); 12 helices; the
 * arrays total 30.85 m² (IGSMAIL-5104), two wings of 2 × 2 panels, which at 3.4 m wide
 * reach about 12.8 m tip to tip. Duan et al. put the overhang on the sunlit side and
 * IGSMAIL-5104 the antenna 0.545 m to the anti-Sun side, which cannot both hold; the
 * antenna is drawn on the overhang.
 */
export function glonassM(): Document {
  const model = new Model();
  model.cylinder("pressure-vessel", material(model, "silverMli"), 0.815, 2.03, 24, { at: [0, 0, 0] });
  addBox(model, "equipment", "blackMli", [1.3, 0.5, 1.3], [0, -1.25, 0]);
  addBox(model, "antenna-platform", "gold", [1.4, 0.2, 2.13], [0, -1.6, -0.25]);
  addHelices(model, -1.7, [0, -0.55], 0.45, 8, 4, [0.04, 0.33]);
  addRetroReflector(model, [0.45, 0.45], [0, -1.73, 0.14]);
  addWings(model, { array: { span: 4.6, width: 3.4, columns: 2, rows: 2 }, edge: 0.815, yoke: 1.0, y: 0.4 });
  return model.doc;
}

/**
 * BeiDou-3 MEO from CAST: a T-shaped body of a 1.68 × 1.30 × 1.30 m section and a
 * 1.00 × 1.30 × 0.85 m one (CSNO), arrays totalling 20.44 m², three panels per wing.
 */
export function beidou3Cast(): Document {
  const model = new Model();
  addBox(model, "body-earth", "gold", [1.3, 1.3, 1.68], [0, -0.6, 0]);
  addBox(model, "body-zenith", "white", [1.3, 0.85, 1.0], [0, 0.48, 0]);
  addHelices(model, -1.25, [0, -0.2], 0.4, 6, 3, [0.05, 0.4]);
  addRetroReflector(model, [0.3, 0.3], [0.09, -1.28, 0.59]);
  addWings(model, { array: { span: 6.4, width: 1.6, columns: 1, rows: 3 }, edge: 0.65, yoke: 0.6 });
  return model.doc;
}

/**
 * BeiDou-3 MEO from SECM, both series: a 2.55 × 1.02 × 1.51 m box (series A; B is
 * 2.80 × 0.92 × 1.35 m), gold MLI with white radiators, and arrays totalling
 * 10.8 m², three long panels per wing (CSNO).
 */
export function beidou3Secm(): Document {
  const model = new Model();
  addBox(model, "body", "gold", [1.02, 1.51, 2.55]);
  for (const side of [1, -1]) {
    addBox(model, `radiator-${side}`, "white", [0.02, 1.3, 2.3], [side * 0.52, 0, 0]);
  }
  addBox(model, "antenna-plate", "silverMli", [0.9, 0.05, 1.4], [0, -0.78, 0.3]);
  addHelices(model, -0.805, [0.1, 0.1], 0.3, 6, 3, [0.05, 0.4]);
  // Below the plate, so the two faces do not coincide, and 0.13 m inboard of its
  // published place to stay within the body's outline.
  addRetroReflector(model, [0.3, 0.3], [-0.3, -0.835, 0.61]);
  addWings(model, { array: { span: 4.3, width: 1.26, columns: 1, rows: 3 }, edge: 0.51, yoke: 0.5 });
  return model.doc;
}

/**
 * GPS IIR and IIR-M (Lockheed Martin): a 2.0 × 2.06 × 2.12 m gold box with a helix
 * array of 12 on the Earth face; arrays of 13.92 m² on two wings of two panels, an
 * 11.4 m span (Steigenberger et al. 2020; Duan et al. 2020).
 */
export function gpsIIR(): Document {
  const model = new Model();
  addBox(model, "body", "gold", [2.0, 2.06, 2.12]);
  addHelices(model, -1.03, [0, 0], 0.55, 8, 4, [0.06, 0.5]);
  addWings(model, { array: { span: 3.8, width: 1.83, columns: 1, rows: 2 }, edge: 1.0, yoke: 0.9 });
  return model.doc;
}

/**
 * GPS IIF (Boeing): a 2.06 × 1.8 × 2.5 m gold box, its helix cluster towards one end,
 * and arrays of 22.25 m² on two wings of three panels, a 17.5 m span.
 */
export function gpsIIF(): Document {
  const model = new Model();
  addBox(model, "body", "gold", [2.06, 1.8, 2.5]);
  addBox(model, "radiator", "white", [2.06, 0.02, 2.5], [0, 0.91, 0]);
  addBox(model, "antenna-frame", "blackMli", [1.4, 0.06, 1.4], [0, -0.93, 0.4]);
  addHelices(model, -0.96, [0, 0.4], 0.5, 8, 4, [0.06, 0.5]);
  addWings(model, { array: { span: 6.9, width: 1.61, columns: 1, rows: 3 }, edge: 1.03, yoke: 0.8 });
  return model.doc;
}

/**
 * GPS III (Lockheed Martin A2100): a 1.78 × 3.40 × 2.46 m box, tall towards the Earth,
 * silver MLI on its sunlit face and black on the other (Steigenberger et al. 2020);
 * 12 helices; arrays of 28.2 m² on V-yokes, two panels per wing, a 15 m span.
 */
export function gpsIII(): Document {
  const model = new Model();
  addBox(model, "body", "silverMli", [1.78, 3.4, 2.46]);
  addBox(model, "anti-sun", "blackMli", [1.78, 3.4, 0.02], [0, 0, -1.24]);
  addHelices(model, -1.7, [0, 0], 0.55, 8, 4, [0.05, 0.6]);
  model.cylinder("launch-adapter", material(model, "aluminium"), 0.6, 0.3, 24, { at: [0, 1.85, 0] });
  addWings(model, { array: { span: 4.7, width: 3.0, columns: 1, rows: 2 }, edge: 0.89, yoke: 2.0, spread: [0.8, 0.2] });
  return model.doc;
}

/**
 * Galileo FOC (OHB): a 1.2 × 1.1 × 2.53 m body in black Kapton MLI; two wings of two
 * 2.5 × 1.082 m panels on white yokes, 14.67 m tip to tip (GSC metadata). The L-band
 * antenna is a disc on the Earth face, with the retro-reflector and the search-and-
 * rescue antenna beside it.
 */
export function galileoFoc(): Document {
  const model = new Model();
  addBox(model, "body", "blackMli", [1.2, 1.1, 2.53]);
  model.cylinder("l-band", material(model, "gold"), 0.6, 0.08, 24, { at: [0, -0.59, 0.17] });
  addRetroReflector(model, [0.35, 0.3], [-0.03, -0.575, 1.01]);
  model.cylinder("search-and-rescue", material(model, "white"), 0.3, 0.2, 6, { at: [0, -0.65, -0.85] });
  addWings(model, { array: { span: 5.0, width: 1.082, columns: 1, rows: 2 }, edge: 0.6, yoke: 1.735, yokeFinish: "white" });
  return model.doc;
}
