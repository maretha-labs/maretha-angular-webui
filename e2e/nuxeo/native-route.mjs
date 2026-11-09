/** Installed Angular candidates use PathLocationStrategy, never hash routing. */
export function nativeRouteUrl(applicationBase, route) {
	const base = new URL(applicationBase);
	if (
		!/^https?:$/.test(base.protocol) ||
		base.username ||
		base.password ||
		base.search ||
		base.hash ||
		!/^\/(?:dashboard|browse\/documents\/[A-Za-z0-9_-]+)$/.test(route)
	)
		throw new Error(
			'PRECONDITION NOT MET: installed candidate requires an exact native path route.',
		);
	base.pathname = `${base.pathname.replace(/\/$/, '')}${route}`;
	return base.href;
}

export function isExactNativeRoute(value, route, applicationBase) {
	try {
		return new URL(value).href === nativeRouteUrl(applicationBase, route);
	} catch {
		return false;
	}
}

export function nativeDocumentIdentity(metadata, documentId) {
	const path = metadata?.path;
	if (
		typeof documentId !== 'string' ||
		documentId.trim() !== documentId ||
		!/^[A-Za-z0-9_-]+$/.test(documentId) ||
		!metadata ||
		Array.isArray(metadata) ||
		metadata.uid !== documentId ||
		metadata.repository !== 'default' ||
		metadata.isVersion === true ||
		typeof path !== 'string' ||
		!path.startsWith('/') ||
		!path
			.slice(1)
			.split('/')
			.every((part) => part && part !== '.' && part !== '..') ||
		[...path].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
	)
		throw new Error(
			'PRECONDITION NOT MET: document metadata must identify the exact configured non-version UID, default repository and native path.',
		);
	return Object.freeze({ uid: documentId, repository: 'default', path });
}

export function nativeDocumentRouteUrl(applicationBase, document) {
	nativeRouteUrl(applicationBase, '/dashboard');
	const identity = nativeDocumentIdentity(document, document?.uid);
	const path = identity.path
		.split('/')
		.map((part) =>
			encodeURIComponent(part).replace(
				/[!'()*]/g,
				(character) => '%' + character.charCodeAt(0).toString(16).toUpperCase(),
			),
		)
		.join('/');
	const prefix = /^\/(documents|collections|path)(\/|$)/.test(identity.path)
		? '/browse/path'
		: '/browse';
	const base = new URL(applicationBase);
	base.pathname = base.pathname.replace(/\/$/, '') + prefix + path;
	return base.href;
}

export function isExactNativeDocumentRoute(value, document, applicationBase) {
	try {
		const canonical = nativeDocumentRouteUrl(applicationBase, document);
		return value === canonical || value === canonical + '?view=view';
	} catch {
		return false;
	}
}

export async function readNativeDocumentIdentity(request, apiBase, documentId) {
	try {
		const base = new URL(apiBase);
		if (
			!/^https?:$/.test(base.protocol) ||
			!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) ||
			base.username ||
			base.password ||
			base.search ||
			base.hash ||
			typeof documentId !== 'string' ||
			documentId.trim() !== documentId ||
			!/^[A-Za-z0-9_-]+$/.test(documentId)
		)
			throw new Error('Invalid configured metadata target');
		base.pathname =
			base.pathname.replace(/\/$/, '') +
			'/api/v1/repo/default/id/' +
			encodeURIComponent(documentId);
		const response = await request.get(base.href, {
			maxRedirects: 0,
			timeout: 15_000,
			headers: { Accept: 'application/json' },
		});
		if (response.status() !== 200) throw new Error('Metadata endpoint did not return 200');
		return nativeDocumentIdentity(await response.json(), documentId);
	} catch {
		throw new Error(
			'PRECONDITION NOT MET: the prepared session must read exact configured default-repository document metadata without redirects.',
		);
	}
}
