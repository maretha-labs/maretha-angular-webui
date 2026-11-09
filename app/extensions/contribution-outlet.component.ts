import { WebUiMessagePipe } from './webui-messages';
import {
	ChangeDetectionStrategy,
	Component,
	ComponentRef,
	computed,
	effect,
	inject,
	input,
	PendingTasks,
	reflectComponentType,
	signal,
	Type,
	untracked,
	viewChild,
	ViewContainerRef,
} from '@angular/core';
import { ExtensionDiagnostic, ResolvedContribution, sameInputs } from './contribution';
import { GuardedView, ViewDeparture } from './view-navigation';

@Component({
	imports: [WebUiMessagePipe],
	selector: 'nx-contribution-outlet',
	standalone: true,
	template: `<ng-container #outlet />
		@if (diagnostic()) {
			<span role="status" class="extension-error">{{
				'app.sdk.contribution-outlet.extension-unavailable-b430d2'
					| webuiMessage: 'Extension unavailable'
			}}</span>
		}`,
	styles: `
		:host {
			display: inline-flex;
			align-items: center;
		}
		:host(.page) {
			display: flex;
			flex: 1;
			align-items: stretch;
			min-width: 0;
			min-height: 0;
			flex-direction: column;
		}
		:host(.stack) {
			display: block;
			min-width: 0;
		}
		.extension-error {
			font-size: 0.8rem;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContributionOutletComponent {
	readonly contribution = input.required<ResolvedContribution>();
	readonly context = input<unknown>(null);
	readonly diagnostic = signal<ExtensionDiagnostic | null>(null);
	private readonly outlet = viewChild('outlet', { read: ViewContainerRef });
	private readonly tasks = inject(PendingTasks);
	private readonly rendered = signal<ComponentRef<unknown> | null>(null);
	private readonly definition = computed(() => this.contribution(), {
		equal: (a, b) =>
			a.component === b.component &&
			a.loadComponent === b.loadComponent &&
			sameInputs(a.inputs, b.inputs),
	});

	constructor() {
		effect((onCleanup) => {
			const item = this.definition();
			const outlet = this.outlet();
			if (!outlet) return;
			let active = true;
			let reference: ComponentRef<unknown> | null = null;
			let releasePending: (() => void) | undefined;
			const finishPending = (): void => {
				const release = releasePending;
				releasePending = undefined;
				release?.();
			};
			this.diagnostic.set(null);
			this.rendered.set(null);
			const show = (component: Type<unknown>): void => {
				if (!active) return;
				try {
					const mirror = reflectComponentType(component);
					const inputs = new Set(mirror?.inputs.map((entry) => entry.templateName));
					if (
						!mirror ||
						!inputs.has('context') ||
						Object.keys(item.inputs ?? {}).some((key) => !inputs.has(key))
					) {
						throw new Error('Contribution inputs do not match its component.');
					}
					reference = outlet.createComponent(component);
					for (const [key, value] of Object.entries(item.inputs ?? {}))
						reference.setInput(key, value);
					reference.setInput('context', untracked(this.context));
					reference.changeDetectorRef.detectChanges();
					this.rendered.set(reference);
				} catch {
					this.destroy(reference, item);
					reference = null;
					this.fail(item);
				}
			};
			if (item.component) untracked(() => show(item.component));
			else {
				releasePending = this.tasks.add();
				Promise.resolve()
					.then(() => item.loadComponent())
					.then(show)
					.catch(() => {
						if (active) this.fail(item);
					})
					.finally(finishPending);
			}
			onCleanup(() => {
				active = false;
				finishPending();
				this.destroy(reference, item);
			});
		});
		effect(() => {
			const reference = this.rendered();
			const context = this.context();
			if (!reference || reference.hostView.destroyed) return;
			try {
				reference.setInput('context', context);
				untracked(() => reference.changeDetectorRef.detectChanges());
			} catch {
				this.destroy(reference, untracked(this.contribution));
				this.rendered.set(null);
				this.fail(untracked(this.contribution));
			}
		});
	}

	async canDeactivate(departure: ViewDeparture): Promise<boolean> {
		const reference = this.rendered();
		const instance = reference?.instance as Partial<GuardedView> | undefined;
		if (typeof instance?.canDeactivate !== 'function') return true;
		try {
			return (
				(await instance.canDeactivate(departure)) === true &&
				this.rendered() === reference &&
				!reference?.hostView.destroyed
			);
		} catch {
			return false;
		}
	}

	hasPendingChanges(): boolean {
		const instance = this.rendered()?.instance as Partial<GuardedView> | undefined;
		try {
			return instance?.hasPendingChanges?.() === true;
		} catch {
			return true;
		}
	}

	private destroy(reference: ComponentRef<unknown> | null, item: ResolvedContribution): void {
		if (!reference || reference.hostView.destroyed) return;
		try {
			reference.destroy();
		} catch {
			this.fail(item);
		}
	}

	private fail(item: ResolvedContribution): void {
		const current = untracked(this.contribution);
		const owner = current.key === item.key ? current : item;
		this.diagnostic.set({
			code: 'render-failed',
			extensionId: owner.extensionId,
			slot: owner.slot,
			contributionId: owner.id,
			message: 'Contribution could not be loaded or initialized.',
		});
	}
}
