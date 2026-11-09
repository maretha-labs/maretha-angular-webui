import { Injectable, signal, untracked } from '@angular/core';
import {
	ExtensionDiagnostic,
	ResolvedContribution,
	sameInputs,
	SlotResolution,
	WebUiExtension,
	VisibilityRuleDefinition,
} from './contribution';

interface Layer {
	readonly token: symbol;
	readonly extension: WebUiExtension;
}

interface RegistrySnapshot {
	readonly visibilityRules: readonly VisibilityRuleDefinition[];
	readonly contributions: readonly ResolvedContribution[];
	readonly diagnostics: readonly ExtensionDiagnostic[];
}

const identifier = /^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/;
const keyOf = (slot: string, id: string): string => JSON.stringify([slot, id]);

@Injectable({ providedIn: 'root' })
export class ExtensionRegistry {
	private layers: readonly Layer[] = [];
	private layerOrder: readonly string[] = [];
	private readonly state = signal<RegistrySnapshot>({
		contributions: [],
		diagnostics: [],
		visibilityRules: [],
	});
	readonly snapshot = this.state.asReadonly();

	visibilityRuleIds(): readonly string[] {
		return this.state().visibilityRules.map((rule) => rule.id);
	}

	isVisibilityRuleRegistered(id: string): boolean {
		return this.state().visibilityRules.some((rule) => rule.id === id);
	}

	register(extension: WebUiExtension): () => void {
		const layer = { token: Symbol(extension.id), extension: this.copyAndValidate(extension) };
		const existing = this.layers.findIndex((item) => item.extension.id === extension.id);
		const next = [...this.layers];
		if (existing < 0) next.push(layer);
		else next[existing] = layer;
		const order = this.layerOrder.includes(extension.id)
			? this.layerOrder
			: [...this.layerOrder, extension.id];
		next.sort((a, b) => order.indexOf(a.extension.id) - order.indexOf(b.extension.id));
		const snapshot = this.build(next, extension.id);
		this.layerOrder = order;
		this.layers = next;
		this.state.set(snapshot);
		return () => {
			if (!this.layers.some((item) => item.token === layer.token)) return;
			const remaining = this.layers.filter((item) => item.token !== layer.token);
			const restored = this.build(remaining);
			this.layers = remaining;
			this.state.set(restored);
		};
	}

	resolve(slot: string, context: unknown): SlotResolution {
		const snapshot = this.state();
		const diagnostics = snapshot.diagnostics.filter((item) => item.slot === slot);
		const items = snapshot.contributions.filter((item) => {
			if (item.slot !== slot || item.disabled) return false;
			try {
				if (item.isContext(context) !== true) {
					diagnostics.push(this.diagnostic(item, 'invalid-context', 'Slot context is invalid.'));
					return false;
				}
				for (const id of new Set([item.requiredVisibilityRule, item.visibilityRule])) {
					if (id === undefined) continue;
					const rule = snapshot.visibilityRules.find((candidate) => candidate.id === id);
					if (!rule) {
						diagnostics.push(
							this.diagnostic(
								item,
								'unknown-visibility-rule',
								`Required visibility rule ${id} is not registered.`,
							),
						);
						return false;
					}
					try {
						if (rule.evaluate(context) !== true) return false;
					} catch {
						diagnostics.push(
							this.diagnostic(
								item,
								'visibility-rule-failed',
								`Visibility rule ${id} could not be evaluated.`,
							),
						);
						return false;
					}
				}
				return !item.when || item.when(context) === true;
			} catch {
				diagnostics.push(
					this.diagnostic(
						item,
						'condition-failed',
						'Contribution condition could not be evaluated.',
					),
				);
				return false;
			}
		});
		return { items, diagnostics };
	}

	private copyAndValidate(extension: WebUiExtension): WebUiExtension {
		this.validateId(extension.id, 'Extension');
		const ruleIds = new Set<string>();
		const visibilityRules = (extension.visibilityRules ?? []).map((rule) => {
			this.validateId(rule.id, 'Visibility rule');
			if (typeof rule.evaluate !== 'function')
				throw new Error('Visibility rule requires an evaluate function.');
			if (ruleIds.has(rule.id)) throw new Error(`Duplicate visibility rule: ${rule.id}`);
			ruleIds.add(rule.id);
			return Object.freeze({ id: rule.id, evaluate: rule.evaluate });
		});
		const seen = new Set<string>();
		const contributions = (extension.contributions ?? []).map((item) => {
			this.validateId(item.id, 'Contribution');
			this.validateId(item.slot, 'Slot');
			if (item.pairKey !== undefined) this.validateId(item.pairKey, 'Pair');
			if (item.requiredVisibilityRule !== undefined)
				this.validateId(item.requiredVisibilityRule, 'Required visibility rule');
			if (item.retain !== undefined && typeof item.retain !== 'boolean')
				throw new Error('Contribution retain must be a boolean.');
			const key = keyOf(item.slot, item.id);
			if (seen.has(key)) throw new Error(`Duplicate contribution: ${item.slot}/${item.id}`);
			seen.add(key);
			this.validateNumber(item.order, 'order');
			this.validateNumber(item.priority, 'priority');
			if (item.disabled !== undefined && typeof item.disabled !== 'boolean') {
				throw new Error('Contribution disabled must be a boolean.');
			}
			if (
				(typeof item.component === 'function') === (typeof item.loadComponent === 'function') ||
				(item.component !== undefined && typeof item.component !== 'function') ||
				(item.loadComponent !== undefined && typeof item.loadComponent !== 'function') ||
				typeof item.isContext !== 'function' ||
				(item.when !== undefined && typeof item.when !== 'function')
			) {
				throw new Error(
					'Contribution requires one component source and valid context/condition functions.',
				);
			}
			if (
				item.inputs !== undefined &&
				(!item.inputs || typeof item.inputs !== 'object' || Array.isArray(item.inputs))
			) {
				throw new Error('Contribution inputs must be a record.');
			}
			if (item.inputs && Object.hasOwn(item.inputs, 'context')) {
				throw new Error('The context input is supplied by the slot host.');
			}
			return Object.freeze({ ...item, inputs: Object.freeze({ ...item.inputs }) });
		});
		const overrides = (extension.overrides ?? []).map((item) => {
			if (item.visibilityRule !== undefined)
				this.validateId(item.visibilityRule, 'Visibility rule');
			this.validateId(item.id, 'Override');
			this.validateId(item.slot, 'Slot');
			this.validateNumber(item.order, 'order');
			if (item.disabled !== undefined && typeof item.disabled !== 'boolean') {
				throw new Error('Override disabled must be a boolean.');
			}
			return Object.freeze({ ...item });
		});
		return Object.freeze({
			id: extension.id,
			visibilityRules: Object.freeze(visibilityRules),
			contributions: Object.freeze(contributions),
			overrides: Object.freeze(overrides),
		});
	}

