// Builds the models from the recipe in build.yaml: fetches each sourced model at
// its pinned commit, cleans it, puts it in the satellite frame at its real size,
// and writes models.yaml, the manifest of what exists and which satellites use it.
//
//   pnpm build            every model with a source path
//   pnpm build ISS        only files whose name contains "ISS"; every model is
//                         still measured, so the manifest stays complete

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type Document, NodeIO, Primitive, type Scene, type vec3, type vec4 } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, draco, getBounds, prune } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import YAML, { isMap, isScalar, isSeq } from "yaml";

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
  role?: string;
  source: { id: string; path?: string };
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

// The satellite frame's axes as glTF axes: Cesium turns glTF +Z into the
// velocity, +X into port and +Y into the zenith. Rotations in the manifest are
// written in the satellite frame, which is the one anyone placing a model thinks in.
const FRAME_AXIS_TO_GLTF: Record<Axis, vec3> = { velocity: [0, 0, 1], port: [1, 0, 0], zenith: [0, 1, 0] };

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "draco3d.decoder": await draco3d.createDecoderModule(),
  "draco3d.encoder": await draco3d.createEncoderModule(),
});

const recipe = YAML.parse(await readFile(recipePath, "utf8")) as Recipe;
const filter = process.argv[2];
checkSatellitesUnique(recipe.models);

const entries = [];
for (const model of recipe.models) {
  const source = recipe.sources[model.source.id];
  if (!source) {
    throw new Error(`${model.file}: unknown source ${JSON.stringify(model.source.id)}`);
  }
  const output = path.join(publicDir, model.file);
  if (model.source.path && (!filter || model.file.includes(filter))) {
    await build(model, source, model.source.path, output);
  }
  const measured = await measure(output);
  entries.push({
    file: model.file,
    ...(model.satellites ? { satellites: model.satellites } : {}),
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

// satvis gives a satellite one model; two claiming it is a recipe mistake.
function checkSatellitesUnique(models: RecipeModel[]): void {
  const claimed = new Map<number, string>();
  for (const model of models) {
    for (const { noradId } of model.satellites ?? []) {
      const previous = claimed.get(noradId);
      if (previous !== undefined) {
        throw new Error(`NORAD ${noradId} is claimed by both ${previous} and ${model.file}`);
      }
      claimed.set(noradId, model.file);
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

async function build(model: RecipeModel, source: Source, sourcePath: string, output: string): Promise<void> {
  const doc = await io.readBinary(await fetchSource(source, sourcePath));
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

  // Reading keeps only the WebP of an EXT_texture_webp texture, so the PNG or
  // JPEG beside it is left unreferenced and pruned. Every browser satvis runs in
  // decodes WebP; the fallback only doubled the download.
  if (!model.stripFallbackTextures && root.listExtensionsUsed().some((ext) => ext.extensionName === "EXT_texture_webp")) {
    throw new Error(`${model.file}: the source uses EXT_texture_webp, so set stripFallbackTextures`);
  }

  // One parent for the whole scene, carrying the frame and the scale, rather than
  // baking them into vertices: the transform stays readable in any glTF viewer.
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

  await doc.transform(prune(), dedup(), draco());
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, await io.writeBinary(doc));
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
  // Measured, not rendered: an extension this reader lacks (FIRST-MOVE's
  // KHR_materials_common) need not stop it reading the geometry.
  const json = await io.binaryToJSON(await readFile(file));
  delete json.json.extensionsRequired;
  const doc = await io.readJSON(json);
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
