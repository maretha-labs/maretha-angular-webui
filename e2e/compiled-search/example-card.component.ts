import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { type ResultsProjectionContext } from '@maretha/webui-sdk';
import { DocumentLinkPipe } from 'app/helpers/document-route';

@Component({
	selector: 'nx-fixture-example-card',
	imports: [RouterLink, DocumentLinkPipe],
	template: `
		<article role="listitem" data-testid="example-custom-card">
			<input
				type="checkbox"
				[attr.aria-label]="'Select ' + context().row.title"
				[checked]="context().selected"
				[disabled]="context().loading"
				(change)="context().toggleSelection()"
			/>
			<a [routerLink]="context().row | documentLink" data-nx-results-interactive>{{
				context().row.title
			}}</a>
			<small>{{ context().searchId }}</small>
		</article>
	`,
	styles: `
		:host {
			display: block;
		}
		article {
			display: flex;
			gap: 12px;
			padding: 12px;
			border: 1px solid currentColor;
			font-size: 13px;
		}
		small {
			margin-inline-start: auto;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExampleCardComponent {
	readonly context = input.required<ResultsProjectionContext>();
}
