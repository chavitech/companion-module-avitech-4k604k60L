# Avitech Sequoia 4K60 / 4K60L — Companion module

Bitfocus Companion connection module for the Avitech Sequoia 4K60 and 4K60L multiviewers.
Manifest id `companion-module-avitech-sequoia4k60-sequoia4k60l`, runtime `node22`,
entrypoint `dist/main.js`.

## Build and verify

```bash
yarn install
yarn build     # rimraf dist && tsc -p tsconfig.build.json
yarn lint
```

There is no test suite. `yarn lint` and `yarn build` are the only automated checks — run both
before calling a change done. Use `yarn dev` for a watching compiler while iterating.

### The command bench

Automated checks can't tell you whether a _device_ still accepts a command. Avitech ships firmware
updates that aren't regression tested, so the reference guide documenting a command is not evidence
that a given unit honors it. `tools/bench.mjs` closes that gap:

```bash
yarn bench --host 192.168.0.5 [--port 80] [--mode <device-mode>] [--listen 8099]
```

It serves a page on `localhost:8099` with one button per command; clicking it fires the request at
a real machine and shows the exact URL sent plus the **raw** response text. Prove a command on the
bench before trying to debug it through the Companion UI.

Two things make it trustworthy, and both are worth preserving:

- **It drives the real adapters.** The bench imports `dist/adapters/index.js` and calls the same
  methods `actions.ts` does, so the URL it sends is byte-identical to Companion's. It is not a
  hand-maintained copy of the request shapes, and must not become one. This works only because
  nothing in the adapter import chain has a runtime dependency on `@companion-module/base` — every
  import in it is type-only and erased by `tsc`. Adding a value import from that package to
  `base.ts`, `models.ts` or an adapter would break the bench.
- **It proxies server-side.** The device's cgi-bin sends no CORS headers, so a page opened over
  `file://` could fire commands but never read the reply. The local server exists to read it.

Its `COMMANDS` array is declarative — extending the bench to another guide section is a data
change, not a rewrite. It currently covers section 1.3.2 only.

## Model / mode design

The single most important concept in this module. Read before touching `actions.ts` or the
adapters.

The 4K60 and 4K60L each expose several **mutually exclusive operating modes**, and the mode
changes the wire shape of routing, audio, resolution, and K/M commands. A unit's mode is a fact
about how the hardware is physically configured — **this module cannot change it**.

So the instance config asks for one combined **model + mode** choice (`DEVICE_MODES` in
`models.ts`), rather than a model field and a mode field. This makes an invalid model/mode
combination structurally impossible in config. Preserve that property:

- Adding a mode means adding one entry to `DEVICE_MODES` **and** `DEVICE_MODE_CHOICES`.
- `getModelForMode()` derives the model from the mode string prefix. Mode ids must therefore
  keep the `sequoia-4k60l-` / `sequoia-4k60-` prefix convention — note that `sequoia-4k60l`
  is checked first because `sequoia-4k60` is a prefix of it.

## Adapter architecture

`src/adapters/` isolates per-model behavior behind `SequoiaAdapter`.

- `base.ts` — abstract class. Only holds commands whose wire shape is **identical across every
  mode of both models**, plus a `capabilities` object for fixed hardware differences (`maxPorts`
  — port 5 is 4K60-only; `supportsDaisyChain`). Two kinds live here:
  - `setRouting`, `getRouting`, `setAudio` are **abstract** — every mode supports them, but the
    request shape differs, so each adapter implements its own.
  - The §1.3.2 window commands (`getWindowGeometry`, `setWindowGeometry`, `getWindowLabels`,
    `setWindowLabel`, `setWindowShow`, `setWindowAspect`, `setFullscreen`) are **concrete**. The
    guide documents §1.3.2 once for "Sequoia 4K60/4K60L" with a single request shape, so there is
    nothing for a subclass to branch on.
- `sequoia-4k60.ts` / `sequoia-4k60l.ts` — concrete adapters.
- `index.ts` — `createAdapter(mode, self, api)` factory, plus the public re-exports. Import
  adapters from `./adapters/index.js`, not the individual files.

**Model-specific commands do not go on the base class.** K/M mode, output resolution, and
daisy-chain label text exist only on the 4K60L (reference guide §1.3.4 / §1.3.5), so they live
only on `Sequoia4K60LAdapter` and callers narrow with `instanceof` first. Resist the urge to
hoist a method up to `base.ts` to avoid a narrowing check — the base class is deliberately the
intersection of the two machines, not the union.

**Daisy chain is treated as a closed list.** §1.3.5 names the only four commands assumed to work
on a unit in daisy-chain mode. A command documented elsewhere is not registered for that mode even
when it is otherwise model-agnostic — hence `actions.ts` gates all seven §1.3.2 actions behind
`!isDaisyChain`, and `Sequoia4K60LAdapter.setLabel()` (§1.3.5, sends `daisy: 1`) stays a separate
method from `SequoiaAdapter.setWindowLabel()` (§1.3.2, no `daisy` key) despite the overlap. If the
bench ever shows the general commands working undocumented in daisy chain, that's a bonus to
consolidate later — not an assumption to build on now.

`ModuleInstance.adapter` is rebuilt in both `init()` and `configUpdated()`, because changing the
configured mode must swap the adapter and rebuild the action list.

## Device HTTP API

`src/avitech-api.ts`. Every command is a GET:

```
http://<ip>/cgi-bin/command.cgi?cmd=<cmd>&param=<json>
```

`cmd` selects the command family (`Info`, `Ext`, `2060`, …). `param` is a JSON object always
carrying `func` (`get`/`set`/`load`/`list`/`del`) and `type`, plus per-command extras. Requests
time out at 5s and update `InstanceStatus` on success and failure.

Response handling has three cases, and the third is a real-world quirk worth preserving:

1. `"Success"` or empty — returned as-is for set/load/del commands.
2. `"Wrong format"` — thrown as `AvitechApiError`.
3. A `{"cb_status": "..."}` envelope — **undocumented in the v1.0.8 reference guide.** Newer
   firmware rejects some commands this way instead of returning `"Wrong format"` (observed:
   `"Not Permitted"`). It is parsed and thrown as an error, because otherwise a rejected command
   looks like a successful JSON response. Don't remove this check when tidying `parseResponse`.

Anything else that parses as JSON is returned parsed; anything that doesn't is returned as text.

## Conventions

- **ESM.** Relative imports need the `.js` extension (`./config.js` from `config.ts`).
- **Formatting** comes from `@companion-module/tools/.prettierrc.json` — tabs, single quotes,
  no semicolons, 120 columns. Run `yarn format`; a husky/lint-staged pre-commit hook enforces it.
- `eslint.config.mjs` is generated by `@companion-module/tools`; don't hand-add rules casually.
- `.yarnrc.yml` sets `enableScripts: false` and `npmMinimalAgeGate: 3d`. A dependency bump can
  be refused purely for being freshly published — check the publish date before debugging further.
- Actions, feedbacks, presets, and variables are each registered from their own module via an
  `Update*(self)` function called from `ModuleInstance`. Keep that shape; `actions.ts` is by far
  the largest file and is where mode-dependent option lists are built.
