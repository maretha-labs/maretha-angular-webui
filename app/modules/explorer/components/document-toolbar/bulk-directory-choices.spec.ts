import { loadBulkDirectoryChoices } from './bulk-directory-choices';

describe('default bulk directory choices', () => {
	it('uses the Nuxeo hierarchical value while presenting localized and absolute labels', async () => {
		const gateway = {
			bulkDirectoryChoices: async (directoryName: string) =>
				directoryName === 'nature'
					? [{ id: 'article', label: 'label.directories.nature.article' }]
					: directoryName === 'l10nsubjects'
						? [{ id: 'art/architecture', label: 'Art / Architecture' }]
						: [{ id: 'europe', label: 'Europe' }],
		};
		const choices = await loadBulkDirectoryChoices(gateway as any, {
			text: (key: string | undefined, fallback: string) =>
				key === 'label.directories.nature.article' ? 'Article' : fallback,
		});
		expect(choices).toEqual({
			'dc:nature': [{ id: 'article', label: 'Article' }],
			'dc:subjects': [{ id: 'art/architecture', label: 'Art / Architecture' }],
			'dc:coverage': [{ id: 'europe', label: 'Europe' }],
		});
	});
});
