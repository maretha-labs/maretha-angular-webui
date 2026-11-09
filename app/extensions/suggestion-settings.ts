import {
	computed,
	inject,
	Injectable,
	InjectionToken,
	Signal,
	signal,
	StaticProvider,
} from '@angular/core';
import { map, of, OperatorFunction, switchMap, timer } from 'rxjs';
import { WebUiMessages } from './webui-messages';

/** Search-as-you-type field kinds: stock nuxeo-user-, document-, directory- and tag-suggestion. */
export type SuggestionWidget = 'user' | 'document' | 'directory' | 'tag';

/** Limits at one level of the configuration; a missing value defers to the next level. */
export interface SuggestionLimitsConfig {
	/** Characters typed before a search runs (stock `min-chars`), 0 to 100. */
	readonly minChars?: number;
	/** Milliseconds typing must pause before a search runs (stock `frequency`), 0 to 10000. */
	readonly pauseMs?: number;
}

/** Limits for every field, per widget kind, and per field property such as `dc:nature`. */
export interface SuggestionRules extends SuggestionLimitsConfig {
	readonly widgets?: Readonly<Partial<Record<SuggestionWidget, SuggestionLimitsConfig>>>;
	readonly fields?: Readonly<Record<string, SuggestionLimitsConfig>>;
}

/** Application rules, then rules per layout, dialog or page id (such as `nuxeo.task38e`). */
export interface SuggestionConfig extends SuggestionRules {
	readonly layouts?: Readonly<Record<string, SuggestionRules>>;
}

/** The limits that apply to one field. */
export interface SuggestionLimits {
	readonly minChars: number;
	readonly pauseMs: number;
}

export interface SuggestionTarget {
	readonly widget: SuggestionWidget;
	readonly layout?: string | null;
	readonly field?: string | null;
}

/**
 * Stock values: nuxeo-selectivity `minChars` 3 and `frequency` 300, nuxeo-tag-suggestion `minChars`
 * 1, and `min-chars="0"` on every editable Nature, Subjects and Coverage field, the Add to
 * collection dialogs, the publication location and the retention rule to attach.
 * custom/suggestions.json ships the same.
 */
export const DEFAULT_SUGGESTION_CONFIG: SuggestionConfig = Object.freeze({
	minChars: 3,
	pauseMs: 300,
	widgets: Object.freeze({ tag: Object.freeze({ minChars: 1 }) }),
	fields: Object.freeze({
		'dc:nature': Object.freeze({ minChars: 0 }),
		'dc:subjects': Object.freeze({ minChars: 0 }),
		'dc:coverage': Object.freeze({ minChars: 0 }),
	}),
	layouts: Object.freeze({
		'maretha.dialog.add-to-collection': Object.freeze({ minChars: 0 }),
		'maretha.publish.section': Object.freeze({ minChars: 0 }),
		'maretha.retention.attach-rule': Object.freeze({ minChars: 0 }),
	}),
});

/** Bootstrap configuration, used until the application applies another one. */
export const SUGGESTION_OPTIONS = new InjectionToken<SuggestionConfig>('SUGGESTION_OPTIONS', {
	providedIn: 'root',
	factory: () => DEFAULT_SUGGESTION_CONFIG,
});

const WIDGETS: readonly SuggestionWidget[] = ['user', 'document', 'directory', 'tag'];
const LIMITS = { minChars: 100, pauseMs: 10000 } as const;

/**
 * Application-wide search-as-you-type limits. Lookup, most specific first: the layout's field,
 * the layout's widget kind, the layout, then the same three application levels.
 */
@Injectable({ providedIn: 'root' })
export class SuggestionSettings {
	private readonly config = signal<SuggestionConfig>(
		normalizeSuggestionConfig(inject(SUGGESTION_OPTIONS)) ?? DEFAULT_SUGGESTION_CONFIG,
	);
	readonly current = this.config.asReadonly();

	/** Replaces the configuration; returns false and keeps the current one if it is not an object. */
	apply(config: unknown): boolean {
		const normalized = normalizeSuggestionConfig(config);
		if (normalized) this.config.set(normalized);
		return !!normalized;
	}

