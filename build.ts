// Builds public/ and models.yaml from build.yaml (see README). A filter argument
// rebuilds only matching files, but every model is still measured into the manifest.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type Document, type Material, Node, NodeIO, Primitive, type Scene, Texture, type Transform, type vec3, type vec4 } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions";
import { compactPrimitive, dedup, draco, flatten, getBounds, join, prune, simplify, transformMesh, weld } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import YAML, { isMap, isScalar, isSeq } from "yaml";

import { CUBESATS } from "./generators/cubesat.ts";
import { a2100, bss702hp, bss702sp, dfh3, dfh3Navigation, dfh4, ekspress1000, eurostar3000, eurostarNeo, i1k, i2k, i3k, insat3d, spacebus4000, spacebusNeo } from "./generators/geostationary.ts";
import { beidou3Cast, beidou3Secm, galileoFoc, glonassM, gpsIIF, gpsIII, gpsIIR } from "./generators/gnss.ts";
import { globalstar2 } from "./generators/globalstar.ts";
import { guowang } from "./generators/guowang.ts";
import { iceye } from "./generators/iceye.ts";
import { iridiumNext } from "./generators/iridium.ts";
import { keplerTranche1, keplerTranche1Safire } from "./generators/kepler.ts";
import { kuiper } from "./generators/kuiper.ts";
import { o3b, o3bMpower } from "./generators/o3b.ts";
import { oneweb } from "./generators/oneweb.ts";
import { pelican, skySat, superDove } from "./generators/planet.ts";
import { qianfan } from "./generators/qianfan.ts";
import { tiangong } from "./generators/tiangong.ts";
import { starlinkV1, starlinkV2Mini, starlinkV2MiniDirectToCell, starlinkV3 } from "./generators/starlink.ts";

type Axis = "velocity" | "port" | "zenith";

interface Satellite {
  name: string;
  noradId: number;
  decayed?: string | boolean;
}

interface Source {
  name: string;
  url?: string;
  commit?: string;
  credit: string;
  license: string;
}

interface RecipeModel {
  file: string;
  satellites?: Satellite[];
  /** GCAT bus names: every satellite of these designs is depicted (ADR 0007 in satvis). */
  buses?: string[];
  role?: string;
  /** A fetched file at `path`, or a model built by one of GENERATORS. */
  source: { id: string; path?: string; generator?: string };
  removeNodes?: string[];
  /** A pattern of node names to remove with their children, for a source with hundreds of detail parts. */
  removeNodesMatching?: string;
  /** Mirrors the source along this axis before the rotation, for a source drawn mirror-image. */
  mirror?: Axis;
  /** Turns named nodes about one of their own axes before baking: joints a source poses wrongly. */
  turnNodes?: Array<{ node: string; axis: "x" | "y" | "z"; degrees: number }>;
  rotate?: Array<{ axis: Axis; degrees: number }>;
  scale?: number;
  stripFallbackTextures?: boolean;
  /** Drops textures whose images are files beside the source that its repository lacks. */
  dropExternalTextures?: boolean;
  /** Joins the meshes, one primitive per material, as a generated model's parts are. */
  join?: boolean;
  /** Simplifies the meshes within this error, a fraction of each joined mesh's extent. */
  simplify?: number;
  /** The longest texture edge in pixels, textures re-encoded as WebP. */
  textureSize?: number;
  /** Exceptions to textureSize, by texture name. */
  textureSizes?: Record<string, number>;
  /**
   * Replaces metallic-roughness and normal maps with this metallic factor: the maps read
   * as bare grey metal under Cesium's light, and normal detail is lost at satvis's range.
   */
  matte?: number;
  /** Turns alpha-blended materials into cut-outs; large blended surfaces sort wrongly in Cesium. */
  alphaMask?: boolean;
  /** Materials drawn opaque whatever their alpha, by name, where the alpha hides real surfaces. */
  opaqueMaterials?: string[];
  /** Linear RGB base colours by material name, replacing a colour texture that is wrong. */
  baseColors?: Record<string, [number, number, number]>;
  /**
   * Linear RGB colours by node-name pattern: the matching nodes get untextured copies
   * of their materials in that colour, for parts a shared texture maps wrongly.
   */
  nodeColors?: Record<string, [number, number, number]>;
  /**
   * A pattern of node names drawn single-sided: sheets modelled as two coincident faces,
   * front and back, that a double-sided material draws on top of each other.
   */
  singleSidedNodes?: string;
  /**
   * Draws closed, outward-wound parts single-sided: nothing outside sees their back faces,
   * and the GPU culls back faces before rasterising. Open sheets and cut-out or blended
   * materials, which show their insides, stay double-sided.
   */
  singleSidedClosed?: boolean;
  /** Lower-detail copies, built from this recipe, for when the model is small on screen. */
  lods?: RecipeLod[];
}

