import { RepositorySearchHosts } from 'app/modules/search/helpers/repository-search-hosts.service';
import { RepositorySearchComponent } from 'app/modules/search/components/repository-search/repository-search.component';
import { SearchFormOutletComponent } from 'app/modules/search/components/search-form/search-form-outlet.component';
import {
	ChangeDetectionStrategy,
	Component,
	effect,
	inject,
	input,
	untracked,
} from '@angular/core';
import { DrawerContext } from '@maretha/webui-sdk';
import type { CompiledSearchDefinition } from 'app/modules/search/helpers/repository-search-definitions';
import { AssetsSearchQueueService } from 'app/modules/search/helpers/assets-search-queue.service';
import { AssetsSearchQueueComponent } from 'app/modules/search/components/search-queue/assets-search-queue.component';
@Component({
	selector: 'nx-repository-search-drawer',
	imports: [RepositorySearchComponent, SearchFormOutletComponent, AssetsSearchQueueComponent],
	host: {
		'[class.showing-queue]':
			'assetsQueue.active() && assetsQueue.kind() === definition().queue?.kind',
	},
	template: `@if (assetsQueue.active() && assetsQueue.kind() === definition().queue?.kind) {
			<nx-assets-search-queue />
		} @else if (hosts.hosts().get(definition().id); as host) {
			<nx-search-form [definition]="definition()" [inputs]="{ search: host }" />
		} @else {
			<nx-repository-search [definition]="definition()" [context]="context()" [drawerOnly]="true" />
		}`,
	styles:
		':host {display:block;height:100%;min-height:0;padding:0;} :host.showing-queue {height:100%;min-height:0;padding:0;} h2 {font-size:16px;} label {display:flex;flex-direction:column;gap:8px;margin:16px 0;} input {padding:8px;max-width:100%;} button {padding:8px 16px;} p {margin-top:16px;}',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepositorySearchDrawerComponent {
	readonly hosts = inject(RepositorySearchHosts);
	readonly assetsQueue = inject(AssetsSearchQueueService);
	readonly context = input.required<DrawerContext>();
	readonly definition = input.required<CompiledSearchDefinition>();
	constructor() {
		// Stock Expired drawer is `nuxeo-search-form[queue auto]`: it opens on its result list
		// (one `expired_search` request), and the filter icon swaps in the form.
		effect(() => {
			const definition = this.definition();
			const queue = definition.queue;
			const user = this.context().user;
			// With the Expired results page mounted, the rail item only toggles the drawer around
			// that page's filter form: never swap it for the queue.
			if (
				!queue?.openByDefault ||
				!user?.id ||
				this.assetsQueue.active() ||
				this.assetsQueue.filtersRequested() ||
				this.hosts.hosts().has(definition.id)
			)
				return;
			const repository = String(this.context().document?.['repository'] ?? 'default');
			untracked(() => this.assetsQueue.openDefault(user.id, repository, queue.kind));
		});
	}
}
