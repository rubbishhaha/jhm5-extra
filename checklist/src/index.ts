/**
 * Welcome to Cloudflare Workers!
 *
 * This is a template for a Scheduled Worker: a Worker that can run on a
 * configurable interval:
 * https://developers.cloudflare.com/workers/platform/triggers/cron-triggers/
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Run `curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"` to see your Worker in action
 * - Run `npm run deploy` to publish your Worker
 *
 * Bind resources to your Worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

type Env = {
	ASSETS: { fetch: (req: Request) => Promise<Response> } | unknown;
	checklist: KVNamespace;
};

const USER_ID = '6780307b-d3df-4175-8506-03c506a9f47e';

function yearsKey(subject: string, year: string) {
	return `checklist:${USER_ID}:${subject}:${year}`;
}

async function handleGet(req: Request, env: Env) {
	const url = new URL(req.url);
	const subject = url.searchParams.get('subject') || 'Chinese';
	const years: Record<string, boolean> = {};
	for (let y = 2012; y <= 2026; y++) {
		const key = yearsKey(subject, String(y));
		const v = await env.checklist.get(key);
		years[String(y)] = !!v;
	}
	return new Response(JSON.stringify({ years }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleSet(req: Request, env: Env) {
	try {
		const body: any = await req.json();
		const { subject, year, done } = body;
		const key = yearsKey(subject, String(year));
		if (done) {
			await env.checklist.put(key, '1');
		} else {
			await env.checklist.delete(key);
		}
		// update a summary counter per user
		const summaryKey = `summary:${USER_ID}:${subject}`;
		// recompute count (simple approach)
		let count = 0;
		for (let y = 2012; y <= 2026; y++) {
			const k = yearsKey(subject, String(y));
			const v = await env.checklist.get(k);
			if (v) count++;
		}
		await env.checklist.put(summaryKey, String(count));
		return new Response(JSON.stringify({ ok: true, count }), { headers: { 'Content-Type': 'application/json' } });
	} catch (err) {
		return new Response('bad request', { status: 400 });
	}
}

async function handleClear(req: Request, env: Env) {
	try {
		const body: any = await req.json();
		const subject = body.subject || 'Chinese';
		for (let y = 2012; y <= 2026; y++) {
			const k = yearsKey(subject, String(y));
			await env.checklist.delete(k);
		}
		const summaryKey = `summary:${USER_ID}:${subject}`;
		await env.checklist.put(summaryKey, '0');
		return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
	} catch (err) {
		return new Response('bad request', { status: 400 });
	}
}

export default {
	async fetch(req: Request, env: Env) {
		const url = new URL(req.url);
		if (url.pathname.startsWith('/api/get')) {
			return handleGet(req, env);
		}
		if (url.pathname.startsWith('/api/set')) {
			if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
			return handleSet(req, env);
		}
		if (url.pathname.startsWith('/api/clear')) {
			if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
			return handleClear(req, env);
		}
		// serve static assets
			// If ASSETS binding supports fetch, use it. Otherwise fallback to 404.
			if (env.ASSETS && typeof (env.ASSETS as any).fetch === 'function') {
				return (env.ASSETS as any).fetch(req);
			}
			return new Response('not found', { status: 404 });
	},
} as ExportedHandler<Env>;
