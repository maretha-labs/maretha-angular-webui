import { NgComponentOutlet } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	PendingTasks,
	TemplateRef,
	Type,
	inject,
	input,
	signal,
} from '@angular/core';
import { WebUiMessagePipe } from '@maretha/webui-sdk';

/** Keep the optional media/PDF viewer in its existing lazy bundle. */
@Component({
	selector: 'nx-extension-document-content',
	imports: [NgComponentOutlet, WebUiMessagePipe],
	template: `@if (renderer(); as component) {
			<ng-container
				*ngComponentOutlet="
					component;
					inputs: {
						document: document(),
						noEdit: noEdit(),
						mainContentTemplate: mainContentTemplate(),
					}
				"
			/>
		} @else if (failed()) {
			<div role="alert">
				{{ 'browse.error' | webuiMessage: 'Could not load document.' }}
				<button type="button" (click)="load()">
					{{ 'command.retry' | webuiMessage: 'Retry' }}
				</button>
			</div>
		}`,
	styles: ':host { display: flex; flex: 1; min-height: 0; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentContentRendererComponent {
	readonly document = input<unknown>();
	readonly noEdit = input(false);
	readonly mainContentTemplate = input<TemplateRef<unknown>>();
	readonly renderer = signal<Type<unknown> | null>(null);
	readonly failed = signal(false);
	private readonly lifetime = inject(DestroyRef);
	private readonly pending = inject(PendingTasks);
	constructor() {
		this.load();
	}
	load(): void {
		this.failed.set(false);
		this.pending.run(async () => {
			try {
				const module =
					await import('../modules/explorer/components/viewers/generic-non-folderish-viewer/generic-non-folderish-viewer.component');
				if (!this.lifetime.destroyed) this.renderer.set(module.GenericNonFolderishViewerComponent);
			} catch {
				if (!this.lifetime.destroyed) this.failed.set(true);
			}
		});
	}
}
