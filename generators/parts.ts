// Primitives for the generated models. Each part is its own node and mesh, placed by
// the node's transform, which build.ts bakes into the vertices.

import { Document, type Material, type vec3, type vec4 } from "@gltf-transform/core";

/** A turn about one of the frame's axes, right-handed. */
export interface Rotation {
  /** The frame axis turned about. */
  axis: "x" | "y" | "z";
  /** Counter-clockwise looking down the axis towards the origin. */
  degrees: number;
}

/** A part's placement: its centre, and a rotation applied about that centre. */
export interface Placement {
  /** The centre, in metres. */
  at: vec3;
  /** One turn, or several applied in order, each about the frame's own axes. */
  rotate?: Rotation | Rotation[];
}

/** Linear colour, metalness and roughness, as glTF's metal-rough material takes them. */
export interface Finish {
  /** Linear RGB, 0 to 1. */
  color: vec3;
  /** 0 for a dielectric, 1 for a metal. */
  metallic: number;
  /** 0 for a mirror, 1 for a matte surface. */
  roughness: number;
  /** For open surfaces seen from both sides, such as a dish. */
  doubleSided?: boolean;
}

/** A generated model under construction: parts added one by one to a glTF document. */
export class Model {
  /** The document the parts go into, which a generator returns. */
  readonly doc = new Document();
  /** The one buffer every part's accessors share. */
  readonly #buffer = this.doc.createBuffer();
  /** The scene every part's node joins. */
  readonly #scene = this.doc.createScene();
  /** Materials by finish name, so a finish used twice is one material. */
  readonly #materials = new Map<string, Material>();

  /** One material per finish name, shared by every part that uses it. */
  material(name: string, finish: Finish): Material {
    let material = this.#materials.get(name);
    if (!material) {
      material = this.doc
        .createMaterial(name)
        .setBaseColorFactor([...finish.color, 1])
        .setMetallicFactor(finish.metallic)
        .setRoughnessFactor(finish.roughness)
        .setDoubleSided(finish.doubleSided ?? false);
      this.#materials.set(name, material);
    }
    return material;
  }

