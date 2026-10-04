# satvis 3D models

The satellite models [satvis](https://github.com/Flowm/satvis) draws, and the
manifest that tells it which satellite uses which model.

## Files

- `build.yaml` — the recipe, edited by hand: where each model comes from, what
  the build does to it, and the satellites it depicts, by NORAD id.
- `models.yaml` — the manifest, written by the build: every model, its
  satellites, credit and licence, and what it measures. satvis reads it to give
  each listed satellite `./data/models/<file>`. Do not edit it.
- `generic/` — fallback models no satellite maps to yet.

A model lists every satellite it depicts, so one file serves a constellation; a
NORAD id may appear under one model only. Files keep the name of their first
satellite.

Models are placed in the frame satvis draws a satellite in: glTF +Z along the
velocity, +Y to the zenith, +X to port. Rotations in `build.yaml` are written in
that frame (`velocity`, `port`, `zenith`) and applied in order.

## Building

```sh
pnpm install
pnpm build          # every model with a source
pnpm build ISS      # rebuild only files whose name contains "ISS"
```

The build fetches each source into `.cache/`, removes the listed nodes, drops
the PNG/JPEG fallbacks of WebP textures, wraps the scene in one node carrying
the rotation and scale, writes it Draco-compressed, and measures every model
into `models.yaml`. Models without a source path are measured, not rebuilt.

To inspect the result, open `/models.html` in a satvis dev server.

## Licences

Models from NASA 3D Resources are not subject to US copyright; credit NASA.
NASA insignia and logos are not free to use, and use must not imply NASA
endorsement. The MOVE models come from the TUM MOVE CubeSat team.
