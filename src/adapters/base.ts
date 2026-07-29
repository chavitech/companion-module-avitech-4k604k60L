import type { AvitechHttpApi, AvitechResponse } from '../avitech-api.js'
import type { DeviceModel } from '../models.js'
import type ModuleInstance from '../main.js'

/**
 * Fixed differences between the two machines that the rest of the module needs to know about
 * (e.g. to build option choices, or to gate a command that's only valid on one model).
 */
export interface SequoiaCapabilities {
	/** Number of HDMI outputs/windows the device exposes. Port 5 exists only on the 4K60. */
	maxPorts: number
	/** Whether this model supports HDMI daisy-chaining additional units. */
	supportsDaisyChain: boolean
}

/**
 * One window's entry in a "Window Position and Size - Set" request (Table 1.3.2.2).
 *
 * The guide's `data` array is [x, y, w, h, z, aspect, fit, show], but `z` is deliberately absent
 * here. It is not a value the caller gets to choose: the device's z-order turned out to be real
 * state that the guide describes incorrectly, so `setWindowGeometry` reads it off the device and
 * carries it through rather than deriving or accepting one. See that method for the measurements.
 */
export interface WindowGeometry {
	/** position_x, 0 to 3840 */
	x: number
	/** position_y, 0 to 2160 */
	y: number
	/** size_w, 960 to 3840 */
	w: number
	/** size_h, 540 to 2160 */
	h: number
	/** Keep aspect ratio, 0-5. See ASPECT_CHOICES in windows.ts. */
	aspect: number
	/** Fit to window, 0 (disabled) / 1 (enabled) */
	fit: number
	/** 0 (hide) / 1 (show) */
	show: number
}

/**
 * Every command in section 1.3.2 that takes a `port` accepts 1, plus 3 for the 4K60 in "Dual
 * Independent Quad Multiview + Bypass" mode. That mode isn't one of `DEVICE_MODES`, so port is
 * fixed to 1 throughout - the same way the 4K60L adapter fixes `port` on its K/M commands.
 */
const WINDOW_COMMAND_PORT = 1

/** Offset of the z value inside a Table 1.3.2.2 `data` array: [x, y, w, h, z, aspect, fit, show]. */
const GEOMETRY_Z_INDEX = 4

/**
 * State that "Window Position and Size - Set" has to write but that the action deliberately does
 * not expose, so it is carried over from the current device state rather than invented. See
 * `setWindowGeometry` for why.
 */
interface PreservedGeometryState {
	/** Current z value per window, indexed by `id - 1`. */
	z: number[]
	globalOption: unknown[]
	defaultLayout: number
	preset: number
}

/**
 * Pulls the carry-through fields out of a Table 1.3.2.1 response.
 *
 * Deliberately strict: a field we cannot read is thrown on rather than defaulted, because the
 * documented default is exactly the value that was found to be wrong on real hardware. Aborting the
 * write is a smaller failure than silently resetting device state.
 *
 * Throws a plain `Error` rather than `AvitechApiError` on purpose - importing that would pull
 * `avitech-api.js` (and through it `@companion-module/base`) into the adapter import chain, which
 * `tools/bench.mjs` relies on staying free of runtime dependencies.
 */
function readPreservedGeometryState(response: AvitechResponse): PreservedGeometryState {
	if (response === null || typeof response !== 'object' || Array.isArray(response)) {
		throw new Error(`Expected an object from the window geometry Get, received: ${JSON.stringify(response)}`)
	}

	const { win, global_option: globalOption, default_layout: defaultLayout, preset } = response

	if (!Array.isArray(win)) throw new Error('Window geometry response has no "win" array')
	if (!Array.isArray(globalOption)) throw new Error('Window geometry response has no "global_option" array')
	if (typeof defaultLayout !== 'number') throw new Error('Window geometry response has no "default_layout" number')
	if (typeof preset !== 'number') throw new Error('Window geometry response has no "preset" number')

	const z: number[] = []
	for (const entry of win) {
		if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
			throw new Error('Window geometry response contains a malformed "win" entry')
		}

		const { id, data } = entry as Record<string, unknown>
		if (typeof id !== 'number' || !Array.isArray(data) || typeof data[GEOMETRY_Z_INDEX] !== 'number') {
			throw new Error('Window geometry response contains a "win" entry with no id or z value')
		}

		z[id - 1] = data[GEOMETRY_Z_INDEX]
	}

	return { z, globalOption, defaultLayout, preset }
}

