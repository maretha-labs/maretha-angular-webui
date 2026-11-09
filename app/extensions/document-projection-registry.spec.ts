import { Component, Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DocumentProjectionRegistry } from './document-projection-registry';

@Component({ standalone: true, template: '' })
class PublicContextProjection {
	// eslint-disable-next-line @angular-eslint/no-input-rename -- verifies a public projectionContext alias is accepted.
	@Input('projectionContext') context: unknown;
}
@Component({ standalone: true, template: '' })
class PrivateContextProjection {
	// eslint-disable-next-line @angular-eslint/no-input-rename -- verifies a different public alias is rejected.
	@Input('other') projectionContext: unknown;
}
@Component({ standalone: true, template: '' })
class NoContextProjection {}

describe('DocumentProjectionRegistry', () => {
	it('accepts the public projectionContext alias and isolates context failures', () => {
		TestBed.configureTestingModule({ providers: [DocumentProjectionRegistry] });
		const registry = TestBed.inject(DocumentProjectionRegistry);
		let predicateContext: any;
		registry.register({
			id: 'public',
			name: 'versions.items',
			component: PublicContextProjection,
			when: (context) => ((predicateContext = context), true),
		});
		registry.register({
			id: 'broken',
			name: 'versions.items',
			component: PublicContextProjection,
			priority: 2,
			when: () => {
				throw new Error('predicate');
			},
		});
		const resolved = registry.resolve('versions.items', {
			document: { uid: 'one' },
			noEdit: false,
			value: [{ uid: 'two' }],
		});
		expect(resolved?.component).toBe(PublicContextProjection);
		expect(Object.isFrozen(predicateContext.document)).toBeTrue();
		expect(Object.isFrozen(predicateContext.value)).toBeTrue();
	});

	it('rejects components without the public input and freezes values', () => {
		const registry = TestBed.inject(DocumentProjectionRegistry);
		expect(() =>
			registry.register({
				id: 'private',
				name: 'acl.emptyResult',
				component: PrivateContextProjection,
			}),
		).toThrow();
		expect(() =>
			registry.register({ id: 'none', name: 'acl.emptyResult', component: NoContextProjection }),
		).toThrow();
		const resolved = registry.resolve('acl.emptyResult', {
			document: { uid: 'one' },
			noEdit: false,
			value: [{ uid: 'two' }],
		});
		expect(resolved).toBeUndefined();
	});
});
