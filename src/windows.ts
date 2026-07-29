import type { DropdownChoice, SomeCompanionActionInputField } from '@companion-module/base'
import type { WindowGeometry } from './adapters/index.js'

/**
 * Option value lists for the "Commands for Controlling Window" family (reference guide section
 * 1.3.2). These apply to both the 4K60 and the 4K60L - the guide documents the section once for
 * "Sequoia 4K60/4K60L" rather than per model.
 */

/**
 * Window aspect ratio codes, Table 1.3.2.6.
 *
 * Table 1.3.2.2 (Position and Size - Set) uses the same numeric domain for its `aspect` field but
 * labels 0/1 as "disabled"/"enabled" instead of "fill up window"/"auto-detect". Same codes, two
 * descriptions; the 1.3.2.6 wording is the more specific one, so it's used in both places.
 */
export const ASPECT_CHOICES: DropdownChoice[] = [
	{ id: 0, label: 'Fill up window' },
	{ id: 1, label: 'Auto-detect (follow source)' },
	{ id: 2, label: '16:9' },
	{ id: 3, label: '4:3' },
	{ id: 4, label: '16:10' },
	{ id: 5, label: '5:4' },
]

/** "fit to window" flag in a Table 1.3.2.2 window data array. */
export const FIT_CHOICES: DropdownChoice[] = [
	{ id: 0, label: 'Disabled' },
	{ id: 1, label: 'Enabled' },
]

/** Window visibility, Table 1.3.2.5 and the `show` slot of a Table 1.3.2.2 window data array. */
export const SHOW_CHOICES: DropdownChoice[] = [
	{ id: 0, label: 'Hide' },
	{ id: 1, label: 'Show' },
]

/** Fullscreen target, Table 1.3.2.7. 0 returns the output to the multiview layout. */
export const FULLSCREEN_CHOICES: DropdownChoice[] = [
	{ id: 0, label: 'Multiview (exit fullscreen)' },
	{ id: 1, label: 'Window 1' },
	{ id: 2, label: 'Window 2' },
	{ id: 3, label: 'Window 3' },
	{ id: 4, label: 'Window 4' },
]

/**
 * The `resolution` field of Table 1.3.2.2 is a literal [width, height] pair, and its list of
 * accepted values is much shorter than the frame-rate-bearing mode codes in `resolutions.ts`.
 *
 * These two are easy to confuse and are NOT interchangeable: `RESOLUTION_MODES` holds numeric mode
 * codes (74, 99, 107, ...) for the Output Resolution - Set commands in sections 1.3.4/1.3.5, while
 * this list holds pixel dimensions for the window geometry command. Sending a mode code here, or a
 * dimension pair there, is accepted-looking nonsense.
 */
export interface GeometryResolution {
	id: string
	width: number
	height: number
}

export const GEOMETRY_RESOLUTIONS: GeometryResolution[] = [
	{ id: '4096x2160', width: 4096, height: 2160 },
	{ id: '3840x2400', width: 3840, height: 2400 },
	{ id: '3840x2160', width: 3840, height: 2160 },
	{ id: '1920x1200', width: 1920, height: 1200 },
	{ id: '1920x1080', width: 1920, height: 1080 },
	{ id: '1280x1024', width: 1280, height: 1024 },
]

export const GEOMETRY_RESOLUTION_CHOICES: DropdownChoice[] = GEOMETRY_RESOLUTIONS.map((resolution) => ({
	id: resolution.id,
	label: resolution.id.replace('x', ' x '),
}))

/** Resolves a `GEOMETRY_RESOLUTION_CHOICES` id back to the [width, height] pair the device expects. */
export function parseGeometryResolution(id: string): [number, number] {
	const match = GEOMETRY_RESOLUTIONS.find((resolution) => resolution.id === id)
	if (!match) {
		throw new Error(`Unknown geometry resolution: ${id}`)
	}

	return [match.width, match.height]
}

/**
 * "Window Position and Size - Set" (Table 1.3.2.2) writes all four windows in a single request, so
 * the action needs seven fields per window plus the output resolution - 29 in total. Building that
 * array lives here rather than inline in `actions.ts` purely for size; the action definition itself
 * stays with all the others.
 */
export type GeometryWindowId = 1 | 2 | 3 | 4
export type GeometryField = 'x' | 'y' | 'w' | 'h' | 'aspect' | 'fit' | 'show'
export type GeometryOptionId = `w${GeometryWindowId}_${GeometryField}` | 'resolution'

export type WindowGeometryOptions = Record<Exclude<GeometryOptionId, 'resolution'>, number> & {
	resolution: string
}

const GEOMETRY_WINDOW_IDS: GeometryWindowId[] = [1, 2, 3, 4]

/** A 2x2 quad layout on a 3840x2160 output - the arrangement these units ship in. */
const GEOMETRY_DEFAULTS: Record<GeometryWindowId, Pick<WindowGeometry, 'x' | 'y' | 'w' | 'h'>> = {
	1: { x: 0, y: 0, w: 1920, h: 1080 },
	2: { x: 1920, y: 0, w: 1920, h: 1080 },
	3: { x: 0, y: 1080, w: 1920, h: 1080 },
	4: { x: 1920, y: 1080, w: 1920, h: 1080 },
}

export function GetWindowGeometryOptions(): SomeCompanionActionInputField<GeometryOptionId>[] {
	const fields: SomeCompanionActionInputField<GeometryOptionId>[] = [
		{
			id: 'resolution',
			type: 'dropdown',
			label: 'Output Resolution',
			default: '3840x2160',
			choices: GEOMETRY_RESOLUTION_CHOICES,
			tooltip:
				'The canvas the X/Y/W/H values below are measured against. This must match the resolution the output is actually running at, or the layout will be positioned against the wrong canvas.',
		},
	]

	for (const id of GEOMETRY_WINDOW_IDS) {
		const { x, y, w, h } = GEOMETRY_DEFAULTS[id]

		fields.push(
			{ id: `w${id}_x`, type: 'number', label: `Window ${id} - X`, default: x, min: 0, max: 3840 },
			{ id: `w${id}_y`, type: 'number', label: `Window ${id} - Y`, default: y, min: 0, max: 2160 },
			{ id: `w${id}_w`, type: 'number', label: `Window ${id} - Width`, default: w, min: 960, max: 3840 },
			{ id: `w${id}_h`, type: 'number', label: `Window ${id} - Height`, default: h, min: 540, max: 2160 },
			{
				id: `w${id}_aspect`,
				type: 'dropdown',
				label: `Window ${id} - Aspect Ratio`,
				default: 1,
				choices: ASPECT_CHOICES,
			},
			{ id: `w${id}_fit`, type: 'dropdown', label: `Window ${id} - Fit to Window`, default: 0, choices: FIT_CHOICES },
			{ id: `w${id}_show`, type: 'dropdown', label: `Window ${id} - Visibility`, default: 1, choices: SHOW_CHOICES },
		)
	}

	return fields
}

/** Reads a `GetWindowGeometryOptions()` option bag back into the four-window array the adapter takes. */
export function collectWindowGeometry(options: WindowGeometryOptions): WindowGeometry[] {
	return GEOMETRY_WINDOW_IDS.map((id) => ({
		x: options[`w${id}_x`],
		y: options[`w${id}_y`],
		w: options[`w${id}_w`],
		h: options[`w${id}_h`],
		aspect: options[`w${id}_aspect`],
		fit: options[`w${id}_fit`],
		show: options[`w${id}_show`],
	}))
}
