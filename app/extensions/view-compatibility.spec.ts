import { Component, ChangeDetectionStrategy } from '@angular/core';
import {
	defineDocumentViewVariants,
	documentViewParameter,
	resolveDocumentViews,
} from './document-view';
import { ExtensionRegistry } from './extension-registry.service';
@Component({ changeDetection: ChangeDetectionStrategy.Eager, template: '' })
class Page {}

describe('Polymer view compatibility', () => {
	it('normalizes overlapping picture and generic bodies with explicit first-match precedence', () => {
		const registry = new ExtensionRegistry();
		registry.register({
			id: 'compatibility',
			contributions: defineDocumentViewVariants({ id: 'view', viewId: 'view', label: 'View' }, [
				{
					id: 'picture',
					component: Page,
					when: ({ document }) => ((document?.['facets'] as string[]) ?? []).includes('Picture'),
				},
				{
					id: 'generic',
					component: Page,
					when: ({ document }) => !((document?.['facets'] as string[]) ?? []).includes('Folderish'),
				},
				{
					id: 'folder',
					component: Page,
					when: ({ document }) => ((document?.['facets'] as string[]) ?? []).includes('Folderish'),
				},
			]),
		});
		for (const [facets, expected] of [
			[['Picture'], 'picture'],
			[[], 'generic'],
			[['Folderish'], 'folder'],
		] as const) {
			const resolved = resolveDocumentViews(registry, { document: { facets }, noEdit: false });
			expect(resolved.views.length).toBe(1);
			expect(resolved.views[0].page.id).toBe(expected);
			expect(resolved.diagnostics).toEqual([]);
		}
	});
	it('does not expose a tab when no variant is eligible', () => {
		const registry = new ExtensionRegistry();
		registry.register({
			id: 'none',
			contributions: defineDocumentViewVariants({ id: 'view', viewId: 'view', label: 'View' }, [
				{ id: 'page', component: Page, when: () => false },
			]),
		});
		expect(resolveDocumentViews(registry, { document: null, noEdit: false })).toEqual({
			views: [],
			diagnostics: [],
		});
	});
	it('fails closed when a variant condition throws', () => {
		const registry = new ExtensionRegistry();
		registry.register({
			id: 'broken',
			contributions: defineDocumentViewVariants({ id: 'view', viewId: 'view', label: 'View' }, [
				{
					id: 'page',
					component: Page,
					when: () => {
						throw new Error('unavailable');
					},
				},
				{ id: 'fallback', component: Page },
			]),
		});
		const resolved = resolveDocumentViews(registry, { document: null, noEdit: false });
		expect(resolved.views).toEqual([]);
		expect(resolved.diagnostics.some((d) => d.code === 'condition-failed')).toBeTrue();
	});
	it('reads legacy p, preferring an explicit view even when empty', () => {
		expect(documentViewParameter(new URLSearchParams('p=history'))).toBe('history');
		expect(documentViewParameter(new URLSearchParams('view=permissions&p=history'))).toBe(
			'permissions',
		);
		expect(documentViewParameter(new URLSearchParams('view=&p=history'))).toBe('');
	});
});