/**
 * A lower-detail copy of a model. Its simplification follows from maxPoints: at that
 * size no surface moves more than `error` points, and parts smaller than that go.
 */
interface RecipeLod {
  file: string;
  /** The model's bounding-sphere diameter on screen, in points, up to which apps draw this copy. */
  maxPoints: number;
  /** In points at maxPoints; 1 when left out. */
  error?: number;
  /** Replace the model's textureSize and textureSizes. */
  textureSize?: number;
  textureSizes?: Record<string, number>;
}

interface Recipe {
  sources: Record<string, Source>;
  models: RecipeModel[];
}

interface Measured {
  bytes: number;
  dimensions: number[];
  triangles: number;
  textures: string[];
  extensions: string[];
}

const modelsDir = fileURLToPath(new URL(".", import.meta.url));
const recipePath = path.join(modelsDir, "build.yaml");
const manifestPath = path.join(modelsDir, "models.yaml");
const cacheDir = path.join(modelsDir, ".cache");
// What satvis serves at /data/models/; a model's `file` is its path in here.
const publicDir = path.join(modelsDir, "public");

/**
 * Models built from code rather than fetched, by the name a recipe's source gives: the
 * file the model is written to, in lower case and without its extension.
 */
const GENERATORS: Record<string, () => Document> = {
  "starlink-v1": starlinkV1,
  "starlink-v2-mini": starlinkV2Mini,
  "starlink-v2-mini-direct-to-cell": starlinkV2MiniDirectToCell,
  "starlink-v3": starlinkV3,
  oneweb,
  kuiper,
  qianfan,
  guowang,
  "glonass-m": glonassM,
  "beidou-3-cast": beidou3Cast,
  "beidou-3-secm": beidou3Secm,
  "gps-iir": gpsIIR,
  "gps-iif": gpsIIF,
  "gps-iii": gpsIII,
  "galileo-foc": galileoFoc,
  "iridium-next": iridiumNext,
  iceye,
  "globalstar-2": globalstar2,
  o3b,
  "o3b-mpower": o3bMpower,
  superdove: superDove,
  skysat: skySat,
  pelican,
  "kepler-tranche-1": keplerTranche1,
  "kepler-tranche-1-safire": keplerTranche1Safire,
  ...CUBESATS,
  "eurostar-3000": eurostar3000,
  "bss-702hp": bss702hp,
  "dfh-4": dfh4,
  a2100,
  "dfh-3": dfh3,
  "spacebus-4000": spacebus4000,
  "spacebus-neo": spacebusNeo,
  "eurostar-neo": eurostarNeo,
  "bss-702sp": bss702sp,
  "i-2k": i2k,
  "i-3k": i3k,
  "ekspress-1000": ekspress1000,
  "dfh-3-navigation": dfh3Navigation,
  "i-1k": i1k,
  "insat-3d": insat3d,
  "css-(tianhe)": tiangong,
};

// Cesium flies glTF +Z along the velocity, +X to port and +Y to the zenith.
const FRAME_AXIS_TO_GLTF: Record<Axis, vec3> = { velocity: [0, 0, 1], port: [1, 0, 0], zenith: [0, 1, 0] };

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "draco3d.decoder": await draco3d.createDecoderModule(),
  "draco3d.encoder": await draco3d.createEncoderModule(),
});

const recipe = YAML.parse(await readFile(recipePath, "utf8")) as Recipe;
const filter = process.argv[2];
checkSatellitesUnique(recipe.models);
checkSources(recipe);
checkLods(recipe.models);

