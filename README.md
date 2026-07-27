# companion-module-avitech-sequoia4k60-sequoia4k60l

Bitfocus Companion module for the **Avitech Sequoia 4K60** and **Sequoia 4K60L** multiviewers.

Both models are controlled over HTTP. Select your model and operating mode when configuring the
connection so the module sends the command shape your unit expects.

See [HELP.md](./companion/HELP.md) for user-facing setup instructions and [LICENSE](./LICENSE).

## Supported devices

| Model         | Modes                                                                |
| ------------- | -------------------------------------------------------------------- |
| Sequoia 4K60  | Quad Multiview + Workstation, Seamless Switching                     |
| Sequoia 4K60L | Quad Multiview + Bypass, Single-View Seamless Switching, Daisy Chain |

A unit's mode reflects how the hardware is physically configured; the module cannot change it.
It is selected in the connection config as a single combined model + mode choice.

## Getting started

Requires Node 22 and Yarn 4 (see `engines` in `package.json`; the Yarn version is pinned via
`packageManager` and provisioned by corepack).

Executing a `yarn` command should perform all necessary steps to develop the module, if it does
not then follow the steps below.

The module can be built once with `yarn build`. This should be enough to get the module to be
loadable by companion.

While developing the module, by using `yarn dev` the compiler will be run in watch mode to
recompile the files on change.

## Development

| Command        | Purpose                                            |
| -------------- | -------------------------------------------------- |
| `yarn install` | Install dependencies                               |
| `yarn build`   | Clean `dist/` and compile                          |
| `yarn dev`     | Compile in watch mode                              |
| `yarn lint`    | Run ESLint                                         |
| `yarn format`  | Run Prettier over the repo                         |
| `yarn package` | Build and produce the distributable module package |

There is no test suite; `yarn lint` and `yarn build` are the automated checks. A pre-commit hook
runs Prettier and `eslint --fix` on staged files.

Architecture notes for contributors are in [CLAUDE.md](./CLAUDE.md).