	private build(layers: readonly Layer[], validateOverridesFor?: string): RegistrySnapshot {
		const rules = new Map<string, VisibilityRuleDefinition>();
		for (const { extension } of layers) {
			for (const rule of extension.visibilityRules ?? []) {
				if (rules.has(rule.id)) throw new Error(`Duplicate visibility rule: ${rule.id}`);
				rules.set(rule.id, rule);
			}
		}
		const entries = new Map<string, ResolvedContribution>();
		const diagnostics: ExtensionDiagnostic[] = [];
		for (const { extension } of layers) {
			for (const item of extension.contributions ?? []) {
				const key = keyOf(item.slot, item.id);
				const previous = entries.get(key);
				if (previous && previous.priority > (item.priority ?? 0)) continue;
				entries.set(
					key,
					Object.freeze({
						...item,
						key,
						extensionId: extension.id,
						order: item.order ?? 0,
						priority: item.priority ?? 0,
						disabled: item.disabled ?? false,
					}),
				);
			}
			for (const patch of extension.overrides ?? []) {
				if (patch.visibilityRule !== undefined && !rules.has(patch.visibilityRule)) {
					diagnostics.push({
						code: 'unknown-visibility-rule',
						extensionId: extension.id,
						slot: patch.slot,
						contributionId: patch.id,
						message: `Override was skipped: visibility rule ${patch.visibilityRule} is not registered.`,
					});
					continue;
				}
				const key = keyOf(patch.slot, patch.id);
				const previous = entries.get(key);
				if (!previous) {
					if (extension.id === validateOverridesFor)
						throw new Error(`Unknown override target: ${patch.slot}/${patch.id}`);
					diagnostics.push({
						code: 'unknown-target',
						extensionId: extension.id,
						slot: patch.slot,
						contributionId: patch.id,
						message: 'Override target is no longer registered.',
					});
					continue;
				}
				entries.set(
					key,
					Object.freeze({
						...previous,
						order: patch.order ?? previous.order,
						disabled: patch.disabled ?? previous.disabled,
						visibilityRule: patch.visibilityRule ?? previous.visibilityRule,
					}),
				);
			}
		}
		const previousEntries = new Map(
			untracked(this.state).contributions.map((item) => [item.key, item]),
		);
		const contributions = [...entries.values()].map((item) => {
			const previous = previousEntries.get(item.key);
			return previous &&
				previous.pairKey === item.pairKey &&
				previous.retain === item.retain &&
				previous.component === item.component &&
				previous.loadComponent === item.loadComponent &&
				previous.isContext === item.isContext &&
				previous.when === item.when &&
				previous.requiredVisibilityRule === item.requiredVisibilityRule &&
				previous.visibilityRule === item.visibilityRule &&
				previous.extensionId === item.extensionId &&
				previous.disabled === item.disabled &&
				previous.order === item.order &&
				previous.priority === item.priority &&
				sameInputs(previous.inputs, item.inputs)
				? previous
				: item;
		});
		return Object.freeze({
			visibilityRules: Object.freeze([...rules.values()]),
			contributions: Object.freeze(contributions.sort((a, b) => a.order - b.order)),
			diagnostics: Object.freeze(diagnostics),
		});
	}

	private diagnostic(
		item: ResolvedContribution,
		code: ExtensionDiagnostic['code'],
		message: string,
	): ExtensionDiagnostic {
		return {
			code,
			message,
			extensionId: item.extensionId,
			slot: item.slot,
			contributionId: item.id,
		};
	}

	private validateId(value: string, kind: string): void {
		if (typeof value !== 'string' || !identifier.test(value))
			throw new Error(`${kind} identifier is invalid.`);
	}

	private validateNumber(value: number | undefined, field: string): void {
		if (value !== undefined && !Number.isFinite(value))
			throw new Error(`Contribution ${field} must be finite.`);
	}
}