const entries = [];
for (const model of recipe.models) {
  const source = recipe.sources[model.source.id];
  if (!source) {
    throw new Error(`${model.file}: unknown source ${JSON.stringify(model.source.id)}`);
  }
  const output = path.join(publicDir, model.file);
  const rebuild = (model.source.path || model.source.generator) && (!filter || model.file.includes(filter));
  if (rebuild) {
    await build(model, source, output);
  }
  const measured = await measure(output);
  const lods = [];
  for (const lod of model.lods ?? []) {
    const lodOutput = path.join(publicDir, lod.file);
    if (rebuild) {
      const textures = lod.textureSize === undefined ? {} : { textureSize: lod.textureSize, textureSizes: lod.textureSizes };
      await build({ ...model, ...textures, file: lod.file }, source, lodOutput, lod);
    }
    lods.push({ file: lod.file, maxPoints: lod.maxPoints, measured: await measure(lodOutput) });
  }
  entries.push({
    file: model.file,
    ...(model.satellites ? { satellites: model.satellites } : {}),
    ...(model.buses ? { buses: model.buses } : {}),
    ...(model.role ? { role: model.role } : {}),
    credit: source.credit,
    license: source.license,
    measured,
    ...(lods.length > 0 ? { lods } : {}),
  });
  for (const { file, measured: { dimensions, triangles, bytes } } of [{ file: model.file, measured }, ...lods]) {
    console.log(`${file}: ${dimensions.map((d) => d.toFixed(2)).join(" x ")} m, ${triangles} triangles, ${(bytes / 1e3).toFixed(0)} kB`);
  }
}

const header = [
  "# Written by `pnpm build` from build.yaml; edit that instead.",
  "#",
  "# Every model in public/ and the satellites it depicts. satvis serves public/ at",
  "# /data/models/ and maps each NORAD id to its file. Dimensions are metres along",
  "# the velocity, across it and radially; the frame is described in build.yaml.",
  "#",
  "# A model's `lods` are lower-detail copies of its file, most detailed first. An app",
  "# may draw a copy while the model's bounding sphere spans at most its `maxPoints`",
  "# on screen, the copy with the smallest such maxPoints; above them all, `file`.",
];
// One line per satellite and per list of numbers or names, as in build.yaml.
const FLOW_KEYS = new Set(["satellites", "dimensions", "textures", "extensions"]);
const manifest = new YAML.Document({ models: entries });
YAML.visit(manifest, {
  Pair(_, pair) {
    if (isScalar(pair.key) && typeof pair.key.value === "string" && FLOW_KEYS.has(pair.key.value) && isSeq(pair.value)) {
      pair.value.flow = pair.key.value !== "satellites";
      for (const item of pair.value.items) {
        if (isMap(item)) {
          item.flow = true;
        }
      }
    }
  },
});
await writeFile(manifestPath, `${header.join("\n")}\n\n${manifest.toString({ lineWidth: 0 })}`);

/**
 * satvis gives a satellite one model, and a bus one model; two claiming either is a
 * recipe mistake.
 */
function checkSatellitesUnique(models: RecipeModel[]): void {
  const claimed = new Map<string, string>();
  for (const model of models) {
    const keys = [...(model.satellites ?? []).map(({ noradId }) => `NORAD ${noradId}`), ...(model.buses ?? []).map((bus) => `Bus ${JSON.stringify(bus)}`)];
    for (const key of keys) {
      const previous = claimed.get(key);
      if (previous !== undefined) {
        throw new Error(`${key} is claimed by both ${previous} and ${model.file}`);
      }
      claimed.set(key, model.file);
    }
  }
}

/** Every file written once, and each model's copies ordered by falling maxPoints, as the manifest promises. */
function checkLods(models: RecipeModel[]): void {
  const files = new Set<string>();
  for (const model of models) {
    for (const file of [model.file, ...(model.lods ?? []).map((lod) => lod.file)]) {
      if (files.has(file)) {
        throw new Error(`${file} is written twice`);
      }
      files.add(file);
    }
    (model.lods ?? []).reduce((previous, { file, maxPoints }) => {
      if (!(maxPoints > 0 && maxPoints < previous)) {
        throw new Error(`${file}: a copy's maxPoints must be positive and below the one before it`);
      }
      return maxPoints;
    }, Infinity);
  }
}

/**
 * Every model's source, checked before a filtered build skips any: a known source, a
 * generator that exists, and not both a generator and a path.
 */
