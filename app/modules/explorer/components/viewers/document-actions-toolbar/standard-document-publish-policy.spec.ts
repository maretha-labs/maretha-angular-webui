import {
	canPublishStandardDocument,
	usesStandardPublishAction,
} from './standard-document-publish-policy';

describe('Scoped standard document publishing', () => {
	const context = {
		noEdit: false,
		standardHeaderActions: true,
		document: {
			uid: 'note',
			type: 'Note',
			facets: ['Publishable'],
			contextParameters: { permissions: ['WriteVersion'] },
		},
	};
	it('permits a version with source publish permissions while keeping a read-only live document disabled', () => {
		expect(canPublishStandardDocument(context)).toBeTrue();
		expect(canPublishStandardDocument({ ...context, noEdit: true })).toBeFalse();
		expect(
			canPublishStandardDocument({
				...context,
				noEdit: true,
				document: { ...context.document, isVersion: true },
			}),
		).toBeTrue();
	});
	it('opts every typed document in, custom types included, unless the header is unopted', () => {
		for (const type of ['File', 'Picture', 'Contract']) {
			expect(
				usesStandardPublishAction({ ...context, document: { ...context.document, type } }),
			).toBeTrue();
		}
		expect(
			usesStandardPublishAction({ ...context, document: { ...context.document, type: '' } }),
		).toBeFalse();
		expect(usesStandardPublishAction({ ...context, standardHeaderActions: false })).toBeFalse();
	});
	it('requires the source publish facet and permission and excludes proxies, trash and records', () => {
		for (const state of ['isProxy', 'isTrashed', 'isRecord']) {
			expect(
				canPublishStandardDocument({
					...context,
					document: { ...context.document, [state]: true },
				}),
			).toBeFalse();
		}
		expect(
			canPublishStandardDocument({ ...context, document: { ...context.document, facets: [] } }),
		).toBeFalse();
		expect(
			canPublishStandardDocument({
				...context,
				document: { ...context.document, contextParameters: { permissions: [] } },
			}),
		).toBeFalse();
	});
});
