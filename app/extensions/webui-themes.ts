import { WebUiMessages } from './webui-messages';
import { DOCUMENT } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	inject,
	Injectable,
	input,
	makeEnvironmentProviders,
	provideEnvironmentInitializer,
	signal,
} from '@angular/core';
import { defineContribution, defineSlot, ResolvedContribution } from './contribution';
import { WebUiAppState } from './app-state';
import { ExtensionRegistry } from './extension-registry.service';
import type { ApplicationUser } from './user-menu';
import { WebUiSlotComponent } from './webui-slot.component';

export interface WebUiThemeContext {
	readonly selected: string;
	readonly select: (id: string) => void;
	/** Signed-in user; slot hosts add it like Polymer's shared slot model. */
	readonly user?: ApplicationUser | null;
}
export const THEMES_SLOT = defineSlot<WebUiThemeContext>(
	'THEMES',
	(value): value is WebUiThemeContext =>
		!!value &&
		typeof value === 'object' &&
		typeof (value as WebUiThemeContext).selected === 'string' &&
		typeof (value as WebUiThemeContext).select === 'function',
);
export interface WebUiThemeDefinition {
	readonly id: string;
	readonly label: string;
	/** Optional catalogue key; omitted keys preserve customer-authored labels literally. */
	readonly labelKey?: string;
	readonly tokens: Readonly<Record<string, string>>;
	readonly order?: number;
}

