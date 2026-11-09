/**
 * Reorders listed rows to follow the sibling order the documents manager holds after a
 * Move Up/Down, when every row is accounted for. Returns the same array when nothing moved
 * or when the manager list does not cover the rows (a partial or filtered listing).
 */
export function reorderRowsBySiblings<T extends { uid: string }>(
	rows: readonly T[],
	siblings: readonly { uid: string }[],
): readonly T[] {
	if (!rows.length || !siblings.length) return rows;
	const position = new Map(siblings.map((document, index) => [document.uid, index]));
	if (!rows.every((row) => position.has(row.uid))) return rows;
	const reordered = [...rows].sort(
		(left, right) => position.get(left.uid)! - position.get(right.uid)!,
	);
	return reordered.some((row, index) => row !== rows[index]) ? reordered : rows;
}
