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
 * Base class for a model-specific adapter. The three methods below (routing/audio) are supported
 * in the same wire shape across every mode of both models, so they're pulled up here for callers
 * that don't need to know which concrete adapter they're holding. Commands that only exist for
 * one model (K/M mode, output resolution, daisy-chain label text - see reference guide sections
 * 1.3.4/1.3.5) live only on `Sequoia4K60LAdapter`, and callers narrow with `instanceof` first.
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
}
