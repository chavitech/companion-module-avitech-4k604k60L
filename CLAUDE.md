# Avitech Sequoia 4K60 / 4K60L — Companion module

Bitfocus Companion connection module for the Avitech Sequoia 4K60 and 4K60L multiviewers.
Manifest id `avitech-sequoia4k60-sequoia4k60l`, runtime `node22`, entrypoint `dist/main.js`.

**The manifest id is derived from the repository name and is not free-form.** Bitfocus CI
(`bitfocus/actions/.github/workflows/module-checks.yaml`, the "Package module" job) computes
`basename(repo)` with the `companion-module-` prefix stripped and requires `companion/manifest.json`'s
`id` to equal it exactly — so repo `companion-module-avitech-sequoia4k60-sequoia4k60l` demands id
`avitech-sequoia4k60-sequoia4k60l`. Note the id does **not** carry the `companion-module-` prefix;
compare `companion-module-bmd-atem` → `bmd-atem`. If that job fails with "Module manifest.json id
does not match github repository name", this is why, and the id is what moves — renaming the repo
changes the id every published connection is keyed on. `legacyIds` exists to migrate a _published_
id and is empty because this module has not shipped.

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
change, not a rewrite. It currently covers sections 1.3.1 and 1.3.2.

Two things the bench does that Companion does not:

- **It has no colour picker.** §1.3.1's OSD colours are typed as `R,G,B` or `R,G,B,A` text and
  parsed by `parseColor`. `src/system.ts` is deliberately _not_ imported here — it holds a runtime
  import of `@companion-module/base` for `splitRgb`, which is exactly the dependency the bench
  exists without. Its choice lists are duplicated in `bench.mjs` on purpose; the adapter calls are
  still the real ones, which is the part that has to stay honest.
- **It renders an unconditional `warn` on destructive commands.** Separate from `warnInDaisyChain`,
  which only fires in daisy-chain mode. Reset Factory Defaults (§1.3.1.11) and Custom Preset —
  Delete (§1.3.1.9) erase device state in every mode, and the bench fires on a single click with no
  confirmation. Unlike Companion — where a button has to be deliberately created and the action
  assigned to it — one click on the bench page is the whole gesture.

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
  - The §1.3.1 system commands are **concrete** for the same reason. Note `setOsd`: the guide's
    Tables 1.3.1.16–1.3.1.21 are six _tasks_ but one request (`2060` / `set` / `osd` / `data`), so
    there is one method taking a `Partial<OsdSettings>`, and `actions.ts` provides the task-shaped
    buttons. Each action writes only its own keys, so pressing one never disturbs another's
    settings.
- `sequoia-4k60.ts` / `sequoia-4k60l.ts` — concrete adapters.
- `index.ts` — `createAdapter(mode, self, api)` factory, plus the public re-exports. Import
  adapters from `./adapters/index.js`, not the individual files.

**Model-specific commands do not go on the base class.** K/M reboot mode (`setKmRebootMode`,
§1.3.4.5) and daisy-chain label text (`setLabel`, §1.3.5) exist only on the 4K60L, so they live only
on `Sequoia4K60LAdapter` and callers narrow with `instanceof` first. Resist the urge to hoist a
method up to `base.ts` to avoid a narrowing check — the base class is deliberately the intersection
of the two machines, not the union.

