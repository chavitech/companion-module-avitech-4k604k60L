import type { DropdownChoice } from '@companion-module/base'

/**
 * The Sequoia 4K60 and 4K60L each support a couple of mutually-exclusive operating modes that
 * change the shape of several HTTP commands (routing, audio, resolution, K/M control). Since a
 * unit's mode is a fact about how it's physically configured (not something this module can
 * change), the instance config asks for it directly as a single combined model+mode choice -
 * that also guarantees an invalid model/mode combination can never exist in config.
 */
export const DEVICE_MODES = [
	'sequoia-4k60-quad-workstation',
	'sequoia-4k60-seamless',
	'sequoia-4k60l-quad-bypass',
	'sequoia-4k60l-single-view-seamless',
	'sequoia-4k60l-daisy-chain',
] as const

export type DeviceMode = (typeof DEVICE_MODES)[number]

export const DEVICE_MODE_CHOICES: DropdownChoice[] = [
	{ id: 'sequoia-4k60-quad-workstation', label: 'Sequoia 4K60 — Quad Multiview + Workstation' },
	{ id: 'sequoia-4k60-seamless', label: 'Sequoia 4K60 — Seamless Switching' },
	{ id: 'sequoia-4k60l-quad-bypass', label: 'Sequoia 4K60L — Quad Multiview + Bypass' },
	{ id: 'sequoia-4k60l-single-view-seamless', label: 'Sequoia 4K60L — Single-View Seamless Switching' },
	{ id: 'sequoia-4k60l-daisy-chain', label: 'Sequoia 4K60L — Daisy Chain' },
]

export type DeviceModel = 'sequoia-4k60' | 'sequoia-4k60l'

export function getModelForMode(mode: DeviceMode): DeviceModel {
	return mode.startsWith('sequoia-4k60l') ? 'sequoia-4k60l' : 'sequoia-4k60'
}