function checkSources(recipe: Recipe): void {
  for (const model of recipe.models) {
    const { id, path: sourcePath, generator } = model.source;
    if (!recipe.sources[id]) {
      throw new Error(`${model.file}: unknown source ${JSON.stringify(id)}`);
    }
    if (generator !== undefined && sourcePath !== undefined) {
      throw new Error(`${model.file}: a source has a generator or a path, not both`);
    }
    if (generator !== undefined && !GENERATORS[generator]) {
      throw new Error(`${model.file}: unknown generator ${JSON.stringify(generator)}`);
    }
  }
}

function sceneOf(doc: Document, file: string): Scene {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) {
    throw new Error(`${file}: no scene`);
  }
  return scene;
}

/**
 * Builds one model into `output`: loads it, removes the listed nodes, bakes every
 * transform into the vertices, joins a generated model's parts, and writes it
 * Draco-compressed. Given a `lod`, it builds that lower-detail copy instead.
 */
async function build(model: RecipeModel, source: Source, output: string, lod?: RecipeLod): Promise<void> {
  const doc = await load(model, source);
  const root = doc.getRoot();

  const unmatched = new Set(model.removeNodes);
  for (const node of root.listNodes()) {
    if (unmatched.delete(node.getName())) {
      node.dispose();
    }
  }
  if (unmatched.size > 0) {
    throw new Error(`${model.file}: removeNodes names no node ${[...unmatched].join(", ")}; has the source changed?`);
  }
  if (model.removeNodesMatching) {
    const pattern = new RegExp(model.removeNodesMatching);
    const matching = root.listNodes().filter((node) => pattern.test(node.getName()));
    if (matching.length === 0) {
      throw new Error(`${model.file}: removeNodesMatching matches no node; has the source changed?`);
    }
    for (const node of matching) {
      node.dispose();
    }
  }

  // Reading keeps only the WebP, so prune() drops the PNG/JPEG fallback beside it.
  if (!model.stripFallbackTextures && root.listExtensionsUsed().some((ext) => ext.extensionName === "EXT_texture_webp")) {
    throw new Error(`${model.file}: the source uses EXT_texture_webp, so set stripFallbackTextures`);
  }

  untextureWithoutUVs(doc);
  makeSingleSided(doc, model);
  colorNodes(doc, model);
  for (const { node: name, axis, degrees } of model.turnNodes ?? []) {
    const node = root.listNodes().find((candidate) => candidate.getName() === name);
    if (!node) {
      throw new Error(`${model.file}: turnNodes names no node ${name}; has the source changed?`);
    }
    const half = (degrees * Math.PI) / 360;
    const turn: vec4 = [axis === "x" ? Math.sin(half) : 0, axis === "y" ? Math.sin(half) : 0, axis === "z" ? Math.sin(half) : 0, Math.cos(half)];
    // Applied after the node's own rotation, so about its own axis.
    node.setRotation(multiply(node.getRotation(), turn));
  }

  const scene = sceneOf(doc, model.file);
  const scale = model.scale ?? 1;
  const mirror = model.mirror ? FRAME_AXIS_TO_GLTF[model.mirror] : [0, 0, 0];
  const frame = doc
    .createNode("satvis-frame")
    .setRotation(rotation(model.rotate ?? []))
    .setScale(mirror.map((m) => (m ? -scale : scale)) as vec3);
  for (const child of scene.listChildren()) {
    frame.addChild(child);
  }
  scene.addChild(frame);

  // Baked into the vertices: Cesium bounds a rotated node by only its transformed
  // min and max corners, which once an axis flips shrank Suomi NPP's sphere to a quarter.
  disposeRestPoseAnimations(doc, model.file);
  await doc.transform(flatten());
  for (const node of scene.listChildren()) {
    const mesh = node.getMesh();
    if (!mesh) {
      continue;
    }
    // A mesh several nodes share is copied, so each bakes its own transform.
    const owned = mesh.listParents().filter((parent) => parent instanceof Node).length > 1 ? mesh.clone() : mesh;
    node.setMesh(owned);
    transformMesh(owned, node.getWorldMatrix());
    node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  adjustMaterials(doc, model);

  // A generator makes one mesh per part; joined, a model is one draw call per material.
  if (model.source.generator || model.join) {
    await doc.transform(join({ keepNamed: false }));
  }
  if (lod) {
    const { min, max } = getBounds(scene);
    // Cesium's bounding sphere spans the box's diagonal.
    const diameter = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    await doc.transform(weld(), simplifyWithin((diameter / lod.maxPoints) * (lod.error ?? 1)));
  } else if (model.simplify !== undefined) {
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0, error: model.simplify }));
  }
  // After simplifying, which cannot collapse across the split it makes.
  if (model.singleSidedClosed) {
    singleSideClosedParts(doc);
  }
  await resizeTextures(doc, model);
  await doc.transform(prune(), dedup(), draco());
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, await io.writeBinary(doc));
}

