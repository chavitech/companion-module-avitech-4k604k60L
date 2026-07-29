import type { AvitechHttpApi } from '../avitech-api.js'
import { getModelForMode, type DeviceMode } from '../models.js'
import type ModuleInstance from '../main.js'
import { SequoiaAdapter } from './base.js'
import { Sequoia4K60Adapter } from './sequoia-4k60.js'
import { Sequoia4K60LAdapter, type Sequoia4K60LMode } from './sequoia-4k60l.js'

export { SequoiaAdapter, type SequoiaCapabilities, type WindowGeometry } from './base.js'
export { Sequoia4K60Adapter } from './sequoia-4k60.js'
export { Sequoia4K60LAdapter, type Sequoia4K60LMode } from './sequoia-4k60l.js'

export function createAdapter(mode: DeviceMode, self: ModuleInstance, api: AvitechHttpApi): SequoiaAdapter {
	const model = getModelForMode(mode)

	switch (model) {
		case 'sequoia-4k60':
			return new Sequoia4K60Adapter(self, api)
		case 'sequoia-4k60l':
			return new Sequoia4K60LAdapter(self, api, mode as Sequoia4K60LMode)
	}
}
