import type { AvitechResponse } from '../avitech-api.js'
import type { DeviceMode } from '../models.js'
import type ModuleInstance from '../main.js'
import type { AvitechHttpApi } from '../avitech-api.js'
import { SequoiaAdapter, type SequoiaCapabilities } from './base.js'

export type Sequoia4K60LMode = Extract<
	DeviceMode,
	'sequoia-4k60l-quad-bypass' | 'sequoia-4k60l-single-view-seamless' | 'sequoia-4k60l-daisy-chain'
>

/**
 * Sequoia 4K60L (reference guide sections 1.3.4 and 1.3.5). Supports up to 4 output ports, and
 * supports HDMI daisy-chaining additional units together into one addressable group (section
 * 1.3.5 - commands sent to the primary unit's IP, addressing ports/windows 1-16 across the chain).
 *
 * Unlike the 4K60, the 4K60L's operating modes genuinely change the request shape for several
 * commands, so this adapter branches on the configured mode.
 */
export class Sequoia4K60LAdapter extends SequoiaAdapter {
	readonly model = 'sequoia-4k60l' as const
	readonly capabilities: SequoiaCapabilities = {
		maxPorts: 4,
		supportsDaisyChain: true,
	}

	constructor(
		self: ModuleInstance,
		api: AvitechHttpApi,
		private readonly mode: Sequoia4K60LMode,
	) {
		super(self, api)
	}

	async setRouting(input: number, port: number, winid: number): Promise<void> {
		if (this.mode === 'sequoia-4k60l-quad-bypass') {
			if (port === 1) {
				// Table 1.3.4.1
				await this.api.sendCommand('2060', {
					func: 'set',
					type: 'route2win',
					route: [{ input, output: [{ port: 1, winid }] }],
				})
			} else {
				// Table 1.3.4.2: enable=1 and mode=2 are fixed constants baked in here. The doc's own
				// Cmd-Value Format row for this command only lists port/from as variable inputs, yet the
				// worked example hardcodes enable/mode with no further explanation anywhere in the guide.
				// Treating this as a documentation inconsistency rather than guessing at other values.
				await this.api.sendCommand('2060', {
					func: 'set',
					type: 'hdmi_output',
					port,
					enable: 1,
					mode: 2,
					from: input,
				})
			}
		} else if (this.mode === 'sequoia-4k60l-single-view-seamless') {
			// Table 1.3.4.3: winid is always 1 - single-view mode has exactly one active window per output.
			await this.api.sendCommand('2060', {
				func: 'set',
				type: 'route2win',
				route: [{ input, output: [{ port, winid: 1 }] }],
			})
		}
		// Daisy-chain mode has no Routing - Set command in section 1.3.5; never called (actions.ts
		// does not register `set_routing` for this mode).
	}

	async getRouting(): Promise<AvitechResponse> {
		// Table 1.3.4.4. Same for both quad-bypass and single-view-seamless; not used in daisy-chain.
		return this.api.sendCommand('2060', { func: 'get', type: 'hdmi_output' })
	}

	async setAudio(port: number, winid: number): Promise<void> {
		if (this.mode === 'sequoia-4k60l-quad-bypass') {
			if (port === 1) {
				// Table 1.3.4.7, HDMI OUT 1
				await this.api.sendCommand('2060', { func: 'set', type: 'audio', port: 1, winid })
			} else {
				// Table 1.3.4.7, HDMI OUT 2/3: `location` fixed to 1, the only value shown in the guide.
				await this.api.sendCommand('2060', { func: 'set', type: 'audio', location: 1, port, winid })
			}
		} else if (this.mode === 'sequoia-4k60l-single-view-seamless') {
			// Table 1.3.4.8
			await this.api.sendCommand('2060', { func: 'set', type: 'audio', port, winid })
		} else {
			// Section 1.3.5 Audio - Set: a different `cmd` family entirely ("Daisy", not "2060").
			// `location` and `port` are both fixed to 1 per the guide's only example.
			await this.api.sendCommand('Daisy', { func: 'set', type: 'audio', location: 1, port: 1, winid })
		}
	}

	/** Table 1.3.4.5 (quad-bypass only). `port` fixed to 1 (labeled "HDMI OUT" in the guide's example). */
	async setKmRebootMode(mode: number): Promise<void> {
		await this.api.sendCommand('Ext', { func: 'set', type: 'PowerOn_KMmode', port: 1, mode })
	}

	// K/M Control - Set (Table 1.3.4.6 / 1.3.5.3) and Output Resolution - Set (Tables 1.3.4.9/1.3.4.10
	// and section 1.3.5) used to live here. Section 1.3.1 documents both for the 4K60 as well, in the
	// same request shape, so they moved to `SequoiaAdapter` as `setKmControl` and
	// `setOutputResolution`. The mode restrictions the 4K60L sections describe are enforced by
	// `actions.ts` gating, which is where every other mode restriction in this module already lives.

	/** Section 1.3.5 Label Text - Set (daisy-chain only). `daisy:1` fixed; one port/label pair per call. */
	async setLabel(port: number, label: string): Promise<void> {
		await this.api.sendCommand('Info', { func: 'set', type: 'genlabel', daisy: 1, label: [{ port, label }] })
	}
}
