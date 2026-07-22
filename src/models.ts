import type { DropdownChoice } from '@companion-module/base'

/**
 * The Sequoia 4K60 and 4K60L share the majority of their HTTP command set, but diverge on
 * things like routing modes, daisy-chain support, and the number of available output ports.
 * The instance's configured model selects which adapter (see ./adapters) handles those differences.
 */
export const DEVICE_MODELS = ['sequoia-4k60', 'sequoia-4k60l'] as const

export type DeviceModel = (typeof DEVICE_MODELS)[number]

export const DEVICE_MODEL_CHOICES: DropdownChoice[] = [
	{ id: 'sequoia-4k60', label: 'Sequoia 4K60' },
	{ id: 'sequoia-4k60l', label: 'Sequoia 4K60L' },
]
