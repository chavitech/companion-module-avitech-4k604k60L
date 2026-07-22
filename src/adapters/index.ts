import type { AvitechHttpApi } from '../avitech-api.js'
import type { DeviceModel } from '../models.js'
import type ModuleInstance from '../main.js'
import { SequoiaAdapter } from './base.js'
import { Sequoia4K60Adapter } from './sequoia-4k60.js'
import { Sequoia4K60LAdapter } from './sequoia-4k60l.js'

export { SequoiaAdapter, type SequoiaCapabilities } from './base.js'

export function createAdapter(model: DeviceModel, self: ModuleInstance, api: AvitechHttpApi): SequoiaAdapter {
	switch (model) {
		case 'sequoia-4k60':
			return new Sequoia4K60Adapter(self, api)
		case 'sequoia-4k60l':
			return new Sequoia4K60LAdapter(self, api)
	}
}
