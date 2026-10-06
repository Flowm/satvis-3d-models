// Primitives for the generated models. Each part is its own node and mesh, placed by
// the node's transform, which build.ts bakes into the vertices.

import { Document, type Material, type vec3, type vec4 } from "@gltf-transform/core";

/** A part's placement: its centre, and a rotation applied about that centre. */
export interface Placement {
  at: vec3;
  rotate?: { axis: "x" | "y" | "z"; degrees: number };
}

/** Linear colour, metalness and roughness, as glTF's metal-rough material takes them. */
export interface Finish {
  color: vec3;
  metallic: number;
  roughness: number;
  /** For open surfaces seen from both sides, such as a dish. */
  doubleSided?: boolean;
}

export class Model {
  readonly doc = new Document();
  readonly #buffer = this.doc.createBuffer();
  readonly #scene = this.doc.createScene();
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

  /** A half sphere on its flat base, bulging towards +y: a radome. */
  dome(name: string, material: Material, radius: number, rings: number, segments: number, placement: Placement): void {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    for (let ring = 0; ring <= rings; ring++) {
      const polar = (Math.PI / 2) * (ring / rings);
      for (let i = 0; i <= segments; i++) {
        const a = (2 * Math.PI * i) / segments;
        const n: vec3 = [Math.sin(polar) * Math.cos(a), Math.cos(polar), Math.sin(polar) * Math.sin(a)];
        positions.push(...n.map((v) => v * radius));
        normals.push(...n);
      }
    }
    const row = segments + 1;
    for (let ring = 0; ring < rings; ring++) {
      for (let i = 0; i < segments; i++) {
        const [p, q] = [ring * row + i, (ring + 1) * row + i];
        indices.push(p, p + 1, q + 1, p, q + 1, q);
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
    for (let ring = 0; ring <= rings; ring++) {
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
    for (let ring = 0; ring < rings; ring++) {
      for (let i = 0; i < segments; i++) {
        const [p, q] = [ring * row + i, (ring + 1) * row + i];
        indices.push(p, p + 1, q + 1, p, q + 1, q);
      }
    }
    this.#add(name, material, positions, normals, indices, placement);
  }

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
      node.setRotation(quaternion(placement.rotate.axis, placement.rotate.degrees));
    }
    this.#scene.addChild(node);
  }
}

function quaternion(axis: "x" | "y" | "z", degrees: number): vec4 {
  const half = (degrees * Math.PI) / 360;
  const s = Math.sin(half);
  return [axis === "x" ? s : 0, axis === "y" ? s : 0, axis === "z" ? s : 0, Math.cos(half)];
}