/**
 * Base class for a model-specific adapter. The abstract methods below (routing/audio) plus the
 * concrete section 1.3.2 window commands are supported in the same wire shape across every mode of
 * both models, so they're pulled up here for callers that don't need to know which concrete adapter
 * they're holding. Commands that only exist for one model (K/M mode, output resolution,
 * daisy-chain label text - see reference guide sections 1.3.4/1.3.5) live only on
 * `Sequoia4K60LAdapter`, and callers narrow with `instanceof` first.
 */
export abstract class SequoiaAdapter {
	abstract readonly model: DeviceModel
	abstract readonly capabilities: SequoiaCapabilities

	constructor(
		protected readonly self: ModuleInstance,
		protected readonly api: AvitechHttpApi,
	) {}

	abstract setRouting(input: number, port: number, winid: number): Promise<void>
	abstract getRouting(): Promise<AvitechResponse>
	abstract setAudio(port: number, winid: number): Promise<void>

	// --- Section 1.3.2, Commands for Controlling Window -------------------------------------
	// Documented once for "Sequoia 4K60/4K60L" with a single request shape, so there is nothing
	// for a subclass to branch on. Section 1.3.5 does not list any of these, so `actions.ts` does
	// not register them for daisy-chain mode.

	/**
	 * Table 1.3.2.1. The guide shows this response only as a screenshot (Figure 1.3.2.1), so the
	 * shape below - captured from a 4K60L on 2026-07-29 - is the real source of truth:
	 *
	 * ```json
	 * {"port":1,
	 *  "win":[{"id":1,"data":[0,0,1920,1080,0,1,1,1],
	 *          "win_crop":[0,0,10000,10000],"virt_win":[0,0,1920,1080]}, ... x4],
	 *  "resolution":[3840,2160],"global_option":[0,0,0,1,0],"default_layout":0,"preset":0}
	 * ```
	 *
	 * Two details contradict the guide, and both are why `setWindowGeometry` calls this before it
	 * writes:
	 *
	 * - **z-order is not win_id order.** The guide states the z values 0~3 "correspond to the order
	 *   from win_id 1 ~ win_id 4", but this unit reported 0, 2, 1, 3 for windows 1-4. z is real
	 *   independent state, not a restatement of the id.
	 * - **`global_option` is not all zeros.** The guide says to leave it at 0 and not change it; the
	 *   device reported [0,0,0,1,0]. Index 3 holds a non-default value in the field.
	 *
	 * `win_crop` and `virt_win` come back but appear nowhere in the guide, and the Set command has
	 * no inputs corresponding to them. They were unaffected by a Set that omitted them, and
	 * `virt_win` tracked position exactly, so it looks derived. Left alone.
	 */
	async getWindowGeometry(): Promise<AvitechResponse> {
		return this.api.sendCommand('2060', { func: 'get', type: 'position', port: WINDOW_COMMAND_PORT })
	}

