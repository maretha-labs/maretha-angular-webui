const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);
export function isLoopbackRequest(value) {
	try {
		const url = new URL(value);
		return (
			['http:', 'https:'].includes(url.protocol) &&
			loopback.has(url.hostname) &&
			!url.username &&
			!url.password
		);
	} catch {
		return false;
	}
}

// Install before creating pages: it also covers the first request of a popup.
// Redirect chains bypass subsequent Playwright routing, so reject every redirect.
export async function restrictToLoopback(context) {
	let blockedRedirect = false;
	await context.routeWebSocket('**/*', (socket) => socket.close());
	await context.route('**/*', async (route) => {
		if (!isLoopbackRequest(route.request().url())) return route.abort('blockedbyclient');
		try {
			const response = await route.fetch({ maxRedirects: 0 });
			if (response.status() >= 300 && response.status() < 400 && response.headers()['location']) {
				blockedRedirect = true;
				await response.dispose();
				return route.abort('blockedbyclient');
			}
			await route.fulfill({ response });
			await response.dispose();
		} catch {
			// Never serialize fetch errors: they can contain credential-bearing URLs.
			await route.abort('failed').catch(() => {});
		}
	});
	return () => {
		if (blockedRedirect)
			throw new Error(
				'PRECONDITION NOT MET: redirects are unsupported by this local-only harness. Configure final loopback URLs with no redirects; an explicit redirect adapter is required.',
			);
	};
}

export function isExactDocumentRoute(value, documentId, applicationBase) {
	try {
		const url = new URL(value);
		const base = applicationBase ? new URL(applicationBase) : new URL('/', url);
		if (url.origin !== base.origin) return false;
		const documentPath = `/browse/documents/${encodeURIComponent(documentId)}`;
		return url.hash
			? url.hash.split('?')[0] === `#${documentPath}`
			: url.pathname === `${base.pathname.replace(/\/$/, '')}${documentPath}`;
	} catch {
		return false;
	}
}
