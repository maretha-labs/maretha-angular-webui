import { Component } from '@angular/core';
import { defineContribution, defineSlot, WebUiExtension } from './contribution';
import { ExtensionRegistry } from './extension-registry.service';
import { DOCUMENT_ACTIONS_SLOT, POLYMER_SLOTS } from './slots';

@Component({ template: '', standalone: true })
class FirstAction {}
@Component({ template: '', standalone: true })
class ReplacementAction {}

describe('ExtensionRegistry', () => {
	let registry: ExtensionRegistry;
	const context = { document: { uid: 'contract-1' }, noEdit: false };
	const action = (id: string, order = 0, priority = 0) =>
		defineContribution(DOCUMENT_ACTIONS_SLOT, { id, component: FirstAction, order, priority });
	const resolve = () => registry.resolve(POLYMER_SLOTS.DOCUMENT_ACTIONS, context);
	beforeEach(() => {
		registry = new ExtensionRegistry();
	});

	it('retains all 24 baseline slot names while allowing client-defined slots', () => {
		expect(Object.keys(POLYMER_SLOTS).length).toBe(24);
		const custom = defineSlot(
			'CLIENT_HEADER',
			(value): value is string => typeof value === 'string',
		);
		registry.register({
			id: 'client.header',
			contributions: [defineContribution(custom, { id: 'client.title', component: FirstAction })],
		});
		expect(registry.resolve('CLIENT_HEADER', 'Title').items.length).toBe(1);
	});

	it('sorts by order and uses registration order for ties', () => {
		registry.register({
			id: 'defaults',
			contributions: [action('first', 20), action('second', 10), action('third', 20)],
		});
		expect(resolve().items.map((item) => item.id)).toEqual(['second', 'first', 'third']);
	});

	it('uses slot plus id as identity', () => {
		const other = defineSlot('CLIENT_HEADER', (value): value is unknown => !!value);
		registry.register({
			id: 'defaults',
			contributions: [
				action('shared'),
				defineContribution(other, { id: 'shared', component: FirstAction }),
			],
		});
		expect(registry.snapshot().contributions.length).toBe(2);
	});

	it('lets a later equal-priority layer replace a default and restores it on removal', () => {
		registry.register({ id: 'defaults', contributions: [action('info')] });
		const dispose = registry.register({
			id: 'client',
			contributions: [
				defineContribution(DOCUMENT_ACTIONS_SLOT, { id: 'info', component: ReplacementAction }),
			],
		});
		expect(resolve().items[0].component).toBe(ReplacementAction);
		dispose();
		expect(resolve().items[0].component).toBe(FirstAction);
	});

	it('does not replace a higher-priority contribution with a lower-priority layer', () => {
		registry.register({ id: 'defaults', contributions: [action('info', 0, 20)] });
		registry.register({
			id: 'client',
			contributions: [
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: 'info',
					component: ReplacementAction,
					priority: 10,
				}),
			],
		});
		expect(resolve().items[0].component).toBe(FirstAction);
	});

	it('applies reversible disable and ordering overrides without replacing component code', () => {
		registry.register({
			id: 'defaults',
			contributions: [action('info', 10), action('download', 20)],
		});
		const dispose = registry.register({
			id: 'client',
			overrides: [
				{ slot: POLYMER_SLOTS.DOCUMENT_ACTIONS, id: 'info', disabled: true },
				{ slot: POLYMER_SLOTS.DOCUMENT_ACTIONS, id: 'download', order: 0 },
			],
		});
		expect(resolve().items.map((item) => item.id)).toEqual(['download']);
		expect(
			registry.snapshot().contributions.find((item) => item.id === 'info')?.disabled,
		).toBeTrue();
		dispose();
		expect(resolve().items.map((item) => item.id)).toEqual(['info', 'download']);
	});

	it('preserves the valid snapshot after a rejected update', () => {
		registry.register({ id: 'defaults', contributions: [action('info')] });
		const before = registry.snapshot();
		expect(() =>
			registry.register({ id: 'defaults', contributions: [action('info'), action('info')] }),
		).toThrowError(/Duplicate/);
		expect(registry.snapshot()).toBe(before);
		expect(() =>
			registry.register({
				id: 'client',
				overrides: [{ slot: 'DOCUMENT_ACTIONS', id: 'missing', disabled: true }],
			}),
		).toThrowError(/Unknown override/);
		expect(registry.snapshot()).toBe(before);
	});

	it('does not let a stale disposer unregister an updated extension', () => {
		const oldDispose = registry.register({ id: 'client', contributions: [action('old')] });
		const dispose = registry.register({ id: 'client', contributions: [action('new')] });
		oldDispose();
		expect(resolve().items[0].id).toBe('new');
		dispose();
		dispose();
		expect(resolve().items).toEqual([]);
	});

	it('fails closed for malformed contexts or throwing conditions without hiding healthy neighbors', () => {
		registry.register({
			id: 'defaults',
			contributions: [
				action('healthy'),
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: 'broken',
					component: FirstAction,
					when: () => {
						throw new Error('private data');
					},
				}),
			],
		});
		expect(resolve().items.map((item) => item.id)).toEqual(['healthy']);
		expect(resolve().diagnostics[0].code).toBe('condition-failed');
		expect(JSON.stringify(resolve().diagnostics)).not.toContain('private data');
		expect(registry.resolve('DOCUMENT_ACTIONS', {}).items).toEqual([]);
		expect(registry.resolve('DOCUMENT_ACTIONS', {}).diagnostics.length).toBe(2);
	});

	it('treats a false condition as ordinary eligibility, not a diagnostic', () => {
		registry.register({
			id: 'defaults',
			contributions: [
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: 'hidden',
					component: FirstAction,
					when: (value) => !value.noEdit,
				}),
			],
		});
		expect(registry.resolve('DOCUMENT_ACTIONS', { ...context, noEdit: true })).toEqual({
			items: [],
			diagnostics: [],
		});
	});

	it('reports an orphaned override when its base extension is removed', () => {
		const dispose = registry.register({ id: 'defaults', contributions: [action('info')] });
		registry.register({
			id: 'client',
			overrides: [{ slot: 'DOCUMENT_ACTIONS', id: 'info', disabled: true }],
		});
		dispose();
		expect(resolve().items).toEqual([]);
		expect(resolve().diagnostics[0].code).toBe('unknown-target');
		registry.register({ id: 'unrelated', contributions: [action('other')] });
		expect(resolve().items.map((item) => item.id)).toEqual(['other']);
		registry.register({ id: 'defaults', contributions: [action('info')] });
		expect(resolve().diagnostics).toEqual([]);
		expect(
			registry.snapshot().contributions.find((item) => item.id === 'info')?.disabled,
		).toBeTrue();
	});

	it('rejects invalid source, order and reserved input definitions', () => {
		for (const malformed of [
			{ ...action('bad'), order: NaN },
			{ ...action('bad'), component: undefined },
			{ ...action('bad'), loadComponent: () => Promise.resolve(FirstAction) },
			{ ...action('bad'), component: 123, loadComponent: () => Promise.resolve(FirstAction) },
			{ ...action('bad'), inputs: [] },
			{ ...action('bad'), inputs: { context } },
		]) {
			expect(() =>
				registry.register({ id: 'client', contributions: [malformed] } as WebUiExtension),
			).toThrow();
		}
		expect(resolve().items).toEqual([]);
	});

	it('rejects non-boolean flags and duplicate visibility rules', () => {
		const rule = { id: 'client.rule', evaluate: () => true };
		for (const malformed of [
			{ id: 'client', contributions: [{ ...action('bad'), retain: 'yes' }] },
			{ id: 'client', contributions: [{ ...action('bad'), disabled: 'yes' }] },
			{ id: 'client', overrides: [{ slot: 'DOCUMENT_ACTIONS', id: 'bad', disabled: 'yes' }] },
			{ id: 'client', visibilityRules: [rule, rule] },
		]) {
			expect(() => registry.register(malformed as unknown as WebUiExtension)).toThrow();
		}
		expect(registry.visibilityRuleIds()).toEqual([]);
	});

	it('reports whether a visibility rule is registered', () => {
		const dispose = registry.register({
			id: 'client',
			visibilityRules: [{ id: 'client.rule', evaluate: () => true }],
		});
		expect(registry.isVisibilityRuleRegistered('client.rule')).toBeTrue();
		expect(registry.isVisibilityRuleRegistered('client.other')).toBeFalse();
		dispose();
		expect(registry.isVisibilityRuleRegistered('client.rule')).toBeFalse();
	});
});