	/**
	 * Table 1.3.2.2. Sets all four windows in one request - the guide gives no example of a partial
	 * update, so the caller supplies the complete layout.
	 *
	 * Reads the current geometry first, which the guide gives no reason to do. Two of the fields
	 * this command must write are ones the caller does not supply, and following the guide's
	 * instructions for them was measured corrupting device state on a 4K60L (2026-07-29):
	 *
	 * - **z.** The guide says z 0~3 tracks win_id order and "currently cannot be modify", implying
	 *   it is safe to derive as `index`. It is neither. A unit sitting at z = 0,2,1,3 was sent
	 *   0,1,2,3 and ended up at 1,2,0,3 - so the device acts on an incoming z, but not by taking
	 *   the value given. Since the resulting z cannot be predicted, it can only be preserved.
	 * - **`global_option`.** The guide says to leave it at 0 and not change it. The same unit
	 *   reported [0,0,0,1,0], and writing the documented five zeros reset index 3 to 0.
	 *
	 * `default_layout` and `preset` are carried through for the same reason, though both have only
	 * ever been observed as 0. `resolution` comes from the caller: it is a real option on the
	 * action, not opaque state.
	 *
	 * The extra round-trip is the cost of not corrupting state the module does not model. If the
	 * read fails the write is abandoned rather than falling back to the documented defaults, since
	 * those defaults are the known-bad values.
	 */
	async setWindowGeometry(windows: WindowGeometry[], resolution: [number, number]): Promise<void> {
		const preserved = readPreservedGeometryState(await this.getWindowGeometry())

		await this.api.sendCommand('2060', {
			func: 'set',
			type: 'position',
			port: WINDOW_COMMAND_PORT,
			win: windows.map((window, index) => {
				const z = preserved.z[index]
				if (typeof z !== 'number') {
					throw new Error(`Window geometry response had no z value for window ${index + 1}`)
				}

				return {
					id: index + 1,
					data: [window.x, window.y, window.w, window.h, z, window.aspect, window.fit, window.show],
				}
			}),
			global_option: preserved.globalOption,
			resolution,
			default_layout: preserved.defaultLayout,
			preset: preserved.preset,
		})
	}

	/**
	 * Table 1.3.2.3. Response captured from a 4K60L on 2026-07-29; the guide shows only a
	 * screenshot (Figure 1.3.2.2):
	 *
	 * ```json
	 * {"sib_label":["Source 1","Source 2","Source 3","Source 4",
	 *               "Source 64","Source 65", ... ,"Source 79"]}
	 * ```
	 *
	 * Twenty entries, not four. The key name ("sib", presumably sibling) and the 4 -> 64 jump in the
	 * default numbering both suggest the array spans a full daisy chain rather than one unit's four
	 * inputs. On a non-chained unit the first four entries are the ones `setWindowLabel` ports 1-4
	 * address; what the remaining sixteen refer to is not established. Confirm against a real chain
	 * before driving variables off any index past 3.
	 */
	async getWindowLabels(): Promise<AvitechResponse> {
		return this.api.sendCommand('Info', { func: 'get', type: 'label' })
	}

	/**
	 * Table 1.3.2.4. The guide shows both a four-port and a single-port example, so addressing one
	 * port at a time is documented behaviour rather than a guess.
	 *
	 * Not to be confused with `Sequoia4K60LAdapter.setLabel()`, which is the section 1.3.5
	 * daisy-chain variant of this command (same cmd/type, plus `daisy: 1`).
	 */
	async setWindowLabel(port: number, label: string): Promise<void> {
		await this.api.sendCommand('Info', { func: 'set', type: 'genlabel', label: [{ port, label }] })
	}

	/** Table 1.3.2.5. */
	async setWindowShow(winid: number, show: number): Promise<void> {
		await this.api.sendCommand('Ext', {
			func: 'set',
			type: 'win',
			port: WINDOW_COMMAND_PORT,
			winid,
			data: { show },
		})
	}

	/** Table 1.3.2.6. Same cmd/type as `setWindowShow`; only the `data` key differs. */
	async setWindowAspect(winid: number, aspect: number): Promise<void> {
		await this.api.sendCommand('Ext', {
			func: 'set',
			type: 'win',
			port: WINDOW_COMMAND_PORT,
			winid,
			data: { aspect },
		})
	}

	/** Table 1.3.2.7. `full` is 0 to return to multiview, or 1-4 to fullscreen that window. */
	async setFullscreen(full: number): Promise<void> {
		await this.api.sendCommand('Ext', {
			func: 'set',
			type: 'global_option',
			port: WINDOW_COMMAND_PORT,
			data: { full },
		})
	}
}