	resolve(target: SuggestionTarget): SuggestionLimits {
		const config = this.config();
		const layout = target.layout ? own(config.layouts, target.layout) : undefined;
		const levels = [
			target.field ? own(layout?.fields, target.field) : undefined,
			own(layout?.widgets, target.widget),
			layout,
			target.field ? own(config.fields, target.field) : undefined,
			own(config.widgets, target.widget),
			config,
			DEFAULT_SUGGESTION_CONFIG,
		];
		return {
			minChars: levels.find((level) => level?.minChars !== undefined)?.minChars ?? 3,
			pauseMs: levels.find((level) => level?.pauseMs !== undefined)?.pauseMs ?? 300,
		};
	}
}

/** The layout, dialog or page whose rules apply to the suggestion fields it contains. */
@Injectable()
export class SuggestionScope {
	readonly layout = signal<string | null>(null);
}

/** Provides a scope; a host that mounts several layouts sets `layout` as each one mounts. */
export function provideSuggestionScope(layout: string | null = null): StaticProvider {
	return {
		provide: SuggestionScope,
		useFactory: () => {
			const scope = new SuggestionScope();
			scope.layout.set(layout);
			return scope;
		},
		deps: [],
	};
}

/** The limits of a field of this kind in the nearest scope; call in an injection context. */
export function suggestionLimits(
	widget: SuggestionWidget | (() => SuggestionWidget),
	field?: () => string | null | undefined,
): Signal<SuggestionLimits> {
	const settings = inject(SuggestionSettings);
	const scope = inject(SuggestionScope, { optional: true });
	return computed(
		() =>
			settings.resolve({
				widget: typeof widget === 'function' ? widget() : widget,
				layout: scope?.layout() ?? null,
				field: field?.() ?? null,
			}),
		{ equal: (a, b) => a.minChars === b.minChars && a.pauseMs === b.pauseMs },
	);
}

/**
 * Stock nuxeo-selectivity query timing. A term shorter than `minChars`, ignoring surrounding
 * spaces, emits `null` at once and drops a pending term; any other term is emitted unchanged once
 * typing has paused for `pauseMs`.
 */
export function suggestionTerms(
	limits: () => SuggestionLimits,
): OperatorFunction<string | null | undefined, string | null> {
	return switchMap((value) => {
		const term = value ?? '';
		const { minChars, pauseMs } = limits();
		if (term.trim().length < minChars) return of(null);
		return pauseMs > 0 ? timer(pauseMs).pipe(map(() => term)) : of(term);
	});
}

/** Stock `selectivity.minChars`, shown while a term is too short to search. */
export function suggestionMinCharsText(messages: WebUiMessages, minChars: number): string {
	return messages
		.text('selectivity.minChars', 'Please enter {0} or more characters')
		.replace(/\{0\}/g, String(minChars));
}

/** Keeps the valid parts of a configuration; null when it is not an object. */
export function normalizeSuggestionConfig(value: unknown): SuggestionConfig | null {
	if (!isRecord(value)) return null;
	const layouts: Record<string, SuggestionRules> = {};
	if (isRecord(value['layouts']))
		for (const [id, rules] of Object.entries(value['layouts']))
			if (isRecord(rules)) layouts[id] = rulesOf(rules);
	return { ...rulesOf(value), layouts };
}

function rulesOf(value: Record<string, unknown>): SuggestionRules {
	const widgets: Partial<Record<SuggestionWidget, SuggestionLimitsConfig>> = {};
	const widgetRules = value['widgets'];
	if (isRecord(widgetRules))
		for (const widget of WIDGETS) {
			const rules = own(widgetRules, widget);
			if (isRecord(rules)) widgets[widget] = limitsOf(rules);
		}
	const fields: Record<string, SuggestionLimitsConfig> = {};
	if (isRecord(value['fields']))
		for (const [name, rules] of Object.entries(value['fields']))
			if (isRecord(rules)) fields[name] = limitsOf(rules);
	return { ...limitsOf(value), widgets, fields };
}

function limitsOf(value: Record<string, unknown>): SuggestionLimitsConfig {
	const minChars = whole(value['minChars'], LIMITS.minChars);
	const pauseMs = whole(value['pauseMs'], LIMITS.pauseMs);
	return {
		...(minChars === undefined ? {} : { minChars }),
		...(pauseMs === undefined ? {} : { pauseMs }),
	};
}

function whole(value: unknown, max: number): number | undefined {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
		? value
		: undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function own<T>(record: Readonly<Record<string, T>> | undefined, key: string): T | undefined {
	return record && Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}
