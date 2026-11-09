import {
	defineContribution,
	defineSlot,
	ExtensionRegistry,
	type ContributionOverride,
	type WebUiExtension,
} from '@maretha/webui-sdk';

class CustomerAction {}
interface CustomerContext {
	readonly available: boolean;
}
const slot = defineSlot<CustomerContext>(
	'CUSTOMER_ACTIONS',
	(value): value is CustomerContext =>
		typeof value === 'object' && value !== null && 'available' in value,
);
const client: WebUiExtension = {
	id: 'customer.extensions',
	contributions: [
		defineContribution(slot, {
			id: 'customer.action.manual',
			component: CustomerAction,
			order: 5,
			when: (context) => context.available,
		}),
	],
};
const overrides: readonly ContributionOverride[] = [
	{ slot: 'CUSTOMER_ACTIONS', id: 'example.action.stable', disabled: true, order: 90 },
	{ slot: 'CUSTOMER_ACTIONS', id: 'example.action.changed-default', disabled: false, order: 7 },
];
const retiredOverride: ContributionOverride = {
	slot: 'CUSTOMER_ACTIONS',
	id: 'example.action.retired',
	disabled: true,
};
const check: (condition: unknown, message: string) => asserts condition = (condition, message) => {
	if (!condition) throw new Error(`Upgrade contract failed: ${message}`);
};

export function rehearse(revision: 'baseline' | 'candidate') {
	const registry = new ExtensionRegistry();
	const next = revision === 'candidate';
	registry.register({
		id: 'example.defaults',
		contributions: [
			defineContribution(slot, {
				id: 'example.action.stable',
				component: CustomerAction,
				order: next ? 20 : 10,
			}),
			defineContribution(slot, {
				id: 'example.action.changed-default',
				component: CustomerAction,
				order: next ? 40 : 30,
				disabled: next,
			}),
			...(next
				? []
				: [defineContribution(slot, { id: 'example.action.retired', component: CustomerAction })]),
		],
	});
	registry.register(client);
	let retiredError = '';
	try {
		registry.register({ id: 'customer.retired-override', overrides: [retiredOverride] });
	} catch (error) {
		retiredError = error instanceof Error ? error.message : String(error);
	}
	check(
		next ? retiredError.includes('example.action.retired') : retiredError === '',
		'an override of a removed ID must fail registration and name that ID',
	);
	registry.register({ id: 'customer.overrides', overrides });
	const state = () => registry.snapshot().contributions;
	const stable = state().find((entry) => entry.id === 'example.action.stable');
	const changed = state().find((entry) => entry.id === 'example.action.changed-default');
	check(
		stable?.disabled === true && stable.order === 90,
		'the custom/ hide/order override must retain its meaning',
	);
	check(
		changed?.disabled === false && changed.order === 7,
		'an explicit show override must survive a changed default',
	);
	const visible = registry.resolve(slot.name, { available: true }).items.map((entry) => entry.id);
	check(
		!visible.includes('example.action.stable') &&
			visible.includes('example.action.changed-default') &&
			!visible.includes('example.action.retired'),
		'the customer overrides must preserve effective visibility',
	);
	check(
		visible.includes('customer.action.manual'),
		'the independently authored client extension must remain registered',
	);
	const beforeRemoval = {
		stable: { disabled: stable.disabled, order: stable.order },
		changed: { disabled: changed.disabled, order: changed.order },
	};
	registry.register({
		id: 'customer.overrides',
		overrides: overrides.filter((entry) => entry.id !== 'example.action.changed-default'),
	});
	const revealed = state().find((entry) => entry.id === 'example.action.changed-default');
	check(
		revealed?.disabled === next && revealed.order === (next ? 40 : 30),
		"removing an override must reveal this release's default",
	);
	check(
		registry
			.resolve(slot.name, { available: true })
			.items.some((entry) => entry.id === 'example.action.changed-default') === !next,
		"removing an override must apply this release's default visibility",
	);
	return {
		revision,
		beforeRemoval,
		retiredError,
		revealed: { disabled: revealed.disabled, order: revealed.order },
	};
}