/**
 * Gives the nodes singleSidedNodes matches a single-sided copy of each material, under
 * the same name so the recipe's other material settings still apply to it.
 */
function makeSingleSided(doc: Document, model: RecipeModel): void {
  if (!model.singleSidedNodes) {
    return;
  }
  const pattern = new RegExp(model.singleSidedNodes);
  const copies = new Map<Material, Material>();
  const nodes = doc.getRoot().listNodes().filter((node) => node.getMesh() && pattern.test(node.getName()));
  if (nodes.length === 0) {
    throw new Error(`${model.file}: singleSidedNodes matches no node with a mesh`);
  }
  for (const node of nodes) {
    const mesh = node.getMesh()!;
    // A mesh other nodes share keeps its materials for them.
    const owned = mesh.listParents().filter((parent) => parent instanceof Node).length > 1 ? mesh.clone() : mesh;
    node.setMesh(owned);
    for (const primitive of owned.listPrimitives()) {
      const material = primitive.getMaterial();
      if (!material?.getDoubleSided()) {
        continue;
      }
      let copy = copies.get(material);
      if (!copy) {
        copy = material.clone().setDoubleSided(false);
        copies.set(material, copy);
      }
      primitive.setMaterial(copy);
    }
  }
}

/**
 * Moves the closed, outward-wound shells of each opaque double-sided primitive into a
 * primitive of their own with a single-sided copy of the material, under the same name.
 */
function singleSideClosedParts(doc: Document): void {
  const copies = new Map<Material, Material>();
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const material = primitive.getMaterial();
      if (!material?.getDoubleSided() || material.getAlphaMode() !== "OPAQUE" || primitive.getMode() !== Primitive.Mode.TRIANGLES) {
        continue;
      }
      const closed = closedTriangles(primitive);
      if (!closed.includes(true)) {
        continue;
      }
      let copy = copies.get(material);
      if (!copy) {
        copy = material.clone().setDoubleSided(false);
        copies.set(material, copy);
      }
      if (!closed.includes(false)) {
        primitive.setMaterial(copy);
        continue;
      }
      const indices = primitive.getIndices();
      const corners = indices?.getArray() ?? Uint32Array.from({ length: primitive.getAttribute("POSITION")!.getCount() }, (_, i) => i);
      const triangles = (shells: boolean): Uint32Array<ArrayBuffer> => Uint32Array.from(closed.flatMap((isClosed, t) => (isClosed === shells ? [corners[3 * t]!, corners[3 * t + 1]!, corners[3 * t + 2]!] : [])));
      const shell = primitive.clone().setMaterial(copy);
      shell.setIndices(doc.createAccessor().setType("SCALAR").setArray(triangles(true)));
      primitive.setIndices(doc.createAccessor().setType("SCALAR").setArray(triangles(false)));
      mesh.addPrimitive(shell);
      compactPrimitive(shell);
      compactPrimitive(primitive);
    }
  }
}

/**
 * Whether each triangle belongs to a closed, outward-wound shell: its vertices welded
 * by position, every edge of the shell borders exactly one triangle each way, and the
 * shell encloses a positive volume.
 */
