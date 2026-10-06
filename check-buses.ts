// Lists, for every GCAT bus build.yaml names, everything in GCAT on that bus, decayed
// objects included: by name, mass and launch years. A bus should be named only when
// all of it is the design the model shows; the first-generation GLONASS satellites
// under "Uragan" were found this way, by mass and era, not by name.
//
// GCAT is cached in .cache/gcat/satcat.tsv; delete it to fetch the current one.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

/** A recipe model, as far as this script reads it. */
interface RecipeModel {
  /** The model's file in public/. */
  file: string;
  /** The GCAT buses it depicts. */
  buses?: string[];
}

/** This repository's root. */
const modelsDir = fileURLToPath(new URL(".", import.meta.url));
/** Where GCAT is kept between runs. */
const cached = path.join(modelsDir, ".cache", "gcat", "satcat.tsv");
/** McDowell's catalogue, CC BY 4.0: "Data from J. McDowell, planet4589.org". */
const GCAT_URL = "https://planet4589.org/space/gcat/tsv/cat/satcat.tsv";

const { models } = YAML.parse(await readFile(path.join(modelsDir, "build.yaml"), "utf8")) as { models: RecipeModel[] };
const busModels = new Map(models.flatMap((model) => (model.buses ?? []).map((bus) => [bus, model.file] as const)));

const lines = (await gcat()).split("\n");
const columns = (lines[0] ?? "").replace(/^#/, "").split("\t");
const rows = lines.filter((line) => line && !line.startsWith("#"));
const at = (name: string): number => columns.indexOf(name);
const [nameAt, busAt, massAt, launchAt, decayAt] = [at("Name"), at("Bus"), at("Mass"), at("LDate"), at("DDate")];

/** What one bus holds. */
interface Holding {
  /** Objects by the first word of their name. */
  names: Map<string, number>;
  /** Objects by their mass in kg, as GCAT writes it. */
  masses: Map<string, number>;
  /** Each object's launch year. */
  years: number[];
  /** How many have decayed. */
  decayed: number;
}

const holdings = new Map<string, Holding>();
for (const row of rows) {
  const fields = row.split("\t").map((field) => field.trim());
  const bus = fields[busAt] ?? "";
  if (!busModels.has(bus)) {
    continue;
  }
  const holding: Holding = holdings.get(bus) ?? { names: new Map(), masses: new Map(), years: [], decayed: 0 };
  const name = (fields[nameAt] ?? "").split(/[\s-]/)[0] ?? "";
  holding.names.set(name, (holding.names.get(name) ?? 0) + 1);
  const mass = fields[massAt] ?? "";
  holding.masses.set(mass, (holding.masses.get(mass) ?? 0) + 1);
  holding.years.push(Number((fields[launchAt] ?? "").slice(0, 4)));
  holding.decayed += (fields[decayAt] ?? "-") === "-" ? 0 : 1;
  holdings.set(bus, holding);
}

const top = (counts: Map<string, number>): string =>
  [...counts]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key, n]) => `${key || "?"} ${n}`)
    .join(", ");
for (const [bus, file] of busModels) {
  const holding = holdings.get(bus);
  if (!holding) {
    console.log(`${bus} (${file}): nothing in GCAT`);
    continue;
  }
  const total = holding.years.length;
  console.log(`${bus} (${file}): ${total} objects, ${holding.decayed} decayed, launched ${Math.min(...holding.years)}–${Math.max(...holding.years)}`);
  console.log(`  names:  ${top(holding.names)}`);
  console.log(`  masses: ${top(holding.masses)} kg`);
}

/** GCAT's satellite catalogue, from the cache or fetched into it. */
async function gcat(): Promise<string> {
  try {
    return await readFile(cached, "utf8");
  } catch {
    const response = await fetch(GCAT_URL);
    if (!response.ok) {
      throw new Error(`${GCAT_URL}: HTTP ${response.status}`);
    }
    const text = await response.text();
    await mkdir(path.dirname(cached), { recursive: true });
    await writeFile(cached, text);
    return text;
  }
}
