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
 * antenna is drawn on the overhang. The wings' yokes enter the cylinder's zenith end,
 * opposite the antenna (ISS Reshetnev's render, Montenbruck et al. 2015 fig. 6; the
 * full-scale mock-up at Park Patriot).
 */
export function glonassM(): Document {
  const model = new Model();
  model.cylinder("pressure-vessel", material(model, "silverMli"), 0.815, 2.03, 24, { at: [0, 0, 0] });
  addBox(model, "equipment", "blackMli", [1.3, 0.5, 1.3], [0, -1.25, 0]);
  addBox(model, "antenna-platform", "gold", [1.4, 0.2, 2.13], [0, -1.6, -0.25]);
  addHelices(model, -1.7, [0, -0.55], 0.45, 8, 4, [0.04, 0.33]);
  addRetroReflector(model, [0.45, 0.45], [0, -1.73, 0.14]);
  addWings(model, { array: { span: 4.6, width: 3.4, columns: 2, rows: 2 }, edge: 0.815, yoke: 1.0, y: 0.85 });
  return model.doc;
}

/**
 * BeiDou-3 MEO from CAST: a T-shaped body of a 1.68 × 1.30 × 1.30 m section and a
 * 1.00 × 1.30 × 0.85 m one (CSNO), arrays totalling 20.44 m², three panels per wing.
 * The array-side faces are optical solar reflectors (CSNO, Remote Sensing 17:1068);
 * the sun-side face is MLI flush across both sections, so the step is on the anti-Sun
 * side, its riser an OSR and the Earth section's face below it black.
 */
