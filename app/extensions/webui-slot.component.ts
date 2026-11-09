import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
	viewChildren,
} from '@angular/core';
import { ContributionOutletComponent } from './contribution-outlet.component';
import { WebUiAppState, withSharedSlotModel } from './app-state';
import { ExtensionRegistry } from './extension-registry.service';

@Component({
	selector: 'nx-webui-slot',
	standalone: true,
	imports: [ContributionOutletComponent],
	host: { '[class.stack]': "layout() === 'stack'" },
	template: `@for (item of visibleItems(); track item.key) {
		<nx-contribution-outlet
			[class.stack]="layout() === 'stack'"
			[contribution]="item"
			[context]="slotContext()"
		/>
	}`,
	styles: `
		:host {
			display: inline-flex;
			align-items: center;
		}
		:host(.stack) {
			display: flex;
			flex-direction: column;
			align-items: stretch;
			min-width: 0;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WebUiSlotComponent {
	readonly name = input.required<string>();
	readonly context = input<unknown>(null);
	private readonly user = inject(WebUiAppState).user;
	readonly slotContext = computed(() => withSharedSlotModel(this.context(), this.user()));
	readonly layout = input<'inline' | 'stack'>('inline');
	readonly includeIds = input<readonly string[] | null>(null);
	readonly excludeIds = input<readonly string[]>([]);
	private readonly registry = inject(ExtensionRegistry);
	readonly resolution = computed(() => this.registry.resolve(this.name(), this.slotContext()));
	readonly visibleItems = computed(() =>
		this.resolution().items.filter(
			(item) =>
				(!this.includeIds() || this.includeIds()!.includes(item.id)) &&
				!this.excludeIds().includes(item.id),
		),
	);
	private readonly outlets = viewChildren(ContributionOutletComponent);
	readonly diagnostics = computed(() => [
		...this.resolution().diagnostics,
		...this.outlets().flatMap((outlet) => {
			const diagnostic = outlet.diagnostic();
			return diagnostic ? [diagnostic] : [];
		}),
	]);
}
