import type { AvitechHttpApi } from '../avitech-api.js'
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
 * Base class for a model-specific adapter. Shared commands (see reference guide sections 1.3.1
 * and 1.3.2) can be implemented directly against `api` wherever they're needed; commands that
 * differ per-model (sections 1.3.3/1.3.4/1.3.5 - routing, K/M mode, audio, resolution) belong on
 * the concrete subclasses below so callers don't need to branch on `model` themselves.
 */
export abstract class SequoiaAdapter {
	abstract readonly model: DeviceModel
	abstract readonly capabilities: SequoiaCapabilities

	constructor(
		protected readonly self: ModuleInstance,
		protected readonly api: AvitechHttpApi,
	) {}
}
