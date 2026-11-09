import { contributorLabel, metadataLabel } from './repository-search-columns';

describe('Search metadata labels', () => {
	it('preserves directory labels and person display names with their distinct precedence', () => {
		const entry = {
			id: 'entry-id',
			label: 'Entry label',
			displayName: 'Person display name',
			properties: { label: 'Directory label', firstName: 'Ada', lastName: 'Lovelace' },
		};
		expect(metadataLabel(entry)).toBe('Directory label');
		expect(metadataLabel(entry, 'mixed')).toBe('Directory label');
		expect(contributorLabel(entry)).toBe('Person display name');
	});

	it('retains each existing fallback for names and identifiers', () => {
		const entry = {
			id: 'entry-id',
			properties: { id: 'properties-id', firstName: 'Ada', lastName: 'Lovelace' },
		};
		expect(metadataLabel(entry)).toBe('entry-id');
		expect(metadataLabel(entry, 'mixed')).toBe('Ada Lovelace');
		expect(contributorLabel(entry)).toBe('Ada Lovelace');
		expect(contributorLabel({ properties: { id: 'properties-id' } })).toBe('properties-id');
		expect(metadataLabel({ properties: { displayName: 'Nested name' } }, 'mixed')).toBe('');
		expect(contributorLabel({ properties: { displayName: 'Nested name' } })).toBe('Nested name');
	});

	it('joins multi-valued metadata and keeps contributor strings literal', () => {
		expect(metadataLabel([{ label: 'First' }, null, { id: 'second' }])).toBe('First, second');
		expect(metadataLabel([{ firstName: 'Ada' }, { displayName: 'Grace' }], 'mixed')).toBe(
			'Ada, Grace',
		);
		expect(metadataLabel(123)).toBe('123');
		expect(contributorLabel(123)).toBe('');
		expect(contributorLabel('Customer {name}')).toBe('Customer {name}');
	});
});
