// Builds public/ and models.yaml from build.yaml (see README). A filter argument
// rebuilds only matching files, but every model is still measured into the manifest.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type Document, Node, NodeIO, Primitive, type Scene, type vec3, type vec4 } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, draco, flatten, getBounds, join, prune, transformMesh } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import YAML, { isMap, isScalar, isSeq } from "yaml";

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
  rotate?: Array<{ axis: Axis; degrees: number }>;
  scale?: number;
  stripFallbackTextures?: boolean;
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

const entries = [];
for (const model of recipe.models) {
  const source = recipe.sources[model.source.id];
  if (!source) {
    throw new Error(`${model.file}: unknown source ${JSON.stringify(model.source.id)}`);
  }
  const output = path.join(publicDir, model.file);
  if ((model.source.path || model.source.generator) && (!filter || model.file.includes(filter))) {
    await build(model, source, output);
  }
  const measured = await measure(output);
  entries.push({
    file: model.file,
    ...(model.satellites ? { satellites: model.satellites } : {}),
    ...(model.buses ? { buses: model.buses } : {}),
    ...(model.role ? { role: model.role } : {}),
    credit: source.credit,
    license: source.license,
    measured,
  });
  console.log(`${model.file}: ${measured.dimensions.map((d) => d.toFixed(2)).join(" x ")} m, ${measured.triangles} triangles, ${(measured.bytes / 1e3).toFixed(0)} kB`);
}

const header = [
  "# Written by `pnpm build` from build.yaml; edit that instead.",
  "#",
  "# Every model in public/ and the satellites it depicts. satvis serves public/ at",
  "# /data/models/ and maps each NORAD id to its file. Dimensions are metres along",
  "# the velocity, across it and radially; the frame is described in build.yaml.",
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
 * Draco-compressed.
 */
async function build(model: RecipeModel, source: Source, output: string): Promise<void> {
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

  // Reading keeps only the WebP, so prune() drops the PNG/JPEG fallback beside it.
  if (!model.stripFallbackTextures && root.listExtensionsUsed().some((ext) => ext.extensionName === "EXT_texture_webp")) {
    throw new Error(`${model.file}: the source uses EXT_texture_webp, so set stripFallbackTextures`);
  }

  const scene = sceneOf(doc, model.file);
  const scale = model.scale ?? 1;
  const frame = doc
    .createNode("satvis-frame")
    .setRotation(rotation(model.rotate ?? []))
    .setScale([scale, scale, scale]);
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
    if (mesh.listParents().filter((parent) => parent instanceof Node).length > 1) {
      throw new Error(`${model.file}: mesh ${mesh.getName()} is shared by several nodes`);
    }
    transformMesh(mesh, node.getWorldMatrix());
    node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  // A generator makes one mesh per part; joined, a model is one draw call per material.
  if (model.source.generator) {
    await doc.transform(join({ keepNamed: false }));
  }
  await doc.transform(prune(), dedup(), draco());
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, await io.writeBinary(doc));
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
  return io.readBinary(await fetchSource(source, sourcePath!));
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
