import { inject, Pipe, PipeTransform } from '@angular/core';
import { Router, UrlTree } from '@angular/router';

export interface DocumentLocation {
	readonly uid?: unknown;
	readonly path?: unknown;
	readonly repository?: unknown;
	readonly isVersion?: unknown;
}
export interface DocumentRoute {
	readonly kind: 'path' | 'uid';
	readonly value: string;
	readonly repository: string;
	readonly collection: boolean;
}

export function encodeDocumentPath(path: string): string {
	return path
		.split('/')
		.map((part) =>
			encodeURIComponent(part).replace(
				/[!'()*]/g,
				(character) => '%' + character.charCodeAt(0).toString(16).toUpperCase(),
			),
		)
		.join('/');
}

export function documentUrl(document: DocumentLocation | string | null | undefined): string {
	if (!document) return '/browse';
	const doc = typeof document === 'string' ? { uid: document } : document;
	const repository = typeof doc.repository === 'string' ? doc.repository : 'default';
	let url: string;
	if (typeof doc.path === 'string' && doc.path.startsWith('/') && doc.isVersion !== true) {
		const path = doc.path === '/' ? '' : doc.path.replace(/\/$/, '');
		// These names are reserved by the backwards-compatible UID routes.
		const prefix = /^\/(documents|collections|path)(\/|$)/.test(path) ? '/browse/path' : '/browse';
		url = prefix + encodeDocumentPath(path);
	} else {
		url = doc.uid ? '/browse/documents/' + encodeURIComponent(String(doc.uid)) : '/browse';
	}
	return repository && repository !== 'default'
		? `${url}?repository=${encodeURIComponent(repository)}`
		: url;
}

export function parseDocumentRoute(url: string): DocumentRoute | null {
	const [pathname] = url.split(/[?#]/, 1);
	if (pathname !== '/browse' && !pathname.startsWith('/browse/')) return null;
	try {
		const parts = pathname
			.slice('/browse'.length)
			.split('/')
			.filter(Boolean)
			.map(decodeURIComponent);
		if (parts.some((part) => part.includes('/') || part === '.' || part === '..')) return null;
		const query = new URLSearchParams(url.split('?')[1]?.split('#')[0] ?? '');
		const repository = query.get('repository') || 'default';
		if (parts[0] === 'path') {
			return { kind: 'path', value: '/' + parts.slice(1).join('/'), repository, collection: false };
		}
		if (parts.length === 2 && ['documents', 'collections'].includes(parts[0])) {
			return { kind: 'uid', value: parts[1], repository, collection: parts[0] === 'collections' };
		}
		if (parts.length === 1 && ['documents', 'collections'].includes(parts[0])) parts.length = 0;
		return { kind: 'path', value: '/' + parts.join('/'), repository, collection: false };
	} catch {
		return null;
	}
}

export function documentRouteActive(url: string): boolean {
	return parseDocumentRoute(url) !== null;
}

export function documentRouteMatches(
	url: string,
	document: DocumentLocation | null | undefined,
): boolean {
	if (!document) return false;
	const route = parseDocumentRoute(url);
	if (!route || route.repository !== (document.repository || 'default')) return false;
	return route.kind === 'uid' ? route.value === document.uid : route.value === document.path;
}

/** Query-only view changes keep the mounted document; switching repositories does not. */
export function documentNavigationKey(url: string): string {
	const path = url.split(/[?#]/, 1)[0];
	const route = parseDocumentRoute(url);
	return route && route.repository !== 'default'
		? `${path}?repository=${encodeURIComponent(route.repository)}`
		: path;
}

@Pipe({ name: 'documentLink', standalone: true })
export class DocumentLinkPipe implements PipeTransform {
	private readonly router = inject(Router);
	transform(document: DocumentLocation | string | null | undefined): UrlTree {
		// RouterLink command strings encode '%' again; a parsed UrlTree preserves each segment.
		return this.router.parseUrl(documentUrl(document));
	}
}
