import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DocumentCreateContext } from '@maretha/webui-sdk';

/**
 * Shortcut in the floating create button's tray. `context.create(type)` opens the host's editor
 * for the current folder; custom/index.ts shows the shortcut only where Contract is an allowed
 * type, and the host rechecks the parent and the type before opening.
 */
@Component({
	selector: 'acme-create-contract',
	template: `<button type="button" [disabled]="context().noEdit || context().busy" (click)="run()">
		New contract
	</button>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeCreateContractComponent {
	readonly context = input.required<DocumentCreateContext>();

	run(): void {
		this.context().create('Contract');
	}
}