function closedTriangles(primitive: Primitive): boolean[] {
  const positions = primitive.getAttribute("POSITION")!;
  const indices = primitive.getIndices()?.getArray();
  const count = indices ? indices.length / 3 : positions.getCount() / 3;
  const welded = new Map<string, number>();
  const vertex = (corner: number): number => {
    const key = positions.getElement(indices ? indices[corner]! : corner, []).join();
    let id = welded.get(key);
    if (id === undefined) {
      id = welded.size;
      welded.set(key, id);
    }
    return id;
  };
  const triangles = Array.from({ length: count }, (_, t) => [vertex(3 * t), vertex(3 * t + 1), vertex(3 * t + 2)] as const);

  const parent = Array.from({ length: welded.size }, (_, i) => i);
  const find = (v: number): number => {
    while (parent[v] !== v) {
      v = parent[v] = parent[parent[v]!]!;
    }
    return v;
  };
  for (const [a, b, c] of triangles) {
    parent[find(b)] = find(a);
    parent[find(c)] = find(a);
  }
  const shells = new Map<number, number[]>();
  triangles.forEach(([a], t) => {
    const root = find(a);
    const shell = shells.get(root);
    if (shell) {
      shell.push(t);
    } else {
      shells.set(root, [t]);
    }
  });

  const closed = Array.from({ length: count }, () => false);
  const n = welded.size;
  for (const shell of shells.values()) {
    const edges = new Map<number, number>();
    let volume = 0;
    for (const t of shell) {
      const [a, b, c] = triangles[t]!;
      for (const [from, to] of [[a, b], [b, c], [c, a]] as const) {
        edges.set(from * n + to, (edges.get(from * n + to) ?? 0) + 1);
      }
      const [[px, py, pz], [qx, qy, qz], [rx, ry, rz]] = [3 * t, 3 * t + 1, 3 * t + 2].map((corner) => positions.getElement(indices ? indices[corner]! : corner, [0, 0, 0]) as vec3) as [vec3, vec3, vec3];
      volume += px * (qy * rz - qz * ry) - py * (qx * rz - qz * rx) + pz * (qx * ry - qy * rx);
    }
    const sealed = [...edges].every(([edge, uses]) => uses === 1 && edges.get((edge % n) * n + Math.floor(edge / n)) === 1);
    if (sealed && volume > 0) {
      for (const t of shell) {
        closed[t] = true;
      }
    }
  }
  return closed;
}

/**
 * Simplifies every primitive until a vertex would move more than `error` metres, and
 * drops disconnected parts smaller than that. glTF-Transform's simplify measures its
 * error against each mesh's extent and cannot prune.
 */
function simplifyWithin(error: number): Transform {
  return async (doc) => {
    await MeshoptSimplifier.ready;
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        const indices = primitive.getIndices();
        const position = primitive.getAttribute("POSITION");
        if (primitive.getMode() !== Primitive.Mode.TRIANGLES || !indices || !position) {
          continue;
        }
        const [simplified] = MeshoptSimplifier.simplify(Uint32Array.from(indices.getArray()!), Float32Array.from(position.getArray()!), 3, 0, error, ["ErrorAbsolute", "Prune"]);
        if (simplified.length === 0) {
          primitive.dispose();
          continue;
        }
        primitive.setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(simplified)));
        compactPrimitive(primitive);
      }
    }
  };
}

/** Gives the nodes each nodeColors pattern matches untextured copies of their materials in its colour. */
function colorNodes(doc: Document, model: RecipeModel): void {
  for (const [source, color] of Object.entries(model.nodeColors ?? {})) {
    const pattern = new RegExp(source);
    const nodes = doc.getRoot().listNodes().filter((node) => node.getMesh() && pattern.test(node.getName()));
    if (nodes.length === 0) {
      throw new Error(`${model.file}: nodeColors pattern ${JSON.stringify(source)} matches no node with a mesh`);
    }
    const copies = new Map<Material, Material>();
    for (const node of nodes) {
      const mesh = node.getMesh()!;
      // A mesh other nodes share keeps its materials for them.
      const owned = mesh.listParents().filter((parent) => parent instanceof Node).length > 1 ? mesh.clone() : mesh;
      node.setMesh(owned);
      for (const primitive of owned.listPrimitives()) {
        const material = primitive.getMaterial();
        if (!material) {
          continue;
        }
        let copy = copies.get(material);
        if (!copy) {
          copy = material.clone().setBaseColorTexture(null).setBaseColorFactor([...color, 1]);
          copies.set(material, copy);
        }
        primitive.setMaterial(copy);
      }
    }
  }
}

/** Applies a recipe's matte, alphaMask, opaqueMaterials and baseColors to every material. */
function adjustMaterials(doc: Document, model: RecipeModel): void {
  const materials = doc.getRoot().listMaterials();
  const named = [...(model.opaqueMaterials ?? []), ...Object.keys(model.baseColors ?? {})];
  const unknown = named.filter((name) => !materials.some((material) => material.getName() === name));
  if (unknown.length > 0) {
    throw new Error(`${model.file}: opaqueMaterials or baseColors names no material ${unknown.join(", ")}`);
  }
  for (const material of materials) {
    const color = model.baseColors?.[material.getName()];
    if (color) {
      material.setBaseColorTexture(null).setBaseColorFactor([...color, 1]);
    }
    if (model.opaqueMaterials?.includes(material.getName())) {
      material.setAlphaMode("OPAQUE");
    } else if (model.alphaMask && material.getAlphaMode() === "BLEND") {
      material.setAlphaMode("MASK").setAlphaCutoff(0.5);
    }
    if (model.matte !== undefined) {
      material.setMetallicRoughnessTexture(null).setNormalTexture(null).setMetallicFactor(model.matte).setRoughnessFactor(0.6);
    }
  }
}