  /** A box of `size` (x, y, z) metres, one flat-shaded quad per face. */
  box(name: string, material: Material, size: vec3, placement: Placement): void {
    const [hx, hy, hz] = size.map((v) => v / 2) as vec3;
    const faces: Array<[vec3, vec3[]]> = [
      [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
      [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
      [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]],
      [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
      [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
      [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
    ];
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    for (const [normal, corners] of faces) {
      const base = positions.length / 3;
      for (const [x, y, z] of corners) {
        positions.push(x * hx, y * hy, z * hz);
        normals.push(...normal);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    this.#add(name, material, positions, normals, indices, placement);
  }

  /**
   * A convex polygon in the x-y plane, counter-clockwise seen from +z, extruded
   * `length` along z and centred on z = 0: a trapezoidal or hexagonal body.
   */
  prism(name: string, material: Material, polygon: Array<[number, number]>, length: number, placement: Placement): void {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const h = length / 2;
    for (const [i, [x0, y0]] of polygon.entries()) {
      const [x1, y1] = polygon[(i + 1) % polygon.length]!;
      const n = Math.hypot(y1 - y0, x0 - x1);
      const normal: vec3 = [(y1 - y0) / n, (x0 - x1) / n, 0];
      const base = positions.length / 3;
      positions.push(x0, y0, -h, x1, y1, -h, x1, y1, h, x0, y0, h);
      for (let k = 0; k < 4; k++) {
        normals.push(...normal);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    for (const [z, nz] of [
      [h, 1],
      [-h, -1],
    ] as const) {
      const base = positions.length / 3;
      for (const [x, y] of polygon) {
        positions.push(x, y, z);
        normals.push(0, 0, nz);
      }
      for (let i = 1; i < polygon.length - 1; i++) {
        indices.push(...(nz > 0 ? [base, base + i, base + i + 1] : [base, base + i + 1, base + i]));
      }
    }
    this.#add(name, material, positions, normals, indices, placement);
  }

  /** A closed cylinder along y, smooth-shaded around and flat on the caps. */
  cylinder(name: string, material: Material, radius: number, height: number, segments: number, placement: Placement): void {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const h = height / 2;
    for (let i = 0; i <= segments; i++) {
      const a = (2 * Math.PI * i) / segments;
      const [x, z] = [Math.cos(a), Math.sin(a)];
      positions.push(radius * x, -h, radius * z, radius * x, h, radius * z);
      normals.push(x, 0, z, x, 0, z);
    }
    for (let i = 0; i < segments; i++) {
      const s = 2 * i;
      indices.push(s, s + 1, s + 3, s, s + 3, s + 2);
    }
    for (const [y, ny] of [
      [h, 1],
      [-h, -1],
    ] as const) {
      const centre = positions.length / 3;
      positions.push(0, y, 0);
      normals.push(0, ny, 0);
      for (let i = 0; i < segments; i++) {
        const a = (2 * Math.PI * i) / segments;
        positions.push(radius * Math.cos(a), y, radius * Math.sin(a));
        normals.push(0, ny, 0);
      }
      for (let i = 0; i < segments; i++) {
        const [p, q] = [centre + 1 + i, centre + 1 + ((i + 1) % segments)];
        indices.push(...(ny > 0 ? [centre, q, p] : [centre, p, q]));
      }
    }
    this.#add(name, material, positions, normals, indices, placement);
  }

  /** An open paraboloid of `radius` and `depth`, opening towards +y. */
  dish(name: string, material: Material, radius: number, depth: number, rings: number, segments: number, placement: Placement): void {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const k = depth / (radius * radius);
    // The vertex, then rings outwards from it: a fan to the first ring, quads beyond.
    positions.push(0, 0, 0);
    normals.push(0, 1, 0);
    for (let ring = 1; ring <= rings; ring++) {
      const r = radius * (ring / rings);
      for (let i = 0; i <= segments; i++) {
        const a = (2 * Math.PI * i) / segments;
        const [x, z] = [r * Math.cos(a), r * Math.sin(a)];
        positions.push(x, k * r * r, z);
        // Into the bowl: the gradient of y - k(x² + z²).
        const n = [-2 * k * x, 1, -2 * k * z];
        const length = Math.hypot(...n);
        normals.push(...n.map((v) => v / length));
      }
    }
    const row = segments + 1;
    const ringStart = (ring: number): number => 1 + (ring - 1) * row;
    for (let i = 0; i < segments; i++) {
      indices.push(0, ringStart(1) + i + 1, ringStart(1) + i);
    }
    for (let ring = 1; ring < rings; ring++) {
      for (let i = 0; i < segments; i++) {
        const [p, q] = [ringStart(ring) + i, ringStart(ring + 1) + i];
        indices.push(p, p + 1, q + 1, p, q + 1, q);
      }
    }
    this.#add(name, material, positions, normals, indices, placement);
  }

  /** Adds one part as its own node and mesh, placed by the node's transform. */
  #add(name: string, material: Material, positions: number[], normals: number[], indices: number[], placement: Placement): void {
    const doc = this.doc;
    const primitive = doc
      .createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(this.#buffer))
      .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(normals)).setBuffer(this.#buffer))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(indices)).setBuffer(this.#buffer))
      .setMaterial(material);
    const node = doc
      .createNode(name)
      .setMesh(doc.createMesh(name).addPrimitive(primitive))
      .setTranslation(placement.at);
    if (placement.rotate) {
      node.setRotation(orientation(placement.rotate));
    }
    this.#scene.addChild(node);
  }
}

/** `v` turned by `rotate`, as a part placed with it turns its own offsets. */
export function rotateVector(rotate: Rotation | Rotation[], v: vec3): vec3 {
  const [x, y, z, w] = orientation(rotate);
  // v + 2w(q × v) + 2q × (q × v), for the unit quaternion (q, w).
  const t: vec3 = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
  return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
}

/** The quaternion of one turn, or of several applied in order. */
function orientation(rotate: Rotation | Rotation[]): vec4 {
  let q: vec4 = [0, 0, 0, 1];
  for (const { axis, degrees } of Array.isArray(rotate) ? rotate : [rotate]) {
    const half = (degrees * Math.PI) / 360;
    const s = Math.sin(half);
    const [bx, by, bz, bw] = q;
    const [ax, ay, az, aw]: vec4 = [axis === "x" ? s : 0, axis === "y" ? s : 0, axis === "z" ? s : 0, Math.cos(half)];
    // a × b: the new turn after the ones before it.
    q = [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
  }
  return q;
}
