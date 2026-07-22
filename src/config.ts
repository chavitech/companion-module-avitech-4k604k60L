import { Regex, type SomeCompanionConfigField } from '@companion-module/base'
import { DEVICE_MODE_CHOICES, type DeviceMode } from './models.js'

export type ModuleConfig = {
	mode: DeviceMode
	host: string
	port: number
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'dropdown',
			id: 'mode',
			label: 'Model / Operating Mode',
			width: 6,
			choices: DEVICE_MODE_CHOICES,
			default: DEVICE_MODE_CHOICES[0].id,
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Target IP',
			width: 8,
			regex: Regex.IP,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Target Port',
			width: 4,
			min: 1,
			max: 65535,
			default: 80,
		},
	]
}
