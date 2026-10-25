# satvis 3D models

The satellite models [satvis](https://github.com/Flowm/satvis) draws, and the
manifest that tells it which satellite uses which model.

## Files

- `public/` — the models. satvis serves this folder at `/data/models/` and ships
  nothing else from the repository; `public/generic/` holds generic models, drawn for a
  platform rather than one design.
- `build.yaml` — the recipe, edited by hand: where each model comes from, what
  the build does to it, and the satellites it depicts, by NORAD id or by bus.
- `generators/` — models built from code rather than fetched, from published
  dimensions, cited beside each number.
- `models.yaml` — the manifest, written by the build: every model, its
  satellites, credit and licence, and what it measures. A model's `file` is its
  path in `public/`; satvis reads the manifest to give each listed satellite that
  file. Do not edit it.

A model may list `lods`, lower-detail copies of its file for when it is small on
screen, most detailed first:

```yaml
- file: ISS-(ZARYA).glb
  lods:
    - file: ISS-(ZARYA)-low.glb
      maxPoints: 100
      measured: { … }
```

An app may draw a copy while the model's bounding sphere spans at most its
`maxPoints` points on screen, the copy with the smallest such `maxPoints`; above
them all it draws `file`. The sphere is the one drawn, the copy's while it draws, within
half a percent of the model's: Cesium sizes it from the bounding box's diagonal. An app
that ignores `lods` draws `file` at every size.

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
pnpm check-buses    # list everything in GCAT on each bus build.yaml names
```

Name a bus in `build.yaml` only when everything GCAT puts on it is the design the
model shows, or for a generic model in `generic/`, which shows a platform such as
`Cubesat 3U` in outline. `pnpm check-buses` lists each named bus's objects by name, mass and
launch years, decayed ones included; GCAT is cached in `.cache/gcat/`.

`build.ts` runs on Node 24 directly, which strips the types; `pnpm check` is
where they are checked.

The build fetches each source into `.cache/` or runs its generator, removes the
listed nodes, drops the PNG/JPEG fallbacks of WebP textures and any textures whose
images the source repository lacks, untextures primitives that have no texture
coordinates (Cesium's shader fails on them and stops rendering), bakes every node
transform, the rotation and scale included, into the vertices, writes it
Draco-compressed, and measures every model into `models.yaml`. The baking is for
Cesium, which sizes a rotated model's bounding sphere wrongly. A generated
model's parts are then joined, one primitive per material. A model with neither
a source path nor a generator is kept as it is and only measured.

A large source can be cut to size in its recipe: `removeNodesMatching` drops
nodes by a name pattern, `join` and `simplify` merge and thin its meshes, and
`textureSize` and `textureSizes` shrink its textures. A few options fix how
Cesium draws a source: `mirror` undoes a mirror image, `matte` replaces metallic
and normal maps, `alphaMask` and `opaqueMaterials` stop alpha-blended surfaces
from showing through each other, and `singleSidedNodes` keeps a sheet modelled as
two coincident faces from drawing both. `singleSidedClosed` draws every closed,
outward-wound part single-sided, so the GPU culls its back faces; open sheets and
cut-out materials stay double-sided. Others fix the source's own mistakes:
`baseColors` and `nodeColors` replace a wrong colour texture, by material or by
node, and `turnNodes` turns a joint the source poses wrongly. `build.ts` documents
each field.

A recipe's `lods` builds each lower-detail copy from the same recipe: its `file`,
the `maxPoints` it is drawn up to, and an `error` in points (1 when left out). The
copy is simplified until a surface would move more than `error` points at
`maxPoints`, and parts smaller than that are dropped, so the copy follows from
the size it is drawn at rather than from a triangle count. Its own `textureSize`
or `textureSizes` replace the model's pair, so the model's exceptions do not carry
over. A copy is always joined. Judge it at
`maxPoints` and at the size it is usually drawn: `/models.html` frames one model to
its window, so the window's shorter side sets that size. Solar cells modelled as
tiles a few millimetres above their panel break up at that error and change the
array's colour; such a model gets no copy.

To inspect the result, open `/models.html` in a satvis dev server.

## Licences

`LICENSE` (MIT) covers the build scripts, the generators and the models they
generate. Models taken from elsewhere keep their own terms, which `models.yaml`
lists for each model. Models from NASA 3D Resources are not subject to US
copyright; credit NASA. NASA insignia and logos are not free to use, and use must
not imply NASA endorsement.

The GCAT bus names in `build.yaml` and `models.yaml` come from Jonathan
McDowell's General Catalog of Artificial Space Objects, CC BY 4.0: data from
J. McDowell, planet4589.org.