The test is what the _guide_ documents, not what is convenient. `setOutputResolution` and
`setKmControl` were 4K60L-only until §1.3.1 was implemented, and moved to `base.ts` because §1.3.1
documents both for the 4K60 as well — 1.3.1.4's `port = 1/2/3/4/5 (port 5 is only available for
Sequoia 4K60)` and 1.3.1.13's "Sequoia 4K60 ... in Quad Multiview + Workstation mode". Sections
1.3.4/1.3.5 describe the same requests a second time for the 4K60L; the shapes are byte-identical,
so there is one method each. Mode restrictions still live in `actions.ts` gating, not in the
adapters — `set_km_control` is registered for exactly the three modes the guide names and stays off
the 4K60's Seamless Switching and the 4K60L's Single-View Seamless.

**Daisy chain is treated as a closed list.** §1.3.5 names the only four commands assumed to work
on a unit in daisy-chain mode — Label Text, Audio, K/M Control and Output Resolution. A command
documented elsewhere is not registered for that mode even when it is otherwise model-agnostic —
hence `actions.ts` gates all seven §1.3.2 actions and all 22 daisy-chain-ineligible §1.3.1 actions
behind `!isDaisyChain`, and `Sequoia4K60LAdapter.setLabel()` (§1.3.5, sends `daisy: 1`) stays a
separate method from `SequoiaAdapter.setWindowLabel()` (§1.3.2, no `daisy` key) despite the overlap.
In daisy-chain mode the action list is exactly those four commands; that is the property to check
after touching gating.

Bench-tested against a daisy-chained 4K60L on 2026-07-29, so this gating is now empirically
justified rather than precautionary:

- **Almost every §1.3.2 command returns `Success` and then does nothing.** The device does not
  report the rejection, so the module _cannot_ detect this failure — nothing in `parseResponse`
  can tell it apart from a real success. Treat a §1.3.2 command aimed at a chained unit as a
  false positive, never as working. Whether that's worth chasing is a firmware question.
- **Never send Window Label Text — Set (§1.3.2.4) to a daisy-chained unit.** It doesn't set the
  label, and afterwards the unit's own GUI can no longer edit labels manually. This is the one
  §1.3.2 command with a known harmful effect in this mode. Companion won't offer it there, but
  `tools/bench.mjs` does not gate by mode and will happily fire it.

**§1.3.1 is almost entirely un-bench-tested.** Every request shape in it was verified against the
guide's worked examples and nothing more. That is a weaker claim than it sounds — the §1.3.2
findings above were also guide-faithful right up until hardware showed that `z` and `global_option`
behave nothing like the documentation says.

The one exception, tested on a 4K60L on 2026-07-29: **Reset Factory Defaults (§1.3.1.11) does not
apply when sent.** The unit carries on with its presets and full command set intact, and the reset
only lands on the next reboot. So the destructive window closes at the power cut, not at the button
press, and a unit that has been sent this looks completely normal until someone reboots it. Warnings
in `base.ts`, `actions.ts` and `bench.mjs` say "destructive" without saying "immediate" for exactly
this reason — do not re-tighten that wording without re-testing.

Specific things to establish on real hardware before trusting them:

- The `get` responses (firmware, signal type, network, OSD info, custom preset list) are all
  screenshot-only in the guide, so no captured shape is recorded for any of them. Signal Type
  (§1.3.1.2) is the one worth capturing first — it is live per-window state and the only §1.3.1 read
  worth driving feedbacks from.
- Whether `setOsd` really is additive. The module assumes an unaddressed key is left alone, because
  every worked example sends a partial `data` object. `setWindowGeometry` had to abandon exactly
  that assumption. `getOsdInfo` is the read side to build on if it turns out to be wrong.
- `idle_time` (§1.3.1.24) has a **blank** Cmd-Value row in the guide — no range, no units, no
  disable value. Seconds is inferred from its single example (120 described as "2 minutes"); the
  0–65535 bound in `actions.ts` is this module's invention, not the vendor's.

Three places where the guide's prose and its worked example disagree, and the example was followed:
`en` vs `enable` (§1.3.1.15), `mode` vs `sob_alarm` (§1.3.1.22), and `preset_num` vs `preset_unm`
(§1.3.1.6). Also note §1.3.1.23's `enable` is inverted — `0` turns power saving **on** — which is
the guide's wording, not a transcription error.

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
- **Per-section option modules.** `src/windows.ts` (§1.3.2) and `src/system.ts` (§1.3.1) hold the
  dropdown choice lists, option-field builders and value conversions for their section, keeping
  `actions.ts` to action definitions. Data types the adapters need (`WindowGeometry`, `OsdSettings`,
  `DeviceColor`) are declared in `base.ts` and flow **outward** to these modules — never the
  reverse. That is what lets `system.ts` hold a value import of `@companion-module/base` for
  `splitRgb` without dragging it into the adapter chain and breaking the bench.
- Actions, feedbacks, presets, and variables are each registered from their own module via an
  `Update*(self)` function called from `ModuleInstance`. Keep that shape; `actions.ts` is by far
  the largest file and is where mode-dependent option lists are built.
