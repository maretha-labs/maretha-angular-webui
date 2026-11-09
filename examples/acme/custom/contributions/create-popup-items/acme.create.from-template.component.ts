import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DocumentCreateContext } from '@maretha/webui-sdk';

/**
 * Tab in the create dialog. `types` are the document types allowed in the current folder;
 * `create(type)` opens the host's editor for one of them, after the host rechecks the parent.
 */
@Component({
	selector: 'acme-create-from-template',
	template: `
		<section>
			<h2>From template</h2>
			<ul>
				@for (type of templates(); track type.name) {
					<li>
						<button type="button" [disabled]="context().busy" (click)="context().create(type.name)">
							Standard {{ type.label }}
						</button>
					</li>
				}
			</ul>
		</section>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeCreateFromTemplateComponent {
	readonly context = input.required<DocumentCreateContext>();

	templates(): readonly { name: string; label: string }[] {
		return (this.context().types ?? []).filter((type) =>
			['Contract', 'Invoice'].includes(type.name),
		);
	}
}
