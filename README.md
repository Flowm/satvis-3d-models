# satvis 3D models

The satellite models [satvis](https://github.com/Flowm/satvis) draws, and the
manifest that tells it which satellite uses which model.

## Files

- `public/` — the models. satvis serves this folder at `/data/models/` and ships
  nothing else from the repository; `public/generic/` holds fallback models no
  satellite maps to yet.
- `build.yaml` — the recipe, edited by hand: where each model comes from, what
  the build does to it, and the satellites it depicts, by NORAD id or by bus.
- `generators/` — models built from code rather than fetched, from published
  dimensions, cited beside each number.
- `models.yaml` — the manifest, written by the build: every model, its
  satellites, credit and licence, and what it measures. A model's `file` is its
  path in `public/`; satvis reads the manifest to give each listed satellite that
  file. Do not edit it.

A model lists every satellite it depicts, so one file serves a constellation; a
NORAD id may appear under one model only. A constellation too large to list names
its buses instead, as GCAT spells them (`Starlink V2M`), and a bus may also appear
under one model only. Files keep the name of their first satellite, or of the
design they show.

Models are placed in the frame satvis draws a satellite in: glTF +Z along the
velocity, +Y to the zenith, +X to port. Rotations in `build.yaml` are written in
that frame (`velocity`, `port`, `zenith`) and applied in order.

## Building

```sh
pnpm install
pnpm build          # every model with a source
pnpm build ISS      # rebuild only files whose name contains "ISS"
pnpm check          # type-check build.ts and the generators
```

`build.ts` runs on Node 24 directly, which strips the types; `pnpm check` is
where they are checked.

The build fetches each source into `.cache/` or runs its generator, removes the
listed nodes, drops the PNG/JPEG fallbacks of WebP textures, bakes every node
transform, the rotation and scale included, into the vertices, writes it
Draco-compressed, and measures every model into `models.yaml`. The baking is for
Cesium, which sizes a rotated model's bounding sphere wrongly. A generated
model's parts are then joined, one primitive per material. A model with neither
a source path nor a generator is kept as it is and only measured.

To inspect the result, open `/models.html` in a satvis dev server.

## Licences

Models from NASA 3D Resources are not subject to US copyright; credit NASA.
NASA insignia and logos are not free to use, and use must not imply NASA
endorsement. The MOVE models come from the TUM MOVE CubeSat team. Generated
models are MIT, as satvis is.
