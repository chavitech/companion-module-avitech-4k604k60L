import { InstanceStatus } from '@companion-module/base'
import type ModuleInstance from './main.js'

/**
 * Every Sequoia HTTP command is sent as:
 *   http://<ip>/cgi-bin/command.cgi?cmd=<cmd>&param=<json>
 * where `cmd` selects the command family (e.g. "Info", "Ext", "2060") and `param` is a JSON
 * object that always includes `func` (get/set/load/list/del) and `type` (the specific command),
 * plus whatever extra fields that command needs (port, data, name, etc).
 */
export interface AvitechCommandParam {
	func: string
	type: string
	[key: string]: unknown
}

/**
 * The device replies with the literal text "Success" or "Wrong format" for set/load/del style
 * commands, and with a JSON value (object, array, or occasionally `null`/`{}`) for get/list commands.
 */
export type AvitechResponse = string | Record<string, unknown> | unknown[] | null

export class AvitechApiError extends Error {}

const REQUEST_TIMEOUT_MS = 5000

export class AvitechHttpApi {
	constructor(private readonly self: ModuleInstance) {}

	async sendCommand(cmd: string, param: AvitechCommandParam): Promise<AvitechResponse> {
		const url = this.buildUrl(cmd, param)

		this.self.log('debug', `Avitech HTTP request: ${url}`)

		let response: Response
		try {
			response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
		} catch (error) {
			this.self.updateStatus(InstanceStatus.ConnectionFailure, `Request failed: ${(error as Error).message}`)
			throw error
		}

		const text = await response.text()

		if (!response.ok) {
			this.self.updateStatus(InstanceStatus.ConnectionFailure, `HTTP ${response.status}`)
			throw new AvitechApiError(`HTTP ${response.status}: ${text}`)
		}

		this.self.updateStatus(InstanceStatus.Ok)

		return this.parseResponse(text)
	}

	private buildUrl(cmd: string, param: AvitechCommandParam): string {
		const { host, port } = this.self.config
		const portSuffix = port && port !== 80 ? `:${port}` : ''

		return `http://${host}${portSuffix}/cgi-bin/command.cgi?cmd=${encodeURIComponent(cmd)}&param=${encodeURIComponent(
			JSON.stringify(param),
		)}`
	}

	private parseResponse(text: string): AvitechResponse {
		const trimmed = text.trim()

		if (trimmed === 'Wrong format') {
			throw new AvitechApiError('Device reported: Wrong format')
		}

		if (trimmed === 'Success' || trimmed === '') {
			return trimmed
		}

		let parsed: AvitechResponse
		try {
			parsed = JSON.parse(trimmed)
		} catch {
			return trimmed
		}

		// Undocumented in the v1.0.8 reference guide: some commands on newer firmware reply with a
		// {"cb_status":"..."} envelope instead of the documented "Success"/"Wrong format" strings
		// when a command is rejected (observed value so far: "Not Permitted"). Surface that as a
		// thrown error the same way "Wrong format" is, rather than letting it look like a success.
		if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
			const cbStatus = parsed.cb_status
			if (typeof cbStatus === 'string' && !/^(ok|success)$/i.test(cbStatus)) {
				throw new AvitechApiError(`Device reported: ${cbStatus}`)
			}
		}

		return parsed
	}
}
