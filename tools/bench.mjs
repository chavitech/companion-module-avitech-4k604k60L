/**
 * Command bench - a hardware sanity check for the Sequoia HTTP commands.
 *
 * Avitech ships firmware updates that are not regression tested, so "the reference guide says X"
 * is not evidence that a given unit still accepts X. This serves a local page with one button per
 * command; clicking it fires the request at a real machine and shows the exact URL sent plus the
 * raw, unparsed response text. The point is to prove a command works against hardware *before*
 * anyone tries to debug it through the Companion UI.
 *
 * Fidelity: the requests are built by the module's own adapter classes, imported from `dist/`, not
 * by a hand-written copy that can drift. That works because nothing in the adapter import chain
 * has a runtime dependency on `@companion-module/base` - every import in it is type-only and
 * erased by tsc - so the adapters can be driven here without a Companion runtime. A stub `api`
 * object stands in for AvitechHttpApi and performs the fetch, capturing the URL and raw body.
 *
 * The server-side proxy is not incidental: the device's cgi-bin sends no CORS headers, so a page
 * opened over file:// could fire commands but never read the reply.
 *
 * Usage:
 *   yarn bench --host 192.168.0.5 [--port 80] [--mode <device-mode>] [--listen 8099]
 */

import { createServer } from 'node:http'

/*
 * dist/ is the build output and does not exist until `yarn build` runs, so eslint-plugin-n reads
 * these as unpublished imports. The `bench` script builds first. Importing the compiled adapters
 * rather than re-deriving the request shapes here is the entire point of this tool, so the rule is
 * suppressed rather than worked around.
 */
/* eslint-disable n/no-unpublished-import */
import { createAdapter } from '../dist/adapters/index.js'
import { DEVICE_MODES } from '../dist/models.js'
/* eslint-enable n/no-unpublished-import */

const REQUEST_TIMEOUT_MS = 5000

// --- CLI ------------------------------------------------------------------------------------

/** A bad invocation, reported as a usage message rather than a stack trace. */
class UsageError extends Error {}

function parseArgs(argv) {
	const args = { port: 80, mode: DEVICE_MODES[0], listen: 8099 }

	for (let i = 0; i < argv.length; i += 1) {
		const [flag, inlineValue] = argv[i].split('=')
		const value = inlineValue ?? argv[++i]

		switch (flag) {
			case '--host':
				args.host = value
				break
			case '--port':
				args.port = Number(value)
				break
			case '--mode':
				args.mode = value
				break
			case '--listen':
				args.listen = Number(value)
				break
			default:
				throw new UsageError(`Unknown argument: ${flag}`)
		}
	}

	if (!args.host) throw new UsageError('Missing required --host <device-ip>')
	if (!DEVICE_MODES.includes(args.mode)) {
		throw new UsageError(`Unknown --mode "${args.mode}". Expected one of:\n  ${DEVICE_MODES.join('\n  ')}`)
	}

	return args
}

// --- Adapter wiring -------------------------------------------------------------------------

/** Assigned by `main()` once the arguments have been validated. */
let config
let adapter

/**
 * Every request made while handling one button press. An adapter method can make more than one -
 * `setWindowGeometry` reads the current geometry before it writes - and the whole point of this
 * tool is to show what actually went over the wire, so all of them are reported.
 */
let requestLog = []

/**
 * Stands in for AvitechHttpApi, and must stay behaviourally identical to it: adapter methods that
 * consume another command's return value (again, `setWindowGeometry`) only work if this parses
 * responses the way the real client does. Mirrors `AvitechHttpApi.buildUrl()` and `parseResponse()`.
 *
 * The raw text is recorded separately regardless, so nothing is hidden by the parsing.
 */
const api = {
	async sendCommand(cmd, param) {
		const portSuffix = config.port && config.port !== 80 ? `:${config.port}` : ''
		const url = `http://${config.host}${portSuffix}/cgi-bin/command.cgi?cmd=${encodeURIComponent(
			cmd,
		)}&param=${encodeURIComponent(JSON.stringify(param))}`

		const entry = { url, cmd, param }
		requestLog.push(entry)

		const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
		const raw = await response.text()

		entry.httpStatus = response.status
		entry.raw = raw

		return parseResponse(raw)
	},
}