/**
 * Resizes each texture to fit its recipe size, textureSizes before textureSize, and
 * re-encodes it as WebP. glTF-Transform's textureCompress cannot exempt textures by
 * name: its pattern also tests each texture's URI, empty in a GLB.
 */
async function resizeTextures(doc: Document, model: RecipeModel): Promise<void> {
  if (model.textureSize === undefined) {
    return;
  }
  const sizes = new Map(Object.entries(model.textureSizes ?? {}));
  const textures = doc.getRoot().listTextures();
  const missing = [...sizes.keys()].filter((name) => !textures.some((texture) => texture.getName() === name));
  if (missing.length > 0) {
    throw new Error(`${model.file}: textureSizes names no texture ${missing.join(", ")}`);
  }
  doc.createExtension(EXTTextureWebP).setRequired(true);
  for (const texture of textures) {
    const image = texture.getImage();
    if (!image) {
      continue;
    }
    const size = sizes.get(texture.getName()) ?? model.textureSize;
    const webp = await sharp(image).resize(size, size, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    texture.setImage(new Uint8Array(webp)).setMimeType("image/webp").setURI("");
  }
}

/**
 * Gives each primitive without texture coordinates an untextured copy of its material.
 * Cesium compiles the textured shader regardless and fails on the missing coordinates,
 * which stops all rendering; the Jason-2 source's foil has such primitives.
 */
function untextureWithoutUVs(doc: Document): void {
  const untextured = new Map<Material, Material>();
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const material = primitive.getMaterial();
      if (!material || primitive.getAttribute("TEXCOORD_0") || !hasTexture(doc, material)) {
        continue;
      }
      let copy = untextured.get(material);
      if (!copy) {
        copy = material
          .clone()
          .setBaseColorTexture(null)
          .setMetallicRoughnessTexture(null)
          .setNormalTexture(null)
          .setOcclusionTexture(null)
          .setEmissiveTexture(null);
        for (const extension of copy.listExtensions()) {
          copy.setExtension(extension.extensionName, null);
        }
        untextured.set(material, copy);
      }
      primitive.setMaterial(copy);
    }
  }
}

/** Whether `material` samples a texture, its extensions' included. */
function hasTexture(doc: Document, material: Material): boolean {
  const graph = doc.getGraph();
  return [material, ...material.listExtensions()].some((property) => graph.listChildEdges(property).some((edge) => edge.getChild() instanceof Texture));
}

/**
 * Removes animations that only hold nodes at their rest pose, which Blender exports
 * for the ISS. Real motion fails the build: flatten() leaves an animated node in
 * place, and baking would move its vertices away from what the animation drives.
 */
function disposeRestPoseAnimations(doc: Document, file: string): void {
  for (const animation of doc.getRoot().listAnimations()) {
    const atRest = animation.listChannels().every((channel) => {
      const node = channel.getTargetNode();
      // Its node was in removeNodes.
      if (!node) {
        return true;
      }
      const sampler = channel.getSampler();
      const input = sampler?.getInput();
      const output = sampler?.getOutput();
      if (!input || !output || input.getCount() !== 1) {
        return false;
      }
      const path = channel.getTargetPath();
      const rest: number[] = path === "translation" ? node.getTranslation() : path === "rotation" ? node.getRotation() : path === "scale" ? node.getScale() : [];
      const key = output.getElement(0, []);
      return rest.length === key.length && key.every((value, i) => Math.abs(value - (rest[i] ?? NaN)) < 1e-6);
    });
    if (!atRest) {
      throw new Error(`${file}: animation ${animation.getName()} moves its nodes, so their transforms cannot be baked`);
    }
    animation.dispose();
  }
}

