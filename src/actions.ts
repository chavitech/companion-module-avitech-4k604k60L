import type { CompanionActionDefinition, DropdownChoice, SomeCompanionActionInputField } from '@companion-module/base'
import type ModuleInstance from './main.js'
import { Sequoia4K60LAdapter } from './adapters/index.js'
import { RESOLUTION_MODES } from './resolutions.js'

export type ActionsSchema = {
	set_routing: {
		options: {
			input: number
			port: number
			winid?: number
		}
	}
	get_routing: {
		options: Record<string, never>
	}
	set_audio: {
		options: {
			port?: number
			winid: number
		}
	}
	set_km_reboot_mode: {
		options: {
			mode: number
		}
	}
	set_km_control: {
		options: {
			winid: number
		}
	}
	set_output_resolution: {
		options: {
			port?: number
			mode: number
		}
	}
	set_label: {
		options: {
			port: number
			label: string
		}
	}
}

const HDMI_OUT_CHOICES = (count: number): DropdownChoice[] =>
	Array.from({ length: count }, (_, i) => ({ id: i + 1, label: `HDMI OUT ${i + 1}` }))

const RESOLUTION_CHOICES: DropdownChoice[] = RESOLUTION_MODES.map((resolution) => ({
	id: resolution.mode,
	label: resolution.label,
}))

