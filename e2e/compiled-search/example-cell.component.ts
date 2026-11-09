import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type ResultsProjectionContext } from '@maretha/webui-sdk';

@Component({
	selector: 'nx-fixture-example-cell',
	template: `<span data-testid="example-custom-cell">{{ context().row.title }}</span>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExampleCellComponent {
	readonly context = input.required<ResultsProjectionContext>();
}
