import { Type } from '@angular/core';

export interface SlotDefinition<C> {
	readonly name: string;
	readonly isContext: (value: unknown) => value is C;
}

type ComponentSource =
	| { readonly component: Type<unknown>; readonly loadComponent?: never }
	| { readonly component?: never; readonly loadComponent: () => Promise<Type<unknown>> };

export type ContributionDefinition<C> = ComponentSource & {
	readonly id: string;
	readonly pairKey?: string;
	readonly retain?: boolean;
	/** Whether an administration page renders its own heading. Defaults to the host heading. */
	readonly pageHeading?: 'host' | 'component';
	readonly order?: number;
	readonly priority?: number;
	readonly disabled?: boolean;
	readonly when?: (context: C) => boolean;
	readonly requiredVisibilityRule?: string;
	readonly inputs?: Readonly<Record<string, unknown>>;
};

export type ContributionRegistration = ComponentSource & {
	readonly id: string;
	readonly slot: string;
	readonly pairKey?: string;
	readonly retain?: boolean;
	readonly pageHeading?: 'host' | 'component';
	readonly order?: number;
	readonly priority?: number;
	readonly disabled?: boolean;
	readonly inputs?: Readonly<Record<string, unknown>>;
	readonly isContext: (value: unknown) => boolean;
	readonly when?: (context: unknown) => boolean;
	readonly requiredVisibilityRule?: string;
};

export interface VisibilityRuleDefinition {
	readonly id: string;
	readonly evaluate: (context: unknown) => boolean;
}

export interface ContributionOverride {
	readonly visibilityRule?: string;
	readonly slot: string;
	readonly id: string;
	readonly disabled?: boolean;
	readonly order?: number;
}

export interface WebUiExtension {
	readonly id: string;
	readonly contributions?: readonly ContributionRegistration[];
	readonly overrides?: readonly ContributionOverride[];
	readonly visibilityRules?: readonly VisibilityRuleDefinition[];
}

export interface ExtensionDiagnostic {
	readonly code:
		| 'unknown-target'
		| 'invalid-context'
		| 'condition-failed'
		| 'unknown-visibility-rule'
		| 'visibility-rule-failed'
		| 'render-failed'
		| 'invalid-pair';
	readonly extensionId: string;
	readonly slot: string;
	readonly contributionId: string;
	readonly message: string;
}

export type ResolvedContribution = ContributionRegistration & {
	readonly key: string;
	readonly extensionId: string;
	readonly order: number;
	readonly priority: number;
	readonly disabled: boolean;
	readonly visibilityRule?: string;
};

export interface SlotResolution {
	readonly items: readonly ResolvedContribution[];
	readonly diagnostics: readonly ExtensionDiagnostic[];
}

export function sameInputs(
	a: Readonly<Record<string, unknown>> | undefined,
	b: Readonly<Record<string, unknown>> | undefined,
): boolean {
	const keys = Object.keys(a ?? {});
	return (
		keys.length === Object.keys(b ?? {}).length &&
		keys.every((key) => Object.hasOwn(b ?? {}, key) && Object.is(a?.[key], b?.[key]))
	);
}

export function defineSlot<C>(
	name: string,
	isContext: (value: unknown) => value is C,
): SlotDefinition<C> {
	return Object.freeze({ name, isContext });
}

export function defineContribution<C>(
	slot: SlotDefinition<C>,
	definition: ContributionDefinition<C>,
): ContributionRegistration {
	const { when, ...rest } = definition;
	return {
		...rest,
		slot: slot.name,
		isContext: slot.isContext,
		when: when ? (context: unknown) => slot.isContext(context) && when(context) : undefined,
	};
}
