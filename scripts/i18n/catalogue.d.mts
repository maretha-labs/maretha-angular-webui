export const LOCALES: readonly string[];
export function loadProductionCatalogues(root: string): {
	catalogues: Record<string, Record<string, string>>;
	layers: Record<string, { legacy: Record<string, string>; sdk: Record<string, string> }>;
	errors: string[];
};
export function pseudoMessage(message: string): string;
export function validateCatalogues(catalogues: Record<string, Record<string, string>>): string[];
export function flattenCatalogue(value: unknown): Record<string, string>;