function checkedTokens(tokens: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
	for (const [key, value] of Object.entries(tokens)) {
		if (
			!/^--[a-z][a-z0-9-]*$/.test(key) ||
			typeof value !== 'string' ||
			/[;{}<>]|url\s*\(|expression\s*\(|javascript:/i.test(
				value.replace(
					/url\((['"]?)(assets\/[a-zA-Z0-9_./-]+)\1\)/g,
					(match, _quote, path: string) => (path.includes('..') ? match : ''),
				),
			)
		)
			throw new Error('Unsupported theme token.');
	}
	return Object.freeze({ ...tokens });
}
@Component({
	selector: 'nx-theme-choice',
	template: `<article [class.selected]="context().selected === themeId()">
		@if (preview()) {
			<img [src]="preview()" [alt]="messages.text(labelKey(), label())" />
		}
		<footer>
			<strong>{{ messages.text(labelKey(), label()) }}</strong
			><button
				type="button"
				[disabled]="context().selected === themeId()"
				[attr.aria-pressed]="context().selected === themeId()"
				[attr.aria-label]="
					(context().selected === themeId()
						? messages.text('themes.current', 'Current')
						: messages.text('themes.apply', 'Apply')) +
					' ' +
					messages.text(labelKey(), label())
				"
				(click)="context().select(themeId())"
			>
				{{
					context().selected === themeId()
						? messages.text('themes.current', 'Current')
						: messages.text('themes.apply', 'Apply')
				}}
			</button>
		</footer>
	</article>`,
	styles: `
		:host {
			display: block;
			min-width: 0;
		}
		article {
			background: var(--nuxeo-box);
			color: var(--nuxeo-text-default);
			padding: 16px;
			border: 1px solid var(--nuxeo-border);
		}
		article.selected {
			outline: 2px solid var(--nuxeo-primary-color);
			outline-offset: -1px;
		}
		img {
			display: block;
			width: 100%;
			height: auto;
			aspect-ratio: 16/10;
			object-fit: cover;
		}
		footer {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding-top: 16px;
		}
		button {
			padding: 8px 24px;
			background: var(--nuxeo-primary-color);
			color: var(--nuxeo-button-primary-text, #fff);
			border: 0;
		}
		button:disabled {
			background: var(--nuxeo-border);
			color: inherit;
			opacity: 0.7;
		}
	`,

	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeChoiceComponent {
	readonly messages = inject(WebUiMessages);
	readonly labelKey = input<string>();
	readonly context = input.required<WebUiThemeContext>();
	readonly themeId = input.required<string>();
	readonly label = input.required<string>();
	readonly tokens = input.required<Readonly<Record<string, string>>>();
	readonly preview = computed(() => {
		if (!this.themeId().startsWith('maretha.theme.')) return null;
		const name = this.themeId().replace('maretha.theme.', '');
		return ['default', 'dark', 'kawaii', 'light'].includes(name)
			? `assets/themes/${name}-preview.jpg`
			: null;
	});
}
export function defineWebUiTheme(theme: WebUiThemeDefinition) {
	return defineContribution(THEMES_SLOT, {
		id: theme.id,
		order: theme.order,
		component: ThemeChoiceComponent,
		inputs: {
			themeId: theme.id,
			label: theme.label,
			labelKey: theme.labelKey,
			tokens: checkedTokens(theme.tokens),
		},
	});
}

@Injectable({ providedIn: 'root' })
export class WebUiThemes {
	private readonly registry = inject(ExtensionRegistry);
	private readonly user = inject(WebUiAppState).user;
	private readonly document = inject(DOCUMENT);
	private readonly enabled = signal(false);
	private readonly requested = signal('maretha.theme.default');
	private readonly originals = new Map<string, { value: string; priority: string }>();
	private readonly applied = new Map<string, string>();
	readonly context = computed<WebUiThemeContext>(() => ({
		user: this.user(),
		selected: this.requested(),
		select: (id) => this.select(id),
	}));
	readonly choices = computed(() => this.registry.resolve(THEMES_SLOT.name, this.context()).items);
	readonly selected = computed<ResolvedContribution | undefined>(
		() => this.choices().find((choice) => choice.id === this.requested()) ?? this.choices()[0],
	);
	constructor() {
		effect(() => {
			if (!this.enabled()) return;
			const choice = this.selected();
			const raw = choice?.inputs?.['tokens'];
			const tokens = checkedTokens({
				...(raw && typeof raw === 'object' ? (raw as Record<string, string>) : {}),
			});
			this.restore();
			const style = this.document.documentElement.style;
			for (const [name, value] of Object.entries(tokens)) {
				this.originals.set(name, {
					value: style.getPropertyValue(name),
					priority: style.getPropertyPriority(name),
				});
				style.setProperty(name, value);
				this.applied.set(name, style.getPropertyValue(name));
			}
		});
		inject(DestroyRef).onDestroy(() => this.restore());
	}
	activate(): void {
		try {
			const saved = this.document.defaultView?.localStorage.getItem('maretha.webui.theme');
			if (saved) this.requested.set(saved);
		} catch {
			/* Storage may be disabled by browser policy. */
		}
		this.enabled.set(true);
	}
	select(id: string): void {
		if (!this.choices().some((choice) => choice.id === id)) return;
		this.requested.set(id);
		try {
			this.document.defaultView?.localStorage.setItem('maretha.webui.theme', id);
		} catch {
			/* Selection still applies for this session. */
		}
	}
	private restore(): void {
		const style = this.document.documentElement.style;
		for (const [name, value] of this.applied) {
			if (style.getPropertyValue(name) !== value) continue;
			const original = this.originals.get(name)!;
			if (original.value) style.setProperty(name, original.value, original.priority);
			else style.removeProperty(name);
		}
		this.applied.clear();
		this.originals.clear();
	}
}
export function provideWebUiThemeApplication() {
	return makeEnvironmentProviders([
		provideEnvironmentInitializer(() => inject(WebUiThemes).activate()),
	]);
}
@Component({
	selector: 'nx-webui-theme-picker',
	imports: [WebUiSlotComponent],
	template: `<div class="themes">
		@for (choice of themes.choices(); track choice.id) {
			<nx-webui-slot
				name="THEMES"
				layout="stack"
				[includeIds]="[choice.id]"
				[context]="context()"
			/>
		}
	</div>`,
	styles: `
		.themes {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 20px;
		}
		@media (max-width: 1024px) {
			.themes {
				grid-template-columns: 1fr;
			}
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebUiThemePickerComponent {
	readonly themes = inject(WebUiThemes);
	readonly context = computed<WebUiThemeContext>(() => ({
		selected: this.themes.selected()?.id ?? '',
		select: (id) => this.themes.select(id),
	}));
}
