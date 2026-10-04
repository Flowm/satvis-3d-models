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

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, draco, getBounds, prune } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import YAML from "yaml";

const modelsDir = fileURLToPath(new URL(".", import.meta.url));
const recipePath = path.join(modelsDir, "build.yaml");
const manifestPath = path.join(modelsDir, "models.yaml");
const cacheDir = path.join(modelsDir, ".cache");

// The satellite frame's axes as glTF axes: Cesium turns glTF +Z into the
// velocity, +X into port and +Y into the zenith. Rotations in the manifest are
// written in the satellite frame, which is the one anyone placing a model thinks in.
const FRAME_AXIS_TO_GLTF = { velocity: [0, 0, 1], port: [1, 0, 0], zenith: [0, 1, 0] };

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "draco3d.decoder": await draco3d.createDecoderModule(),
  "draco3d.encoder": await draco3d.createEncoderModule(),
});

const recipe = YAML.parse(await readFile(recipePath, "utf8"));
const filter = process.argv[2];
checkSatellitesUnique(recipe.models);

const entries = [];
for (const model of recipe.models) {
  const source = recipe.sources[model.source.id];
  const output = path.join(modelsDir, model.file);
  if (model.source.path && (!filter || model.file.includes(filter))) {
    await build(model, source, output);
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
  "# Every model in this repository and the satellites it depicts. satvis maps each",
  "# NORAD id to ./data/models/<file>. Dimensions are metres along the velocity,",
  "# across it and radially; the frame is described in build.yaml.",
];
// One line per satellite and per list of numbers or names, as in build.yaml.
const manifest = new YAML.Document({ models: entries });
YAML.visit(manifest, {
  Pair(_, pair) {
    if (["satellites", "dimensions", "textures", "extensions"].includes(pair.key.value)) {
      pair.value.flow = pair.key.value !== "satellites";
      for (const item of pair.value.items) {
        item.flow = true;
      }
    }
  },
});
await writeFile(manifestPath, `${header.join("\n")}\n\n${manifest.toString({ lineWidth: 0 })}`);

// satvis gives a satellite one model; two claiming it is a recipe mistake.
function checkSatellitesUnique(models) {
  const claimed = new Map();
  for (const model of models) {
    for (const { noradId } of model.satellites ?? []) {
      if (claimed.has(noradId)) {
        throw new Error(`NORAD ${noradId} is claimed by both ${claimed.get(noradId)} and ${model.file}`);
      }
      claimed.set(noradId, model.file);
    }
  }
}

async function build(model, source, output) {
  const doc = await io.readBinary(await fetchSource(source, model.source.path));
  const root = doc.getRoot();

  for (const node of root.listNodes()) {
    if (model.removeNodes?.includes(node.getName())) {
      node.dispose();
    }
  }

  // Reading keeps only the WebP of an EXT_texture_webp texture, so the PNG or
  // JPEG beside it is left unreferenced and pruned. Every browser satvis runs in
  // decodes WebP; the fallback only doubled the download.
  if (!model.stripFallbackTextures && root.listExtensionsUsed().some((ext) => ext.extensionName === "EXT_texture_webp")) {
    throw new Error(`${model.file}: the source uses EXT_texture_webp, so set stripFallbackTextures`);
  }

  // One parent for the whole scene, carrying the frame and the scale, rather than
  // baking them into vertices: the transform stays readable in any glTF viewer.
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const frame = doc
    .createNode("satvis-frame")
    .setRotation(rotation(model.rotate ?? []))
    .setScale([model.scale ?? 1, model.scale ?? 1, model.scale ?? 1]);
  for (const child of scene.listChildren()) {
    frame.addChild(child);
  }
  scene.addChild(frame);

  await doc.transform(prune(), dedup(), draco());
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, await io.writeBinary(doc));
}

async function fetchSource(source, sourcePath) {
  const cached = path.join(cacheDir, source.commit, sourcePath);
  try {
    return await readFile(cached);
  } catch {
    const url = `https://raw.githubusercontent.com/nasa/NASA-3D-Resources/${source.commit}/${sourcePath.split("/").map(encodeURIComponent).join("/")}`;
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
function rotation(steps) {
  let q = [0, 0, 0, 1];
  for (const { axis, degrees } of steps) {
    const [x, y, z] = FRAME_AXIS_TO_GLTF[axis];
    const half = (degrees * Math.PI) / 360;
    const s = Math.sin(half);
    q = multiply([x * s, y * s, z * s, Math.cos(half)], q);
  }
  return q;
}

function multiply([ax, ay, az, aw], [bx, by, bz, bw]) {
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}

async function measure(file) {
  // Measured, not rendered: an extension this reader lacks (FIRST-MOVE's
  // KHR_materials_common) need not stop it reading the geometry.
  const json = await io.binaryToJSON(await readFile(file));
  delete json.json.extensionsRequired;
  const doc = await io.readJSON(json);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const { min, max } = getBounds(scene);
  let triangles = 0;
  for (const node of root.listNodes()) {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const count = (primitive.getIndices() ?? primitive.getAttribute("POSITION"))?.getCount() ?? 0;
      triangles += primitive.getMode() === 4 ? count / 3 : Math.max(0, count - 2);
    }
  }
  const round = (value) => Math.round(value * 1000) / 1000;
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
