import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { defineContribution } from './contribution';
import { ExtensionRegistry } from './extension-registry.service';
import { POLYMER_SLOTS } from './slots';
import { USER_MENU_SLOT, UserMenuContext } from './user-menu';

@Component({
	standalone: true,
	changeDetection: ChangeDetectionStrategy.Eager,
	template: '{{context().user?.displayName}}',
})
class TestUserMenuItem {
	readonly context = input.required<UserMenuContext>();
}

describe('USER_MENU context contract', () => {
	function context(): UserMenuContext {
		return {
			user: {
				id: 'reader',
				displayName: 'Document reader',
				isAdministrator: false,
				groups: ['members'],
			},
			locale: 'en',
			route: '/browse/documents/contract-1',
			document: { uid: 'contract-1', title: 'Master services agreement' },
			languages: [{ key: 'en', label: 'English' }],
			close: jasmine.createSpy('close'),
			openProfile: jasmine.createSpy('openProfile'),
			changeLanguage: jasmine.createSpy('changeLanguage'),
			signOut: jasmine.createSpy('signOut'),
		};
	}

	it('uses the original Polymer slot name and accepts a complete signed-in context', () => {
		expect(USER_MENU_SLOT.name).toBe(POLYMER_SLOTS.USER_MENU);
		expect(USER_MENU_SLOT.isContext(context())).toBeTrue();
	});

	it('accepts a signed-out context with no current document or language choices', () => {
		expect(
			USER_MENU_SLOT.isContext({ ...context(), user: null, document: null, languages: [] }),
		).toBeTrue();
	});

	it('rejects non-object contexts and every missing required field', () => {
		for (const invalid of [null, undefined, [], 'menu', 42]) {
			expect(USER_MENU_SLOT.isContext(invalid)).toBeFalse();
		}
		for (const key of Object.keys(context())) {
			const incomplete: Record<string, unknown> = { ...context() };
			delete incomplete[key];
			expect(USER_MENU_SLOT.isContext(incomplete)).withContext(`Missing ${key}`).toBeFalse();
		}
	});

	it('rejects malformed application users, groups, location fields, and document arrays', () => {
		const valid = context();
		for (const invalidUser of [
			[],
			{},
			{ ...valid.user, id: 1 },
			{ ...valid.user, displayName: null },
			{ ...valid.user, isAdministrator: 'true' },
			{ ...valid.user, groups: 'members' },
			{ ...valid.user, groups: [null] },
			{ ...valid.user, groups: Array(1) },
		]) {
			expect(USER_MENU_SLOT.isContext({ ...valid, user: invalidUser })).toBeFalse();
		}
		for (const invalidFields of [{ locale: null }, { route: 123 }, { document: [] }]) {
			expect(USER_MENU_SLOT.isContext({ ...valid, ...invalidFields })).toBeFalse();
		}
	});

	it('rejects malformed languages and non-callable host actions without invoking callbacks', () => {
		const valid = context();
		for (const languages of [
			null,
			{},
			[null],
			[[]],
			[{ key: 'en' }],
			[{ key: 1, label: 'English' }],
			Array(1),
		]) {
			expect(USER_MENU_SLOT.isContext({ ...valid, languages })).toBeFalse();
		}
		for (const key of ['close', 'openProfile', 'changeLanguage', 'signOut'] as const) {
			for (const invalid of [null, undefined, 'callback', {}]) {
				expect(USER_MENU_SLOT.isContext({ ...valid, [key]: invalid })).toBeFalse();
			}
			expect(valid[key]).not.toHaveBeenCalled();
		}
	});

	it('permits contributions to require a user and rejects malformed context before their condition', () => {
		const registry = new ExtensionRegistry();
		const condition = jasmine
			.createSpy('condition')
			.and.callFake((value: UserMenuContext) => !!value.user);
		registry.register({
			id: 'menu',
			contributions: [
				defineContribution(USER_MENU_SLOT, {
					id: 'menu.profile',
					component: TestUserMenuItem,
					when: condition,
				}),
			],
		});
		expect(registry.resolve(POLYMER_SLOTS.USER_MENU, context()).items.length).toBe(1);
		expect(registry.resolve(POLYMER_SLOTS.USER_MENU, { ...context(), user: null }).items).toEqual(
			[],
		);
		condition.calls.reset();
		const invalid = registry.resolve(POLYMER_SLOTS.USER_MENU, { ...context(), close: null });
		expect(invalid.items).toEqual([]);
		expect(invalid.diagnostics[0].code).toBe('invalid-context');
		expect(condition).not.toHaveBeenCalled();
	});
});
