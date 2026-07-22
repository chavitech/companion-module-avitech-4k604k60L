import type { AvitechResponse } from '../avitech-api.js'
import { SequoiaAdapter, type SequoiaCapabilities } from './base.js'

/**
 * Sequoia 4K60 (reference guide section 1.3.3). Supports up to 5 output ports and does not
 * support HDMI daisy-chaining.
 *
 * Both of the 4K60's operating modes (Quad Multiview + Workstation, and Seamless Switching)
 * produce byte-identical HTTP requests for every command below - the reference guide only
 * documents different *recommended* winid values per mode, not a different request shape. So
 * there's nothing to branch on internally here; the device itself rejects an invalid combination
 * with "Wrong format".
 */
export class Sequoia4K60Adapter extends SequoiaAdapter {
	readonly model = 'sequoia-4k60' as const
	readonly capabilities: SequoiaCapabilities = {
		maxPorts: 5,
		supportsDaisyChain: false,
	}

	async setRouting(input: number, port: number, winid: number): Promise<void> {
		await this.api.sendCommand('2060', {
			func: 'set',
			type: 'route2win',
			route: [{ input, output: [{ port, winid }] }],
		})
	}

	async getRouting(): Promise<AvitechResponse> {
		return this.api.sendCommand('2060', { func: 'get', type: 'route2win' })
	}

	async setAudio(port: number, winid: number): Promise<void> {
		await this.api.sendCommand('2060', { func: 'set', type: 'audio', port, winid })
	}
}
