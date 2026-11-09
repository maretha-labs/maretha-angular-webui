import { localizedState } from './i18n/localized-state';
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { ApplicationContext } from './user-menu';
import { defineSlot } from './contribution';
import { WebUiIconComponent } from './webui-icons';

export interface ShellActionContext extends ApplicationContext {
	readonly navigate: (url: string) => Promise<boolean>;
}
export interface QuickSearchContext extends ShellActionContext {
	readonly searchTerm: string;
	readonly close: () => void;
}
const isShell = (value: unknown): value is ShellActionContext => {
	const c = value as ShellActionContext | null;
	return (
		!!c &&
		typeof c.route === 'string' &&
		typeof c.locale === 'string' &&
		typeof c.navigate === 'function'
	);
};
export const SHELL_ACTIONS_SLOT = defineSlot<ShellActionContext>('SHELL_ACTIONS', isShell);
export const QUICK_SEARCH_ACTIONS_SLOT = defineSlot<QuickSearchContext>(
	'QUICK_SEARCH_ACTIONS',
	(value): value is QuickSearchContext =>
		isShell(value) &&
		typeof (value as QuickSearchContext).searchTerm === 'string' &&
		typeof (value as QuickSearchContext).close === 'function',
);

@Component({
	selector: 'nx-quick-search-command',
	imports: [WebUiIconComponent],
	template: `<button
			type="button"
			role="option"
			[attr.aria-selected]="focused()"
			(focus)="focused.set(true)"
			(blur)="focused.set(false)"
			data-search-result
			[disabled]="busy()"
			(click)="execute()"
		>
			<nx-webui-icon [name]="icon()" /><span>{{ label() }}</span>
		</button>
		@if (error()) {
			<p role="alert">{{ error() }}</p>
		}`,
	styles: `
		:host {
			display: block;
		}
		button {
			display: flex;
			align-items: center;
			gap: 16px;
			width: 100%;
			padding: 1em;
			border: 0;
			border-top: 1px solid var(--nuxeo-border);
			text-align: start;
			color: var(--nuxeo-quicksearch-text, var(--nuxeo-text-default));
			background: var(--nuxeo-quicksearch-background, var(--nuxeo-box));
			font: inherit;
			cursor: pointer;
		}
		button:focus-visible,
		button:hover {
			outline: 2px solid var(--nuxeo-primary-color);
			outline-offset: -2px;
		}
		nx-webui-icon {
			width: 60px;
			height: 60px;
		}
		p {
			background: var(--nuxeo-box);
			padding: 1em;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickSearchCommandComponent {
	readonly context = input.required<QuickSearchContext>();
	readonly label = input.required<string>();
	readonly icon = input('nuxeo:search');
	readonly run =
		input.required<(context: QuickSearchContext) => boolean | void | Promise<boolean | void>>();
	readonly busy = signal(false);
	readonly focused = signal(false);
	readonly error = localizedState('');
	async execute(): Promise<void> {
		if (this.busy()) return;
		this.busy.set(true);
		this.error.set('');
		try {
			if ((await this.run()(this.context())) !== false) this.context().close();
		} catch {
			this.error.setMessage(
				'sdk.command.failed',
				'This command could not be completed. Please retry.',
			);
		} finally {
			this.busy.set(false);
		}
	}
}
