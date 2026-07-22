import { SequoiaAdapter, type SequoiaCapabilities } from './base.js'

/**
 * Sequoia 4K60. Supports up to 5 output ports and does not support HDMI daisy-chaining.
 * Model-specific commands (Routing - Set for Quad Multiview + Workstation / Seamless Switching
 * modes, the matching Audio - Set variants, etc - see reference guide section 1.3.3) go here.
 */
export class Sequoia4K60Adapter extends SequoiaAdapter {
	readonly model = 'sequoia-4k60' as const
	readonly capabilities: SequoiaCapabilities = {
		maxPorts: 5,
		supportsDaisyChain: false,
	}
}
