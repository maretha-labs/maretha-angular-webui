/** Stock Note text formats, inferred before the properties step is opened. */
export function noteImportFormat(file: File): string {
	if (/markdown|\.md$/i.test(file.type + file.name)) return 'text/x-web-markdown';
	if (/xml/i.test(file.type) || /\.xml$/i.test(file.name)) return 'text/xml';
	if (file.type === 'text/html' || /\.html?$/i.test(file.name)) return 'text/html';
	return 'text/plain';
}
