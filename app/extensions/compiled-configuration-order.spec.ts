import { Component, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { defineContribution, defineSlot, WebUiExtension } from './contribution';
import { ExtensionRegistry } from './extension-registry.service';
import { provideWebUiExtensions } from './provide-webui-extensions';

@Component({ changeDetection: ChangeDetectionStrategy.Eager, template: '' })
class DefaultAction {}

@Component({ changeDetection: ChangeDetectionStrategy.Eager, template: '' })
class ClientAction {}

const slot = defineSlot(
	'CLIENT_ACTIONS',
	(value): value is { allowed: boolean } =>
		!!value &&
		typeof value === 'object' &&
		'allowed' in value &&
		typeof value.allowed === 'boolean',
);

describe('Compiled client configuration provider order', () => {
	for (const target of ['client.action', 'default.action']) {
		it(`applies authored rule, visibility and order after registering ${target}`, () => {
			const clientExtensions: readonly WebUiExtension[] = [
				{
					id: 'client.actions',
					contributions: [
						defineContribution(slot, {
							id: target,
							component: ClientAction,
							disabled: true,
							order: 40,
						}),
					],
					visibilityRules: [
						{
							id: 'client.allowed',
							evaluate: (context) => slot.isContext(context) && context.allowed,
						},
					],
				},
			];
			TestBed.configureTestingModule({
				providers: [
					provideWebUiExtensions({
						id: 'defaults',
						contributions: [
							defineContribution(slot, {
								id: 'default.action',
								component: DefaultAction,
								order: 10,
							}),
						],
					}),
					...clientExtensions.map((extension) => provideWebUiExtensions(extension)),
					provideWebUiExtensions({
						id: 'client.configuration',
						overrides: [
							{
								slot: slot.name,
								id: target,
								disabled: false,
								order: 0,
								visibilityRule: 'client.allowed',
							},
						],
					}),
				],
			});
			const registry = TestBed.inject(ExtensionRegistry);
			const entry = registry.snapshot().contributions.find((item) => item.id === target)!;
			expect(entry.component).toBe(ClientAction);
			expect(entry.disabled).toBeFalse();
			expect(entry.order).toBe(0);
			expect(entry.visibilityRule).toBe('client.allowed');
			expect(
				registry.resolve(slot.name, { allowed: false }).items.some((item) => item.id === target),
			).toBeFalse();
			expect(
				registry.resolve(slot.name, { allowed: true }).items.some((item) => item.id === target),
			).toBeTrue();
			expect(registry.snapshot().diagnostics).toEqual([]);
		});
	}
});
