/**
 * Shared output resolution/frame-rate mode codes, referenced by the "Output Resolution - Set" family of
 * commands across both the 4K60 and 4K60L (see the reference guide's "resolution code corresponding table").
 */
export interface ResolutionMode {
	mode: number
	label: string
}

export const RESOLUTION_MODES: ResolutionMode[] = [
	{ mode: 0, label: 'Auto detect (EDID from connected display)' },
	{ mode: 107, label: '4096x2160 60Hz' },
	{ mode: 106, label: '4096x2160 50Hz' },
	{ mode: 199, label: '3840x2400 60Hz' },
	{ mode: 200, label: '3840x2400 50Hz' },
	{ mode: 99, label: '3840x2160 60Hz' },
	{ mode: 98, label: '3840x2160 50Hz' },
	{ mode: 96, label: '3840x2160 30Hz' },
	{ mode: 95, label: '3840x2160 25Hz' },
	{ mode: 181, label: '1920x1200 60Hz' },
	{ mode: 209, label: '1920x1200 50Hz' },
	{ mode: 74, label: '1920x1080 60Hz' },
	{ mode: 70, label: '1920x1080 50Hz' },
	{ mode: 143, label: '1280x1024 60Hz' },
	{ mode: 205, label: '1280x1024 50Hz' },
]
