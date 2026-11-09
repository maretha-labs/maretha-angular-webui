import {
	ChangeDetectionStrategy,
	Component,
	inject,
	input,
	provideZoneChangeDetection,
	signal,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideDefaultUserMenu } from '../app/modules/shared/components/sidebar/user-menu/default-user-menu';
import { UserMenuPreviewComponent } from './user-menu-preview.component';
import {
	defineDocumentView,
	DocumentViewContext,
	DocumentViewsComponent,
	ExtensionRegistry,
} from '@maretha/webui-sdk';

@Component({
	selector: 'nx-preview-content',
	template: `<div class="sample-layout">
		<section class="sample-paper" aria-label="Sample document">
			<span class="sample-stamp">SAMPLE DOCUMENT</span>
			<h2>Master services agreement</h2>
			<p>Northwind Services · Agreement overview</p>
			<hr />
			<p>
				This sample document demonstrates the Angular view component. Its content is fictional and
				is not connected to a Nuxeo repository.
			</p>
			<h3>Scope of services</h3>
			<p>Document management, content review and collaboration.</p>
			<h3>Document details</h3>
			<p>Reference: MSA-2026-014</p>
		</section>
		<aside class="sample-metadata">
			<h2>Metadata</h2>
			<dl>
				<dt>Title</dt>
				<dd>{{ context().document?.['title'] }}</dd>
				<dt>Document type</dt>
				<dd>Contract</dd>
				<dt>State</dt>
				<dd>Draft</dd>
				<dt>Created by</dt>
				<dd>Preview user</dd>
			</dl>
		</aside>
	</div>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
class SampleContentComponent {
	readonly context = input.required<DocumentViewContext>();
}

@Component({
	selector: 'nx-preview-contract',
	template: `<section class="sample-contract">
		<p class="eyebrow">CLIENT-CONTRIBUTED VIEW</p>
		<h2>Contract details</h2>
		<p>This tab is added through the same extension registry used by Maretha WebUI.</p>
		<dl>
			<dt>Contract</dt>
			<dd>{{ context().document?.['title'] }}</dd>
			<dt>Reference</dt>
			<dd>MSA-2026-014</dd>
			<dt>Counterparty</dt>
			<dd>Northwind Services (sample)</dd>
			<dt>Status</dt>
			<dd>Draft</dd>
		</dl>
	</section>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
class SampleContractComponent {
	readonly context = input.required<DocumentViewContext>();
}

@Component({
	selector: 'nx-preview',
	imports: [DocumentViewsComponent, UserMenuPreviewComponent],
	template: `<header class="preview-header">
			<span class="brand-mark" aria-hidden="true">m</span><strong>Maretha WebUI</strong
			><span>Angular 21</span>
		</header>
		<main>
			<div class="preview-notice">
				<strong>Extension preview</strong><span>Sample data · No Nuxeo connection</span>
				<p>
					This renders the working Angular tabs and extension host. The surrounding document content
					is a preview fixture; it is not the complete WebUI.
				</p>
			</div>
			<section class="preview-controls" aria-label="Preview controls">
				<button type="button" (click)="toggleView()">
					{{ viewHidden() ? 'Show View tab' : 'Hide View tab' }}</button
				><button type="button" (click)="toggleContract()">
					{{ contractVisible() ? 'Remove Contract tab' : 'Add Contract tab' }}</button
				><button type="button" (click)="reset()">Restore defaults</button>
			</section>
			<article class="document">
				<div class="document-heading">
					<p>Workspace / Contracts</p>
					<h1>Master services agreement</h1>
					<span class="document-state">Draft</span>
				</div>
				<nx-document-views [context]="context" />
			</article>
			<nx-user-menu-preview />
		</main>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
class PreviewComponent {
	readonly context: DocumentViewContext = {
		document: { uid: 'preview-contract', type: 'Contract', title: 'Master services agreement' },
		noEdit: false,
	};
	readonly contractVisible = signal(true);
	readonly viewHidden = signal(false);
	private readonly registry = inject(ExtensionRegistry);
	private removeContract: () => void;
	private removeHidden: (() => void) | undefined;
	constructor() {
		this.registry.register({
			id: 'preview.defaults',
			contributions: defineDocumentView({
				id: 'preview.content',
				viewId: 'view',
				label: 'View',
				order: 10,
				component: SampleContentComponent,
			}),
		});
		this.removeContract = this.addContract();
	}
	private addContract(): () => void {
		return this.registry.register({
			id: 'preview.client',
			contributions: defineDocumentView({
				id: 'preview.contract',
				viewId: 'contract',
				label: 'Contract',
				order: 20,
				component: SampleContractComponent,
			}),
		});
	}
	toggleContract(): void {
		if (this.contractVisible()) this.removeContract();
		else this.removeContract = this.addContract();
		this.contractVisible.update((value) => !value);
	}
	toggleView(): void {
		if (this.viewHidden()) {
			this.removeHidden?.();
			this.removeHidden = undefined;
		} else
			this.removeHidden = this.registry.register({
				id: 'preview.hidden',
				overrides: ['DOCUMENT_VIEWS_ITEMS', 'DOCUMENT_VIEWS_PAGES'].map((slot) => ({
					slot,
					id: 'preview.content',
					disabled: true,
				})),
			});
		this.viewHidden.update((value) => !value);
	}
	reset(): void {
		if (this.viewHidden()) this.toggleView();
		if (!this.contractVisible()) this.toggleContract();
	}
}

bootstrapApplication(PreviewComponent, {
	providers: [provideZoneChangeDetection(), provideDefaultUserMenu()],
}).catch((error) => console.error(error));
