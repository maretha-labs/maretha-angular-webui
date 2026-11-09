import { BulkValidationError } from './bulk-layout';
import { buildBulkDocumentChanges } from './bulk-layout';
describe('buildBulkDocumentChanges', () => {
	it('preserves English Error messages while exposing stable validation identity', () => {
		const parameters = { property: 'customer:{literal}' };
		const error = new BulkValidationError('clear-required', parameters);
		expect(error).toEqual(jasmine.any(Error));
		expect(error.message).toBe('Cannot clear required property: customer:{literal}');
		expect(error.code).toBe('clear-required');
		expect(error.messageKey).toBe('sdk.bulk.validation.clear-required');
		parameters.property = 'changed';
		expect(error.parameters['property']).toBe('customer:{literal}');
		expect(Object.isFrozen(error.parameters)).toBeTrue();
	});
	it('applies immutable scalar and list modes', () => {
		const docs = [
			{ uid: 'one', changeToken: 'a', properties: { title: 'old', tags: ['a'], nested: { x: 1 } } },
		];
		const result = buildBulkDocumentChanges(docs, [
			{ property: 'title', mode: 'replace', value: 'new' },
			{ property: 'tags', mode: 'addValues', value: ['a', 'b'] },
			{ property: 'nested', mode: 'keep' },
		]);
		expect(result[0].properties).toEqual({ title: 'new', tags: ['a', 'b'] });
		expect(docs[0].properties).toEqual({ title: 'old', tags: ['a'], nested: { x: 1 } });
	});
	it('removes values and rejects scalar add mode', () => {
		expect(
			buildBulkDocumentChanges(
				[{ uid: 'one', properties: { tags: ['a'] } }],
				[{ property: 'tags', mode: 'remove' }],
			)[0].properties['tags'],
		).toEqual([]);
		expect(() =>
			buildBulkDocumentChanges(
				[{ uid: 'one', properties: { title: 'old' } }],
				[{ property: 'title', mode: 'addValues', value: ['x'] }],
			),
		).toThrow();
	});
	it('deeply clones and deduplicates complex list values', () => {
		const source = [{ uid: 'one', properties: { values: [{ id: 'a' }] } }];
		const output = buildBulkDocumentChanges(source, [
			{ property: 'values', mode: 'addValues', value: [{ id: 'a' }, { id: 'b' }] },
		]);
		expect(output[0].properties['values']).toEqual([{ id: 'a' }, { id: 'b' }]);
		(output[0].properties['values'] as any[])[0].id = 'changed';
		expect(source[0].properties.values[0].id).toBe('a');
		expect(() =>
			buildBulkDocumentChanges(source, [{ property: 'values', mode: 'remove', required: true }]),
		).toThrow();
	});
});
