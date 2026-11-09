export function sha256(buffer: Uint8Array | string): string;
export function comparePixels(
	reference: Uint8Array,
	candidate: Uint8Array,
): {
	matched: boolean;
	reason: string | null;
	changedPixels: number | null;
	pixelCount?: number;
	diff: Buffer | null;
};
