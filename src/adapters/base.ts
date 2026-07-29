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
 * here: the guide states the Z-axis numbers 0~3 always correspond to win_id 1~4 in order and
 * "currently cannot be modify", so it's derived rather than accepted from the caller.
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
	 * Two details contradict the guide and both matter to `setWindowGeometry`:
	 *
	 * - **z-order is not win_id order.** The guide states the z values 0~3 "correspond to the order
	 *   from win_id 1 ~ win_id 4", but this unit reported 0, 2, 1, 3 for windows 1-4. z is real
	 *   independent state, not a restatement of the id.
	 * - **`global_option` is not all zeros.** The guide says to leave it at 0 and not change it; the
	 *   device reported [0,0,0,1,0]. Index 3 holds a non-default value in the field.
	 *
	 * `win_crop` and `virt_win` come back but appear nowhere in the guide, and the Set command has
	 * no inputs corresponding to them.
	 */
	async getWindowGeometry(): Promise<AvitechResponse> {
		return this.api.sendCommand('2060', { func: 'get', type: 'position', port: WINDOW_COMMAND_PORT })
	}

	/**
	 * Table 1.3.2.2. Sets all four windows in one request - the guide gives no example of a
	 * partial update, so the caller supplies the complete layout.
	 *
	 * `global_option`, `default_layout` and `preset` are hard-coded to the guide's instruction to
	 * "leave them remain in 0 and do not change it".
	 *
	 * KNOWN RISK, unresolved: the device does not agree with the guide on two of the values this
	 * command writes blind (see `getWindowGeometry` for the captured response).
	 *
	 * - z is derived here as `index`, i.e. 0,1,2,3, because the guide says z tracks win_id order and
	 *   "currently cannot be modify". A real unit reported 0,2,1,3. If the device does honour an
	 *   incoming z, this call silently restacks windows 2 and 3.
	 * - `global_option` is sent as five zeros per the guide. A real unit reported [0,0,0,1,0], so
	 *   this may be clobbering index 3.
	 *
	 * Both are only fixable by reading the current geometry first and preserving these fields, which
	 * would make this command stateful. Left as-is deliberately pending a decision.
	 */
	async setWindowGeometry(windows: WindowGeometry[], resolution: [number, number]): Promise<void> {
		await this.api.sendCommand('2060', {
			func: 'set',
			type: 'position',
			port: WINDOW_COMMAND_PORT,
			win: windows.map((window, index) => ({
				id: index + 1,
				data: [window.x, window.y, window.w, window.h, index, window.aspect, window.fit, window.show],
			})),
			global_option: [0, 0, 0, 0, 0],
			resolution,
			default_layout: 0,
			preset: 0,
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