/** Kept in step with `AvitechHttpApi.parseResponse()` in src/avitech-api.ts. */
function parseResponse(text) {
	const trimmed = text.trim()

	if (trimmed === 'Wrong format') throw new Error('Device reported: Wrong format')
	if (trimmed === 'Success' || trimmed === '') return trimmed

	let parsed
	try {
		parsed = JSON.parse(trimmed)
	} catch {
		return trimmed
	}

	// The undocumented rejection envelope newer firmware uses in place of "Wrong format".
	if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
		const cbStatus = parsed.cb_status
		if (typeof cbStatus === 'string' && !/^(ok|success)$/i.test(cbStatus)) {
			throw new Error(`Device reported: ${cbStatus}`)
		}
	}

	return parsed
}

/** Minimal stand-in for ModuleInstance - the adapters only ever reach the device via the api. */
const moduleInstance = {
	get config() {
		return config
	},
	log: (level, message) => console.log(`  [${level}] ${message}`),
	updateStatus: () => {},
}

// --- Command catalogue ----------------------------------------------------------------------

const WINDOW_CHOICES = [1, 2, 3, 4].map((id) => ({ value: id, label: `Window ${id}` }))
const ASPECT_CHOICES = [
	{ value: 0, label: 'Fill up window' },
	{ value: 1, label: 'Auto-detect' },
	{ value: 2, label: '16:9' },
	{ value: 3, label: '4:3' },
	{ value: 4, label: '16:10' },
	{ value: 5, label: '5:4' },
]
const SHOW_CHOICES = [
	{ value: 0, label: 'Hide' },
	{ value: 1, label: 'Show' },
]
const FIT_CHOICES = [
	{ value: 0, label: 'Disabled' },
	{ value: 1, label: 'Enabled' },
]
const RESOLUTION_CHOICES = ['4096x2160', '3840x2400', '3840x2160', '1920x1200', '1920x1080', '1280x1024'].map((id) => ({
	value: id,
	label: id.replace('x', ' x '),
}))

const GEOMETRY_DEFAULTS = [
	{ x: 0, y: 0, w: 1920, h: 1080 },
	{ x: 1920, y: 0, w: 1920, h: 1080 },
	{ x: 0, y: 1080, w: 1920, h: 1080 },
	{ x: 1920, y: 1080, w: 1920, h: 1080 },
]

/**
 * Declarative so that extending the bench to section 1.3.1 (or to the already-implemented 1.3.3 -
 * 1.3.5 commands) is a data change rather than a rewrite. `run` receives the form values keyed by
 * field id and calls straight through to the adapter.
 */
