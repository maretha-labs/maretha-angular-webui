import type { ParityManifest, ParitySettings } from './types';
export function settings(env?: Record<string, string | undefined>): ParitySettings;
export function routeUrl(base: string, route: string | null): string;
export function safeUrl(value: string): string;
export function assetIdentityAllowed(value: string): boolean;
export function identityMatches(record: unknown, expected: unknown): boolean;
export function baselineIssue(
	record: unknown,
	scenario: string,
	target: string,
	expected?: unknown,
): string | undefined;
export function requestAllowed(
	mode: string,
	method: string,
	value: string,
	origins?: readonly string[],
): boolean;
export function validateManifest(value: unknown): ParityManifest;