export function beidou3Cast(): Document {
  const model = new Model();
  addBox(model, "body-earth", "gold", [1.3, 1.3, 1.68], [0, -0.6, 0]);
  addBox(model, "body-zenith", "gold", [1.3, 0.85, 1.0], [0, 0.48, 0.34]);
  for (const side of [1, -1]) {
    addBox(model, `osr-earth-${side}`, "silverMli", [0.02, 1.26, 1.64], [side * 0.66, -0.6, 0]);
    addBox(model, `osr-zenith-${side}`, "silverMli", [0.02, 0.81, 0.96], [side * 0.66, 0.48, 0.34]);
  }
  addBox(model, "osr-step", "silverMli", [1.26, 0.81, 0.02], [0, 0.48, -0.17]);
  addBox(model, "anti-sun", "black", [1.26, 1.26, 0.02], [0, -0.6, -0.85]);
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
 * GPS IIR and IIR-M (Lockheed Martin): a gold box 62 in wide, 77 in deep and 87 in
 * high (Space Force fact sheet), the 62 in along the array axis as Lockheed's drawing
 * (Montenbruck et al. 2015, fig. 4) proportions it, with a helix array of 12 on the
 * Earth face; arrays of 13.92 m² on two wings of two panels, an 11.4 m span
 * (Steigenberger et al. 2020; Duan et al. 2020); and the W-sensor antennas, a large
 * low-band "Christmas tree" at one end and a small high-band one at the other: masts
 * parallel to the boresight, hung from booms at their zenith ends and reaching
 * Earthward, with crossed dipoles (the drawing; the US Government's IIR artwork),
 * their sizes read off the drawing.
 */
export function gpsIIR(): Document {
  const model = new Model();
  const [width, height, length] = [1.57, 2.21, 1.96];
  addBox(model, "body", "gold", [width, height, length]);
  addHelices(model, -height / 2, [0, 0], 0.55, 8, 4, [0.06, 0.5]);
  addWings(model, { array: { span: 3.8, width: 1.83, columns: 1, rows: 2 }, edge: width / 2, yoke: 1.1 });
  const boomHeight = 0.6;
  for (const [end, boom, mast, bars, widest, narrowest] of [
    [1, 1.5, 3.0, 7, 3.4, 1.8],
    [-1, 1.1, 1.5, 6, 1.5, 0.9],
  ] as const) {
    const z = end * (length / 2 + boom);
    addBox(model, `w-sensor-boom-${end}`, "black", [0.05, 0.05, boom], [0, boomHeight, end * (length / 2 + boom / 2)]);
    addBox(model, `w-sensor-mast-${end}`, "aluminium", [0.05, mast, 0.05], [0, boomHeight - mast / 2, z]);
    // Crossed dipoles, widest at the top, ±45° to the body's axes.
    for (let i = 0; i < bars; i++) {
      const bar = widest - (i * (widest - narrowest)) / (bars - 1);
      const y = boomHeight - 0.15 - (i * (mast - 0.3)) / (bars - 1);
      for (const degrees of [45, -45]) {
        model.box(`w-sensor-bar-${end}-${i}-${degrees}`, material(model, "aluminium"), [bar, 0.03, 0.03], { at: [0, y, z], rotate: { axis: "y", degrees } });
      }
    }
  }
  return model.doc;
}

/**
 * GPS IIF (Boeing): a 2.06 × 2.24 × 2.5 m gold box, 88 in high radially (Space Force
 * fact sheet), its helix cluster towards one end, and arrays of 22.25 m² on two wings
 * of three panels, a 17.5 m span.
 */
export function gpsIIF(): Document {
  const model = new Model();
  addBox(model, "body", "gold", [2.06, 2.24, 2.5]);
  addBox(model, "radiator", "white", [2.06, 0.02, 2.5], [0, 1.13, 0]);
  addBox(model, "antenna-frame", "blackMli", [1.4, 0.06, 1.4], [0, -1.15, 0.4]);
  addHelices(model, -1.18, [0, 0.4], 0.5, 8, 4, [0.06, 0.5]);
  addWings(model, { array: { span: 6.9, width: 1.61, columns: 1, rows: 3 }, edge: 1.03, yoke: 0.8 });
  return model.doc;
}

/**
 * GPS III (Lockheed Martin A2100): a box 2.46 m along the array axis, 3.40 m tall
 * towards the Earth and 1.78 m deep (fact sheet; the 7.5 m² sun and anti-Sun faces of
 * Steigenberger et al. 2020's box-wing model put the 2.46 m there), silver MLI on its
 * sunlit face and black on the other,
 * the faces the arrays mount on white (Lockheed's factory photo); 12 helices; arrays
 * of 28.2 m² on V-yokes, two panels per wing, a 15 m span.
 */
export function gpsIII(): Document {
  const model = new Model();
  addBox(model, "body", "silverMli", [2.46, 3.4, 1.78]);
  addBox(model, "anti-sun", "blackMli", [2.46, 3.4, 0.02], [0, 0, -0.9]);
  for (const side of [1, -1]) {
    addBox(model, `array-face-${side}`, "white", [0.02, 3.3, 1.68], [side * 1.24, 0, 0]);
  }
  addHelices(model, -1.7, [0, 0], 0.55, 8, 4, [0.05, 0.6]);
  model.cylinder("launch-adapter", material(model, "aluminium"), 0.6, 0.3, 24, { at: [0, 1.85, 0] });
  addWings(model, { array: { span: 4.7, width: 3.0, columns: 1, rows: 2 }, edge: 1.23, yoke: 1.57, spread: [0.8, 0.2] });
  return model.doc;
}

/**
 * Galileo FOC (OHB): a 1.2 × 1.1 × 2.53 m body in black Kapton MLI; two wings of two
 * 2.5 × 1.082 m panels on white yokes, 14.67 m tip to tip (GSC metadata). The L-band
 * antenna is a disc on the Earth face, with the retro-reflector and the search-and-
 * rescue antenna beside it. About half the skin is optical solar reflector: on the
 * array-side faces, part of the zenith face and the clock panel's end face (GSC's
 * optical properties).
 */
export function galileoFoc(): Document {
  const model = new Model();
  addBox(model, "body", "blackMli", [1.2, 1.1, 2.53]);
  for (const side of [1, -1]) {
    addBox(model, `osr-${side}`, "silverMli", [0.02, 1.0, 1.5], [side * 0.61, 0, 0]);
  }
  addBox(model, "osr-zenith", "silverMli", [0.95, 0.02, 0.9], [0, 0.56, 0]);
  addBox(model, "osr-clock-panel", "silverMli", [1.0, 0.88, 0.02], [0, 0, -1.275]);
  model.cylinder("l-band", material(model, "gold"), 0.6, 0.08, 24, { at: [0, -0.59, 0.17] });
  addRetroReflector(model, [0.35, 0.3], [-0.03, -0.575, 1.01]);
  model.cylinder("search-and-rescue", material(model, "white"), 0.3, 0.2, 6, { at: [0, -0.65, -0.85] });
  addWings(model, { array: { span: 5.0, width: 1.082, columns: 1, rows: 2 }, edge: 0.6, yoke: 1.735, yokeFinish: "white" });
  return model.doc;
}