const COMMANDS = [
	{
		id: 'get_window_geometry',
		section: '1.3.2.1',
		name: 'Window Position and Size — Get',
		note: 'The guide only shows this response as a screenshot. Whatever comes back here is the source of truth.',
		fields: [],
		run: () => adapter.getWindowGeometry(),
	},
	{
		id: 'set_window_geometry',
		section: '1.3.2.2',
		name: 'Window Position and Size — Set',
		note: 'Writes all four windows at once. Run the Get above first and mirror its values if you want a no-op round trip.',
		fields: [
			{
				id: 'resolution',
				label: 'Output Resolution',
				type: 'select',
				choices: RESOLUTION_CHOICES,
				default: '3840x2160',
			},
			...GEOMETRY_DEFAULTS.flatMap((defaults, index) => {
				const id = index + 1
				return [
					{ id: `w${id}_x`, label: `W${id} X`, type: 'number', default: defaults.x },
					{ id: `w${id}_y`, label: `W${id} Y`, type: 'number', default: defaults.y },
					{ id: `w${id}_w`, label: `W${id} Width`, type: 'number', default: defaults.w },
					{ id: `w${id}_h`, label: `W${id} Height`, type: 'number', default: defaults.h },
					{ id: `w${id}_aspect`, label: `W${id} Aspect`, type: 'select', choices: ASPECT_CHOICES, default: 1 },
					{ id: `w${id}_fit`, label: `W${id} Fit`, type: 'select', choices: FIT_CHOICES, default: 0 },
					{ id: `w${id}_show`, label: `W${id} Show`, type: 'select', choices: SHOW_CHOICES, default: 1 },
				]
			}),
		],
		run: (values) => {
			const windows = [1, 2, 3, 4].map((id) => ({
				x: values[`w${id}_x`],
				y: values[`w${id}_y`],
				w: values[`w${id}_w`],
				h: values[`w${id}_h`],
				aspect: values[`w${id}_aspect`],
				fit: values[`w${id}_fit`],
				show: values[`w${id}_show`],
			}))
			const [width, height] = String(values.resolution).split('x').map(Number)

			return adapter.setWindowGeometry(windows, [width, height])
		},
	},
	{
		id: 'get_window_labels',
		section: '1.3.2.3',
		name: 'Window Label Text — Get',
		note: 'Also a screenshot-only response in the guide.',
		fields: [],
		run: () => adapter.getWindowLabels(),
	},
	{
		id: 'set_window_label',
		section: '1.3.2.4',
		name: 'Window Label Text — Set',
		note: 'Excluded characters: < > ! @ # $ % ^ & * " \' ` / \\ , . : ; ? =',
		warnInDaisyChain:
			'Do not run this against a daisy-chained unit. It returns Success, does not set the label, and leaves the unit unable to edit labels from its own GUI afterwards.',
		fields: [
			{ id: 'port', label: 'Input Port', type: 'select', choices: WINDOW_CHOICES, default: 1 },
			{ id: 'label', label: 'Label', type: 'text', default: 'Bench Test' },
		],
		run: (values) => adapter.setWindowLabel(values.port, values.label),
	},
	{
		id: 'set_window_show',
		section: '1.3.2.5',
		name: 'Window Show/Hide — Set',
		fields: [
			{ id: 'winid', label: 'Window', type: 'select', choices: WINDOW_CHOICES, default: 1 },
			{ id: 'show', label: 'Visibility', type: 'select', choices: SHOW_CHOICES, default: 1 },
		],
		run: (values) => adapter.setWindowShow(values.winid, values.show),
	},
	{
		id: 'set_window_aspect',
		section: '1.3.2.6',
		name: 'Window Aspect Ratio — Set',
		fields: [
			{ id: 'winid', label: 'Window', type: 'select', choices: WINDOW_CHOICES, default: 1 },
			{ id: 'aspect', label: 'Aspect Ratio', type: 'select', choices: ASPECT_CHOICES, default: 1 },
		],
		run: (values) => adapter.setWindowAspect(values.winid, values.aspect),
	},
	{
		id: 'set_fullscreen',
		section: '1.3.2.7',
		name: 'Fullscreen Mode — Set',
		fields: [
			{
				id: 'full',
				label: 'Target',
				type: 'select',
				choices: [{ value: 0, label: 'Multiview (exit fullscreen)' }, ...WINDOW_CHOICES],
				default: 0,
			},
		],
		run: (values) => adapter.setFullscreen(values.full),
	},
]

// --- HTTP server ----------------------------------------------------------------------------

function readBody(request) {
	return new Promise((resolve, reject) => {
		let body = ''
		request.on('data', (chunk) => (body += chunk))
		request.on('end', () => resolve(body))
		request.on('error', reject)
	})
}

async function handleSend(request, response) {
	const { id, values } = JSON.parse(await readBody(request))
	const command = COMMANDS.find((candidate) => candidate.id === id)

	if (!command) {
		response.writeHead(404, { 'content-type': 'application/json' })
		response.end(JSON.stringify({ error: `Unknown command: ${id}` }))
		return
	}

	requestLog = []

	const result = {}
	try {
		await command.run(values)
	} catch (error) {
		result.error = error.message
	}

	result.requests = requestLog

	console.log(`\n  ${command.section}  ${command.name}`)
	for (const entry of requestLog) {
		console.log(`  -> ${entry.url}`)
		if (entry.raw !== undefined) console.log(`  <- ${entry.httpStatus} ${JSON.stringify(entry.raw)}`)
	}
	if (result.error) console.log(`  !! ${result.error}`)

	response.writeHead(200, { 'content-type': 'application/json' })
	response.end(JSON.stringify(result))
}

