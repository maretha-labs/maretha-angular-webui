import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	inject,
	input,
	provideZonelessChangeDetection,
	signal,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
	defineContribution,
	defineDocumentView,
	DOCUMENT_VIEWS_PAGES_SLOT,
	DocumentViewContext,
	DocumentViewsComponent,
	ExtensionRegistry,
	GuardedView,
	provideWebUiExtensions,
} from '@maretha/webui-sdk';

@Component({
	selector: 'nx-client-summary',
	template: '<h2>Default summary</h2><p>{{ context().document?.["title"] }}</p>',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
class Summary {
	readonly context = input.required<DocumentViewContext>();
}
@Component({
	selector: 'nx-client-replacement',
	template:
		'<h2>Client replacement</h2><p>This page replaces the default using the public package.</p>',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
class Replacement {
	readonly context = input.required<DocumentViewContext>();
}
@Component({
	selector: 'nx-client-editor',
	template: `<h2>Client draft</h2>
		<label
			>Draft title <input [value]="draft()" (input)="draft.set($any($event.target).value)"
		/></label>
		<label
			><input
				type="checkbox"
				[checked]="keepOpen()"
				(change)="keepOpen.set($any($event.target).checked)"
			/>Prevent leaving this tab while the draft is non-empty</label
		>
		<p>The draft survives tab switches. Clear the draft before closing this example.</p>
		<button (click)="draft.set('')">Clear draft</button>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
class ClientEditor implements GuardedView {
	readonly context = input.required<DocumentViewContext>();
	readonly draft = signal('');
	readonly keepOpen = signal(false);
	canDeactivate(): Promise<boolean> {
		return Promise.resolve(!this.keepOpen() || !this.draft());
	}
	hasPendingChanges(): boolean {
		return !!this.draft();
	}
}

@Component({
	selector: 'nx-client-app',
	imports: [DocumentViewsComponent],
	template: `<main>
		<h1>Client-owned WebUI assembly</h1>
		<p>Built from the packaged Maretha SDK with no application-source imports. Sample data only.</p>
		<nav aria-label="Client customization">
			<button (click)="toggleHidden()">{{ hidden() ? 'Restore summary' : 'Hide summary' }}</button>
			<button (click)="toggleReplacement()">
				{{ replaced() ? 'Restore default page' : 'Replace summary' }}
			</button>
			<button (click)="toggleOrder()">
				{{ first() ? 'Restore tab order' : 'Move draft first' }}
			</button>
		</nav>
		<nx-document-views [context]="context" />
	</main>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
class ClientApp {
	private readonly registry = inject(ExtensionRegistry);
	readonly context: DocumentViewContext = {
		document: { uid: 'sample-contract', type: 'Contract', title: 'Example service agreement' },
		noEdit: false,
	};
	readonly hidden = signal(false);
	readonly replaced = signal(false);
	readonly first = signal(false);
	private restoreHidden?: () => void;
	private restoreReplacement?: () => void;
	private restoreOrder?: () => void;
	constructor() {
		inject(DestroyRef).onDestroy(() => {
			this.restoreHidden?.();
			this.restoreReplacement?.();
			this.restoreOrder?.();
		});
	}
	toggleHidden(): void {
		if (this.hidden()) this.restoreHidden?.();
		else
			this.restoreHidden = this.registry.register({
				id: 'client.hide',
				overrides: ['DOCUMENT_VIEWS_ITEMS', 'DOCUMENT_VIEWS_PAGES'].map((slot) => ({
					slot,
					id: 'base.summary',
					disabled: true,
				})),
			});
		this.hidden.update((value) => !value);
	}
	toggleReplacement(): void {
		if (this.replaced()) this.restoreReplacement?.();
		else
			this.restoreReplacement = this.registry.register({
				id: 'client.replace',
				contributions: [
					defineContribution(DOCUMENT_VIEWS_PAGES_SLOT, {
						id: 'base.summary',
						pairKey: 'summary',
						component: Replacement,
					}),
				],
			});
		this.replaced.update((value) => !value);
	}
	toggleOrder(): void {
		if (this.first()) this.restoreOrder?.();
		else
			this.restoreOrder = this.registry.register({
				id: 'client.order',
				overrides: [{ slot: 'DOCUMENT_VIEWS_ITEMS', id: 'client.editor', order: 0 }],
			});
		this.first.update((value) => !value);
	}
}

void bootstrapApplication(ClientApp, {
	providers: [
		provideZonelessChangeDetection(),
		provideWebUiExtensions(
			{
				id: 'base',
				contributions: defineDocumentView({
					id: 'base.summary',
					viewId: 'summary',
					label: 'Summary',
					order: 10,
					component: Summary,
				}),
			},
			{
				id: 'client',
				contributions: defineDocumentView({
					id: 'client.editor',
					viewId: 'draft',
					label: 'Client draft',
					order: 20,
					retain: true,
					component: ClientEditor,
				}),
			},
		),
	],
});
