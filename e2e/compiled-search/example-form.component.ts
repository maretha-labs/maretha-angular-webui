import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { RepositorySearchComponent } from 'app/modules/search/components/repository-search/repository-search.component';

/** Deliberately independent of the stock filters: proves the lazy form contract. */
@Component({
	selector: 'nx-fixture-example-form',
	imports: [FormsModule],
	template: `
		<form data-testid="example-custom-form" (ngSubmit)="search().submit()">
			<h2 class="asset-filters-title">Example documents</h2>
			<div class="asset-filter-fields">
				<label
					>Full Text
					<input type="search" name="text" [(ngModel)]="search().text" />
				</label>
			</div>
			<button type="submit" [disabled]="search().loading()">Search</button>
		</form>
	`,
	styles: `
		:host {
			display: block;
			padding: 16px;
		}
		h2,
		label {
			font-size: 13px;
		}
		label {
			display: flex;
			flex-direction: column;
			gap: 8px;
		}
		input {
			font-size: 16px;
			width: 100%;
		}
		button {
			margin-top: 16px;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExampleFormComponent {
	readonly search = input.required<RepositorySearchComponent>();
}
