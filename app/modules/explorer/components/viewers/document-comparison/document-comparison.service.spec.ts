import { DocumentComparisonService } from '../../../helpers/document-comparison.service';

describe('DocumentComparisonService', () => {
	const service = new DocumentComparisonService();
	it('maps all source default diff kinds from Nuxeo schema metadata and payloads', () => {
		const document = {
			type: 'File',
			properties: {
				'dc:created': '2026-01-01T00:00:00Z',
				'file:content': { name: 'report.pdf', digest: 'abc' },
				'dc:nature': 'article',
				'dc:subjects': ['one'],
				'rel:document': 'target-id',
				'rel:documents': ['target-id'],
				'dc:creator': 'Administrator',
				'dc:contributors': ['Administrator'],
				'note:note': { author: 'Administrator', body: 'changed' },
			},
		};
		const metadata = {
			schemas: [
				{
					'@prefix': 'dc',
					fields: {
						created: 'date',
						nature: { type: 'string', directoryName: 'nature' },
						subjects: { type: 'string[]', directoryName: 'l10nsubjects' },
						creator: 'string',
						contributors: 'string[]',
					},
				},
				{ '@prefix': 'file', fields: { content: 'blob' } },
				{ '@prefix': 'rel', fields: { document: 'document', documents: 'document[]' } },
				{ '@prefix': 'note', fields: { note: 'complex' } },
			],
		};
		const kinds = new Map(
			service.properties([document], metadata).map((property) => [property.name, property.kind]),
		);
		expect(kinds.get('properties.dc:created')).toBe('date');
		expect(kinds.get('properties.file:content')).toBe('blob');
		expect(kinds.get('properties.dc:nature')).toBe('directoryEntry');
		expect(kinds.get('properties.dc:subjects')).toBe('directoryEntry[]');
		expect(kinds.get('properties.rel:document')).toBe('document');
		expect(kinds.get('properties.rel:documents')).toBe('document[]');
		expect(kinds.get('properties.dc:creator')).toBe('user');
		expect(kinds.get('properties.dc:contributors')).toBe('user[]');
		expect(kinds.get('properties.note:note')).toBe('default');
	});

	it('keeps missing, null, empty object and empty list distinct', () => {
		const property = { name: 'properties.dc:title', label: 'Title', kind: 'default' as const };
		const baseline = { properties: { 'dc:title': {} } };
		expect(service.cell({ properties: {} }, property, baseline).missing).toBeTrue();
		expect(
			service.cell({ properties: { 'dc:title': null } }, property, baseline).changed,
		).toBeTrue();
		expect(service.cell({ properties: { 'dc:title': [] } }, property, baseline).changed).toBeTrue();
	});
	it('uses literal property keys containing dots and keeps dc source as a plain value', () => {
		const document = { properties: { 'custom:with.dot': 'literal', 'dc:source': 'external' } };
		const dotted = { name: 'properties.custom:with.dot', label: 'Dot', kind: 'default' as const };
		expect(service.cell(document, dotted).value).toBe('literal');
		expect(
			service.properties([document]).find((item) => item.name === 'properties.dc:source')?.kind,
		).toBe('default');
	});
});
