export function nativeRouteUrl(applicationBase: string, route: string): string;
export function isExactNativeRoute(value: string, route: string, applicationBase: string): boolean;

export interface NativeDocumentIdentity {
	readonly uid: string;
	readonly repository: 'default';
	readonly path: string;
}
export function nativeDocumentIdentity(
	metadata: unknown,
	documentId: string,
): NativeDocumentIdentity;
export function nativeDocumentRouteUrl(
	applicationBase: string,
	document: NativeDocumentIdentity,
): string;
export function isExactNativeDocumentRoute(
	value: string,
	document: NativeDocumentIdentity,
	applicationBase: string,
): boolean;
export function readNativeDocumentIdentity(
	request: Pick<import('@playwright/test').APIRequestContext, 'get'>,
	apiBase: string,
	documentId: string,
): Promise<NativeDocumentIdentity>;