/** The source document: generated, or fetched and read. */
async function load(model: RecipeModel, source: Source): Promise<Document> {
  const { generator, path: sourcePath } = model.source;
  if (generator !== undefined) {
    const generate = GENERATORS[generator];
    if (!generate) {
      throw new Error(`${model.file}: unknown generator ${JSON.stringify(generator)}`);
    }
    return generate();
  }
  const bytes = await fetchSource(source, sourcePath!);
  return model.dropExternalTextures ? withoutExternalTextures(bytes, model.file) : io.readBinary(bytes);
}

/**
 * A GLB whose images are all external files, read without them: glTF-Transform cannot
 * resolve them, so the textures, their images and samplers, and every material's
 * reference to them go before the read. Base colours stay.
 */
async function withoutExternalTextures(bytes: Uint8Array, file: string): Promise<Document> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  const images: Array<{ uri?: string }> = json.images ?? [];
  if (images.some((image) => image.uri === undefined || image.uri.startsWith("data:"))) {
    throw new Error(`${file}: dropExternalTextures drops every texture, but some images are embedded`);
  }
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const material of json.materials ?? []) {
    delete material.pbrMetallicRoughness?.baseColorTexture;
    delete material.pbrMetallicRoughness?.metallicRoughnessTexture;
    delete material.normalTexture;
    delete material.occlusionTexture;
    delete material.emissiveTexture;
  }
  // The binary chunk follows the JSON chunk: its length, its type, then its bytes.
  const binary = 20 + jsonLength;
  const binaryLength = view.getUint32(binary, true);
  return io.readJSON({ json, resources: { "@glb.bin": bytes.slice(binary + 8, binary + 8 + binaryLength) } });
}

async function fetchSource(source: Source, sourcePath: string): Promise<Uint8Array> {
  const repo = source.url?.match(/^https:\/\/github\.com\/([^/]+\/[^/]+?)\/?$/)?.[1];
  if (!repo || !source.commit) {
    throw new Error(`${sourcePath}: its source needs a GitHub url and a commit to fetch from`);
  }
  const cached = path.join(cacheDir, source.commit, sourcePath);
  try {
    return await readFile(cached);
  } catch {
    const url = `https://raw.githubusercontent.com/${repo}/${source.commit}/${sourcePath.split("/").map(encodeURIComponent).join("/")}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${url}: HTTP ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    await mkdir(path.dirname(cached), { recursive: true });
    await writeFile(cached, bytes);
    return bytes;
  }
}

/** `[{ axis: "zenith", degrees: 90 }, …]`, applied in order, as a glTF quaternion. */
function rotation(steps: NonNullable<RecipeModel["rotate"]>): vec4 {
  let q: vec4 = [0, 0, 0, 1];
  for (const { axis, degrees } of steps) {
    const [x, y, z] = FRAME_AXIS_TO_GLTF[axis];
    const half = (degrees * Math.PI) / 360;
    const s = Math.sin(half);
    q = multiply([x * s, y * s, z * s, Math.cos(half)], q);
  }
  return q;
}

function multiply([ax, ay, az, aw]: vec4, [bx, by, bz, bw]: vec4): vec4 {
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}

function trianglesOf(mode: number, count: number): number {
  switch (mode) {
    case Primitive.Mode.TRIANGLES:
      return Math.floor(count / 3);
    case Primitive.Mode.TRIANGLE_STRIP:
    case Primitive.Mode.TRIANGLE_FAN:
      return Math.max(0, count - 2);
    default:
      return 0;
  }
}

async function measure(file: string): Promise<Measured> {
  const doc = await io.read(file);
  const root = doc.getRoot();
  const { min, max } = getBounds(sceneOf(doc, file));
  let triangles = 0;
  for (const node of root.listNodes()) {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const count = (primitive.getIndices() ?? primitive.getAttribute("POSITION"))?.getCount() ?? 0;
      triangles += trianglesOf(primitive.getMode(), count);
    }
  }
  const round = (value: number): number => Math.round(value * 1000) / 1000;
  return {
    bytes: (await stat(file)).size,
    // Along the velocity, across it (port to starboard), and radially.
    dimensions: [max[2] - min[2], max[0] - min[0], max[1] - min[1]].map(round),
    triangles,
    textures: root.listTextures().map((texture) => {
      const size = texture.getSize();
      return `${size ? `${size[0]}x${size[1]} ` : ""}${texture.getMimeType()}`;
    }),
    extensions: root
      .listExtensionsUsed()
      .map((ext) => ext.extensionName)
      .toSorted(),
  };
}
