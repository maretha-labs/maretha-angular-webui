import { NgComponentOutlet } from '@angular/common';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	Component,
	ErrorHandler,
	PendingTasks,
	effect,
	inject,
	input,
	signal,
	type Type,
} from '@angular/core';
import type { SearchDefinition } from '../../helpers/repository-search-definitions';

const stockForm = () =>
	import('../repository-search/assets-search-filters.component').then(
		(m) => m.AssetsSearchFiltersComponent,
	);

/** Loads presentation only. The mounted search controller remains the sole request owner. */
@Component({
	selector: 'nx-search-form',
	imports: [NgComponentOutlet, WebUiMessagePipe],
	template: `@if (component(); as form) {
			<ng-container *ngComponentOutlet="form; inputs: inputs()" />
		} @else if (loading()) {
			<div
				class="search-form-placeholder"
				[class.search-form-placeholder--drawer]="definition().layout.form === 'drawer'"
				role="status"
			>
				{{ 'app.loading' | webuiMessage: 'Loading…' }}
			</div>
		}`,
	styles: `
		:host {
			display: contents;
		}
		.search-form-placeholder {
			box-sizing: border-box;
			flex: 1;
			min-block-size: 12rem;
			padding: 20px;
			font-size: 13px;
			color: var(--nuxeo-text-default);
			background: var(--nuxeo-box);
		}
		.search-form-placeholder--drawer {
			block-size: 100%;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchFormOutletComponent {
	readonly definition = input.required<SearchDefinition>();
	/** Repository forms receive `search`; other adapters supply their own component inputs. */
	readonly inputs = input<Record<string, unknown>>({});
	readonly component = signal<Type<unknown> | null>(null);
	readonly loading = signal(true);
	private readonly pendingTasks = inject(PendingTasks);
	private readonly errors = inject(ErrorHandler);

	constructor() {
		effect((onCleanup) => {
			const load = this.definition().form.loadComponent ?? stockForm;
			let active = true;
			let finished = false;
			const complete = this.pendingTasks.add();
			const done = () => {
				if (!finished) complete();
				finished = true;
			};
			onCleanup(() => {
				active = false;
				done();
			});
			this.component.set(null);
			this.loading.set(true);
			Promise.resolve()
				.then(load)
				.then((component) => {
					if (active) this.component.set(component);
				})
				.catch((error: unknown) => {
					if (active) this.errors.handleError(error);
				})
				.finally(() => {
					if (active) this.loading.set(false);
					done();
				});
		});
	}
}
