import { SequoiaAdapter, type SequoiaCapabilities } from './base.js'

/**
 * Sequoia 4K60L. Supports up to 4 output ports and supports HDMI daisy-chaining additional units.
 * Model-specific commands (Routing - Set for Quad Multiview + Bypass / Single-View Seamless
 * Switching modes, K/M Mode - Set, the matching Audio/Output Resolution - Set variants, and the
 * daisy-chain-only commands in section 1.3.5) go here.
 */
export class Sequoia4K60LAdapter extends SequoiaAdapter {
	readonly model = 'sequoia-4k60l' as const
	readonly capabilities: SequoiaCapabilities = {
		maxPorts: 4,
		supportsDaisyChain: true,
	}
}