const server = createServer((request, response) => {
	if (request.method === 'POST' && request.url === '/send') {
		handleSend(request, response).catch((error) => {
			response.writeHead(500, { 'content-type': 'application/json' })
			response.end(JSON.stringify({ error: error.message }))
		})
		return
	}

	if (request.url === '/' || request.url === '/index.html') {
		response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
		response.end(renderPage())
		return
	}

	response.writeHead(404)
	response.end('Not found')
})

function main() {
	config = parseArgs(process.argv.slice(2))
	adapter = createAdapter(config.mode, moduleInstance, api)

	server.listen(config.listen, () => {
		console.log(`\n  Sequoia command bench`)
		console.log(`  device : http://${config.host}${config.port !== 80 ? `:${config.port}` : ''}`)
		console.log(`  mode   : ${config.mode}`)
		console.log(`  bench  : http://localhost:${config.listen}\n`)
	})
}

try {
	main()
} catch (error) {
	if (!(error instanceof UsageError)) throw error

	console.error(`\n  ${error.message}\n`)
	console.error('  Usage: yarn bench --host 192.168.0.5 [--port 80] [--mode <device-mode>] [--listen 8099]\n')
	process.exitCode = 1
}

// --- Page -----------------------------------------------------------------------------------

const escapeHtml = (value) =>
	String(value).replace(
		/[&<>"']/g,
		(char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
	)

function renderField(field) {
	const label = `<label for="${field.id}">${escapeHtml(field.label)}</label>`

	if (field.type === 'select') {
		const options = field.choices
			.map(
				(choice) =>
					`<option value="${escapeHtml(choice.value)}"${choice.value === field.default ? ' selected' : ''}>${escapeHtml(
						choice.label,
					)}</option>`,
			)
			.join('')
		return `<div class="field">${label}<select id="${field.id}" data-field="${field.id}" data-kind="${
			typeof field.default === 'number' ? 'number' : 'text'
		}">${options}</select></div>`
	}

	const inputType = field.type === 'number' ? 'number' : 'text'
	return `<div class="field">${label}<input id="${field.id}" data-field="${field.id}" data-kind="${
		field.type === 'number' ? 'number' : 'text'
	}" type="${inputType}" value="${escapeHtml(field.default)}"></div>`
}

function renderCard(command) {
	const note = command.note ? `<p class="note">${escapeHtml(command.note)}</p>` : ''
	const fields = command.fields.length
		? `<div class="fields">${command.fields.map(renderField).join('')}</div>`
		: '<p class="note">No parameters.</p>'

	// Companion gates section 1.3.2 out of daisy-chain mode; the bench deliberately does not, so
	// that undocumented behaviour can still be probed. A command with a known harmful effect there
	// needs saying out loud instead.
	const isDaisyChain = config.mode === 'sequoia-4k60l-daisy-chain'
	const warning =
		isDaisyChain && command.warnInDaisyChain ? `<p class="warn">${escapeHtml(command.warnInDaisyChain)}</p>` : ''

	return `
<section class="card" data-command="${command.id}">
	<header>
		<span class="tag">${escapeHtml(command.section)}</span>
		<h2>${escapeHtml(command.name)}</h2>
	</header>
	${warning}
	${note}
	${fields}
	<button type="button">Send</button>
	<pre class="result" hidden></pre>
</section>`
}

function renderPage() {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sequoia command bench</title>
<style>
	:root { color-scheme: light dark; --bg:#f6f7f9; --card:#fff; --line:#d8dce2; --ink:#1c2024; --muted:#6b7280; --accent:#2563eb; --ok:#15803d; --bad:#b91c1c; }
	@media (prefers-color-scheme: dark) {
		:root { --bg:#14161a; --card:#1c1f24; --line:#2e333b; --ink:#e6e8ea; --muted:#9aa1ab; --accent:#60a5fa; --ok:#4ade80; --bad:#f87171; }
	}
	* { box-sizing: border-box; }
	body { margin:0; padding:2rem 1.5rem 4rem; background:var(--bg); color:var(--ink);
		font:15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
	main { max-width: 60rem; margin: 0 auto; }
	h1 { font-size:1.35rem; margin:0 0 .35rem; }
	.target { color:var(--muted); font-size:.9rem; margin:0 0 2rem; }
	.target code { background:var(--card); border:1px solid var(--line); border-radius:4px; padding:.1rem .35rem; }
	.card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:1.1rem 1.25rem; margin-bottom:1rem; }
	.card header { display:flex; align-items:baseline; gap:.6rem; }
	.card h2 { font-size:1rem; margin:0; font-weight:600; }
	.tag { font:600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; color:var(--muted);
		border:1px solid var(--line); border-radius:4px; padding:.25rem .4rem; }
	.note { color:var(--muted); font-size:.85rem; margin:.6rem 0 0; }
	.warn { margin:.7rem 0 0; padding:.55rem .7rem; border:1px solid var(--bad); border-left-width:3px;
		border-radius:6px; color:var(--bad); font-size:.85rem; }
	.banner { margin:0 0 1.5rem; padding:.8rem 1rem; border:1px solid var(--bad); border-left-width:3px;
		border-radius:8px; background:var(--card); font-size:.88rem; }
	.banner strong { color:var(--bad); }
	.fields { display:grid; grid-template-columns:repeat(auto-fill, minmax(9.5rem, 1fr)); gap:.6rem; margin:.9rem 0 0; }
	.field { display:flex; flex-direction:column; gap:.25rem; }
	label { font-size:.75rem; color:var(--muted); }
	input, select { padding:.4rem .5rem; border:1px solid var(--line); border-radius:6px;
		background:var(--bg); color:var(--ink); font:inherit; font-size:.85rem; min-width:0; }
	button { margin-top:.9rem; padding:.45rem 1.1rem; border:0; border-radius:6px; background:var(--accent);
		color:#fff; font:inherit; font-weight:600; font-size:.85rem; cursor:pointer; }
	button:disabled { opacity:.55; cursor:progress; }
	.result { margin:.9rem 0 0; padding:.75rem .85rem; background:var(--bg); border:1px solid var(--line);
		border-radius:6px; font:12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
		white-space:pre-wrap; word-break:break-all; overflow-x:auto; }
	.result.ok { border-color:var(--ok); }
	.result.bad { border-color:var(--bad); }
</style>
</head>
<body>
<main>
	<h1>Sequoia command bench</h1>
	<p class="target">
		Section 1.3.2 &mdash; Commands for Controlling Window &middot;
		device <code>${escapeHtml(config.host)}${config.port !== 80 ? `:${config.port}` : ''}</code> &middot;
		mode <code>${escapeHtml(config.mode)}</code>
	</p>
	${
		config.mode === 'sequoia-4k60l-daisy-chain'
			? `<div class="banner"><strong>Daisy-chain mode.</strong> Companion does not expose section 1.3.2
			   on a chained unit; this bench does not gate by mode, so every command below will still fire.
			   Most of them return <code>Success</code> and have no effect &mdash; a false positive the module
			   cannot detect. Treat any result here as unverified unless you confirm it on the hardware.</div>`
			: ''
	}
	${COMMANDS.map(renderCard).join('')}
</main>
<script>
document.querySelectorAll('.card').forEach((card) => {
	const button = card.querySelector('button')
	const result = card.querySelector('.result')

	button.addEventListener('click', async () => {
		const values = {}
		card.querySelectorAll('[data-field]').forEach((el) => {
			values[el.dataset.field] = el.dataset.kind === 'number' ? Number(el.value) : el.value
		})

		button.disabled = true
		result.hidden = false
		result.className = 'result'
		result.textContent = 'Sending...'

		try {
			const response = await fetch('/send', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: card.dataset.command, values }),
			})
			const data = await response.json()

			const lines = []
			for (const entry of data.requests ?? []) {
				if (lines.length) lines.push('')
				lines.push('GET  ' + decodeURIComponent(entry.url), '')
				if (entry.raw !== undefined) lines.push('<-   HTTP ' + entry.httpStatus, JSON.stringify(entry.raw))
			}
			if (data.error) lines.push('', '!!   ' + data.error)
			if (!lines.length) lines.push('(no request was made)')

			result.textContent = lines.join('\\n')
			result.classList.add(data.error ? 'bad' : 'ok')
		} catch (error) {
			result.textContent = '!!   ' + error.message
			result.classList.add('bad')
		} finally {
			button.disabled = false
		}
	})
})
</script>
</body>
</html>`
}
