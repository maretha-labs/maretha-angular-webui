import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideDefaultPages } from 'app/components/application-pages/default-pages';
import { defineContribution, defineSlot, VisibilityRuleDefinition } from './contribution';
import { ExtensionRegistry } from './extension-registry.service';

@Component({ template: '' })
class RuleAction {}

const slot = defineSlot(
	'RULE_ACTIONS',
	(value): value is { allowed: boolean } =>
		!!value &&
		typeof value === 'object' &&
		'allowed' in value &&
		typeof value.allowed === 'boolean',
);
const contribution = (id = 'action', requiredVisibilityRule?: string) =>
	defineContribution(slot, { id, component: RuleAction, order: 10, requiredVisibilityRule });
const patch = { slot: slot.name, id: 'action', visibilityRule: 'client.review' };

describe('Named visibility rules', () => {
	let registry: ExtensionRegistry;
	beforeEach(() => {
		registry = new ExtensionRegistry();
	});

	it('combines named rules with the existing condition without widening visibility', () => {
		registry.register({
			id: 'defaults',
			contributions: [
				defineContribution(slot, {
					id: 'action',
					component: RuleAction,
					when: (context) => context.allowed,
				}),
			],
		});
		registry.register({
			id: 'client',
			visibilityRules: [{ id: 'client.review', evaluate: () => true }],
			overrides: [patch],
		});
		expect(registry.resolve(slot.name, { allowed: false }).items).toEqual([]);
		expect(registry.resolve(slot.name, { allowed: true }).items.length).toBe(1);
		registry.register({
			id: 'client',
			visibilityRules: [{ id: 'client.review', evaluate: () => false }],
			overrides: [patch],
		});
		expect(registry.resolve(slot.name, { allowed: true }).items).toEqual([]);
	});

	it('skips the complete unknown-rule override and warns, preserving default order and visibility', () => {
		registry.register({ id: 'defaults', contributions: [contribution()] });
		registry.register({ id: 'client', overrides: [{ ...patch, disabled: true, order: 0 }] });
		const result = registry.resolve(slot.name, { allowed: true });
		expect(result.items.map((item) => [item.id, item.order])).toEqual([['action', 10]]);
		expect(result.diagnostics[0].code).toBe('unknown-visibility-rule');
		expect(result.diagnostics[0].message).toContain('client.review');
	});

	it('rebuilds rule references as compiled provider layers register and unregister', () => {
		registry.register({ id: 'defaults', contributions: [contribution()] });
		registry.register({ id: 'client', overrides: [{ ...patch, order: 0 }] });
		const dispose = registry.register({
			id: 'rules',
			visibilityRules: [{ id: 'client.review', evaluate: () => true }],
		});
		expect(registry.visibilityRuleIds()).toEqual(['client.review']);
		expect(registry.resolve(slot.name, { allowed: true }).items[0].order).toBe(0);
		dispose();
		expect(registry.isVisibilityRuleRegistered('client.review')).toBeFalse();
		expect(registry.resolve(slot.name, { allowed: true }).items[0].order).toBe(10);
	});

	it('cannot clear a missing required rule through a permissive optional rule or disabled false', () => {
		registry.register({
			id: 'defaults',
			contributions: [contribution('action', 'core.admin'), contribution('neighbor')],
		});
		registry.register({
			id: 'client',
			visibilityRules: [{ id: 'client.review', evaluate: () => true }],
			overrides: [{ ...patch, disabled: false }],
		});
		const result = registry.resolve(slot.name, { allowed: true });
		expect(result.items.map((item) => item.id)).toEqual(['neighbor']);
		expect(result.diagnostics[0].code).toBe('unknown-visibility-rule');
		expect(result.diagnostics[0].message).toContain('core.admin');
	});

	for (const behavior of ['false', 'throws', 'promise'] as const) {
		it(`fails closed when a required rule ${behavior}, without hiding healthy neighbors`, () => {
			const evaluate = (() => {
				if (behavior === 'throws') throw new Error('private detail');
				return behavior === 'promise' ? Promise.resolve(true) : false;
			}) as VisibilityRuleDefinition['evaluate'];
			registry.register({
				id: 'defaults',
				visibilityRules: [{ id: 'core.admin', evaluate }],
				contributions: [contribution('action', 'core.admin'), contribution('neighbor')],
			});
			const result = registry.resolve(slot.name, { allowed: true });
			expect(result.items.map((item) => item.id)).toEqual(['neighbor']);
			expect(JSON.stringify(result.diagnostics)).not.toContain('private detail');
			if (behavior === 'throws') expect(result.diagnostics[0].code).toBe('visibility-rule-failed');
		});
	}

	it('rejects duplicate rule IDs atomically instead of rebinding another extension rule', () => {
		registry.register({
			id: 'owner',
			visibilityRules: [{ id: 'owner.rule', evaluate: () => false }],
		});
		const snapshot = registry.snapshot();
		expect(() =>
			registry.register({
				id: 'other',
				visibilityRules: [{ id: 'owner.rule', evaluate: () => true }],
			}),
		).toThrowError(/Duplicate visibility rule/);
		expect(registry.snapshot()).toBe(snapshot);
	});

	it('validates compiled rule functions and rule references', () => {
		expect(() =>
			registry.register({
				id: 'invalid',
				visibilityRules: [
					{ id: 'client.rule', evaluate: 'expression' } as unknown as VisibilityRuleDefinition,
				],
			}),
		).toThrowError(/evaluate function/);
		expect(() =>
			registry.register({
				id: 'invalid',
				contributions: [contribution('action', 'user.admin === true')],
			}),
		).toThrowError(/identifier/);
	});
});

describe('Default administration visibility rule', () => {
	beforeEach(() => TestBed.configureTestingModule({ providers: [provideDefaultPages()] }));
	it('uses the existing administrator and powerusers predicate on the actual page context', () => {
		const registry = TestBed.inject(ExtensionRegistry);
		const visible = (user: unknown) =>
			registry
				.resolve('PAGES', {
					pageId: 'administration',
					route: '/administration',
					noEdit: false,
					params: {},
					query: {},
					user,
				})
				.items.some((item) => item.id === 'maretha.page.administration');
		expect(visible({ isAdministrator: true })).toBeTrue();
		expect(visible({ groups: ['powerusers'] })).toBeTrue();
		expect(visible({ groups: ['members'] })).toBeFalse();
		expect(visible(null)).toBeFalse();
		const contributions = registry
			.snapshot()
			.contributions.filter((item) => item.extensionId === 'maretha.core.pages');
		registry.register({ id: 'maretha.core.pages', contributions });
		expect(visible({ isAdministrator: true })).toBeFalse();
	});
});