export function UpdateActions(self: ModuleInstance): void {
	const mode = self.config.mode
	const is4k60 = mode === 'sequoia-4k60-quad-workstation' || mode === 'sequoia-4k60-seamless'
	const isQuadBypass = mode === 'sequoia-4k60l-quad-bypass'
	const isSingleView = mode === 'sequoia-4k60l-single-view-seamless'
	const isDaisyChain = mode === 'sequoia-4k60l-daisy-chain'

	const set_routing: CompanionActionDefinition<ActionsSchema['set_routing']['options']> | undefined = isDaisyChain
		? undefined
		: {
				name: 'Set Routing',
				options: is4k60
					? [
							{
								id: 'input',
								type: 'number',
								label: 'Input Port',
								default: 1,
								min: 0,
								max: 4,
								tooltip: "0 = duplicate HDMI OUT 1's multiview layout (valid only for OUT 2/3/4). 1-4 = input port.",
							},
							{
								id: 'port',
								type: 'dropdown',
								label: 'Output Port',
								default: 1,
								choices: HDMI_OUT_CHOICES(5),
							},
							{
								id: 'winid',
								type: 'number',
								label: 'Window ID',
								default: 1,
								min: 1,
								max: 254,
								tooltip:
									'OUT1: 1-4 selects the quad-view window. OUT2/3/4: window select (Workstation mode) or fixed to 1 (Seamless mode). OUT5: always 1.',
							},
						]
					: isQuadBypass
						? [
								{ id: 'input', type: 'number', label: 'Input Port', default: 1, min: 1, max: 4 },
								{
									id: 'port',
									type: 'dropdown',
									label: 'Output Port',
									default: 1,
									choices: HDMI_OUT_CHOICES(3),
								},
								{
									id: 'winid',
									type: 'number',
									label: 'Window ID',
									default: 1,
									min: 1,
									max: 4,
									tooltip: 'Ignored when targeting HDMI OUT 2 or 3; selects OUT 1s quad-view window otherwise.',
								},
							]
						: [
								{ id: 'input', type: 'number', label: 'Input Port', default: 1, min: 1, max: 4 },
								{
									id: 'port',
									type: 'dropdown',
									label: 'Output Port',
									default: 1,
									choices: HDMI_OUT_CHOICES(4),
								},
							],
				callback: async (event) => {
					const winid = event.options.winid ?? 1
					try {
						await self.adapter.setRouting(event.options.input, event.options.port, winid)
					} catch (error) {
						self.log('error', `Set Routing failed: ${(error as Error).message}`)
					}
				},
			}

	const get_routing: CompanionActionDefinition<ActionsSchema['get_routing']['options']> | undefined = isDaisyChain
		? undefined
		: {
				name: 'Refresh Routing Info',
				options: [],
				callback: async () => {
					try {
						const result = await self.adapter.getRouting()
						self.log('info', `Routing info: ${JSON.stringify(result)}`)
					} catch (error) {
						self.log('error', `Get Routing Info failed: ${(error as Error).message}`)
					}
				},
			}

	const audioOptions: SomeCompanionActionInputField<'port' | 'winid'>[] = []
	if (!isDaisyChain) {
		audioOptions.push({
			id: 'port',
			type: 'dropdown',
			label: 'Output Port',
			default: 1,
			choices: HDMI_OUT_CHOICES(is4k60 ? 5 : isQuadBypass ? 3 : 4),
		})
	}
	audioOptions.push({
		id: 'winid',
		type: 'number',
		label: 'Window ID',
		default: 0,
		min: 0,
		max: is4k60 ? 4 : isQuadBypass ? 4 : isSingleView ? 1 : 16,
		tooltip: is4k60
			? '0 = off; 1-4 selects window (meaning depends on operating mode).'
			: isQuadBypass
				? 'OUT1: 0 = off, 1-4 = window. OUT2/3: 0 = off, 1 = on.'
				: isSingleView
					? '0 = off, 1 = on.'
					: '0 = off; 1-16 selects window across the daisy chain.',
	})

	const set_audio: CompanionActionDefinition<ActionsSchema['set_audio']['options']> = {
		name: 'Set Audio',
		options: audioOptions,
		callback: async (event) => {
			const port = event.options.port ?? 1
			try {
				await self.adapter.setAudio(port, event.options.winid)
			} catch (error) {
				self.log('error', `Set Audio failed: ${(error as Error).message}`)
			}
		},
	}

	const set_km_reboot_mode: CompanionActionDefinition<ActionsSchema['set_km_reboot_mode']['options']> | undefined =
		isQuadBypass
			? {
					name: 'Set K/M Mode (persists after reboot)',
					options: [
						{
							id: 'mode',
							type: 'dropdown',
							label: 'Mode',
							default: 0,
							choices: [
								{ id: 0, label: 'Host' },
								{ id: 1, label: 'Window 1 Remote' },
								{ id: 2, label: 'Window 2 Remote' },
								{ id: 3, label: 'Window 3 Remote' },
								{ id: 4, label: 'Window 4 Remote' },
							],
						},
					],
					callback: async (event) => {
						if (!(self.adapter instanceof Sequoia4K60LAdapter)) return
						try {
							await self.adapter.setKmRebootMode(event.options.mode)
						} catch (error) {
							self.log('error', `Set K/M Mode failed: ${(error as Error).message}`)
						}
					},
				}
			: undefined

	const set_km_control: CompanionActionDefinition<ActionsSchema['set_km_control']['options']> | undefined =
		isQuadBypass || isDaisyChain
			? {
					name: 'Set K/M Control (live)',
					options: [
						{
							id: 'winid',
							type: 'number',
							label: 'Window ID',
							default: 0,
							min: 0,
							max: isDaisyChain ? 16 : 4,
							tooltip: '0 = Host mode; 1-N = that windows Remote mode.',
						},
					],
					callback: async (event) => {
						if (!(self.adapter instanceof Sequoia4K60LAdapter)) return
						try {
							await self.adapter.setKmControl(event.options.winid)
						} catch (error) {
							self.log('error', `Set K/M Control failed: ${(error as Error).message}`)
						}
					},
				}
			: undefined

	const resolutionOptions: SomeCompanionActionInputField<'port' | 'mode'>[] = []
	if (isSingleView) {
		resolutionOptions.push({
			id: 'port',
			type: 'dropdown',
			label: 'Output Port',
			default: 1,
			choices: HDMI_OUT_CHOICES(4),
		})
	}
	resolutionOptions.push({
		id: 'mode',
		type: 'dropdown',
		label: 'Resolution',
		default: RESOLUTION_MODES[0].mode,
		choices: RESOLUTION_CHOICES,
	})

	const set_output_resolution:
		CompanionActionDefinition<ActionsSchema['set_output_resolution']['options']> | undefined =
		isQuadBypass || isSingleView || isDaisyChain
			? {
					name: 'Set Output Resolution',
					options: resolutionOptions,
					callback: async (event) => {
						if (!(self.adapter instanceof Sequoia4K60LAdapter)) return
						const port = event.options.port ?? 1
						try {
							await self.adapter.setOutputResolution(port, event.options.mode)
						} catch (error) {
							self.log('error', `Set Output Resolution failed: ${(error as Error).message}`)
						}
					},
				}
			: undefined

	const set_label: CompanionActionDefinition<ActionsSchema['set_label']['options']> | undefined = isDaisyChain
		? {
				name: 'Set Port Label',
				options: [
					{ id: 'port', type: 'number', label: 'Port', default: 1, min: 1, max: 16 },
					{
						id: 'label',
						type: 'textinput',
						label: 'Label',
						default: '',
						tooltip: 'Allowed characters exclude: < > ! @ # $ % ^ & * " \' ` / \\ , . : ; ? =',
					},
				],
				callback: async (event) => {
					if (!(self.adapter instanceof Sequoia4K60LAdapter)) return
					try {
						await self.adapter.setLabel(event.options.port, event.options.label)
					} catch (error) {
						self.log('error', `Set Port Label failed: ${(error as Error).message}`)
					}
				},
			}
		: undefined

	self.setActionDefinitions({
		set_routing,
		get_routing,
		set_audio,
		set_km_reboot_mode,
		set_km_control,
		set_output_resolution,
		set_label,
	})
}
