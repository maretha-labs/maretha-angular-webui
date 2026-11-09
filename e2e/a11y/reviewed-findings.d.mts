export interface FindingIdentity {
	ruleId: string;
	reasonId: string;
	path: { dom: string };
}
export interface Finding extends FindingIdentity {
	value: [string, string];
	message?: string;
}
export interface IbmReport {
	results: Finding[];
	summary?: unknown;
	numExecuted: number;
}
export function validateIbmReport(report: unknown): asserts report is IbmReport;
export function findingIdentity(entry: FindingIdentity): string;
export function unreviewedFindings<T extends FindingIdentity>(
	violations: T[],
	reviewed: FindingIdentity[],
): T[];
export function sanitizedFindings(
	findings: FindingIdentity[],
): { ruleId: string; reasonId: string }[];
