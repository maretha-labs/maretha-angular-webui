import { ChangeDetectionStrategy, Component, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PlaceholderTemplateDirective } from './placeholder-template.directive';

@Component({
	selector: 'nx-placeholder-test-host',
	imports: [PlaceholderTemplateDirective],
	template: '<ng-template nxPlaceholderTemplate>Empty folder</ng-template>',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
class PlaceholderTestHost {
	readonly placeholder = viewChild.required(PlaceholderTemplateDirective);
}

describe('PlaceholderTemplateDirective', () => {
	it('exposes the supplied template for placeholder rendering', () => {
		const fixture = TestBed.createComponent(PlaceholderTestHost);
		fixture.detectChanges();
		const directive = fixture.componentInstance.placeholder();
		const view = directive.template.createEmbeddedView({});

		try {
			view.detectChanges();
			expect(view.rootNodes.map((node: Node) => node.textContent).join('')).toBe('Empty folder');
		} finally {
			view.destroy();
		}
	});
});
