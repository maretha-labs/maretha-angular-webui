export interface VisibleText {
	selector: string;
	attribute: string;
	text: string;
}
export interface TextException {
	selector: string;
	attribute: string;
	text: string;
	maximum: number;
}
export function untranslatedRemainder(text: string, fragments?: string[]): string;
export function reviewPseudo(
	records: VisibleText[],
	exceptions: TextException[],
): (VisibleText & { reason: string; remainder?: string })[];
