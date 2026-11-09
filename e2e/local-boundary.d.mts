import type { BrowserContext } from '@playwright/test';
export function isLoopbackRequest(value: string): boolean;
export function restrictToLoopback(context: BrowserContext): Promise<() => void>;
export function isExactDocumentRoute(
	value: string,
	documentId: string,
	applicationBase?: string,
): boolean;
