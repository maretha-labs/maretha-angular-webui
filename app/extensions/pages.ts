import { WebUiMessagePipe } from './webui-messages';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	ElementRef,
	inject,
	input,
	viewChild,
} from '@angular/core';
import { ApplicationContext, ApplicationUser } from './user-menu';
import { ContributionDefinition, defineContribution, defineSlot } from './contribution';
import { DocumentActionContext } from './slots';
import { ExtensionRegistry } from './extension-registry.service';
import { ContributionOutletComponent } from './contribution-outlet.component';
import { ViewNavigation } from './view-navigation';
export interface PageContext extends ApplicationContext, DocumentActionContext {
	readonly user: ApplicationUser | null;
	readonly pageId: string;
	readonly params: Readonly<Record<string, string>>;
	readonly query: Readonly<Record<string, string>>;
}
export const PAGES_SLOT = defineSlot<PageContext>('PAGES', (value): value is PageContext => {
	if (!value || typeof value !== 'object') return false;
	const c = value as PageContext;
	return (
		typeof c.pageId === 'string' &&
		typeof c.route === 'string' &&
		typeof c.noEdit === 'boolean' &&
		!!c.params &&
		!!c.query
	);
});
export function definePage(definition: ContributionDefinition<PageContext> & { pageId: string }) {
	const { pageId, ...contribution } = definition;
	return defineContribution(PAGES_SLOT, { ...contribution, pairKey: pageId });
}
@Component({
	selector: 'nx-webui-page',
	imports: [ContributionOutletComponent, WebUiMessagePipe],
	template: `@if (page(); as current) {
			<nx-contribution-outlet class="page" [contribution]="current" [context]="context()" />
		} @else {
			<p role="status">
				{{
					'app.sdk.pages.this-page-is-unavailable-81350e'
						| webuiMessage: 'This page is unavailable.'
				}}
			</p>
		}`,
	styles: ':host { display:flex; flex:1; min-width:0; min-height:0; flex-direction:column; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebUiPageComponent {
	readonly context = input.required<PageContext>();
	private readonly registry = inject(ExtensionRegistry);
	private readonly outlet = viewChild(ContributionOutletComponent);
	readonly resolution = computed(() => this.registry.resolve('PAGES', this.context()));
	readonly page = computed(() => {
		const pages = this.resolution().items.filter((page) => page.pairKey === this.context().pageId);
		return pages.length === 1 ? pages[0] : null;
	});
	constructor() {
		const destroy = inject(DestroyRef);
		destroy.onDestroy(
			inject(ViewNavigation).register(async (url) => {
				if (url === this.context().route) return true;
				return (
					(await this.outlet()?.canDeactivate({
						reason: 'navigation',
						nextViewId: null,
						nextUrl: url,
					})) ?? true
				);
			}),
		);
		const window =
			inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.ownerDocument.defaultView;
		const beforeUnload = (event: BeforeUnloadEvent) => {
			if (this.outlet()?.hasPendingChanges()) {
				event.preventDefault();
				event.returnValue = '';
			}
		};
		window?.addEventListener('beforeunload', beforeUnload);
		destroy.onDestroy(() => window?.removeEventListener('beforeunload', beforeUnload));
	}
}
