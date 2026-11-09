import { Component, Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ResultsProjectionComponent } from './results-projection.component';
import { ResultsProjectionContext } from './results-projection';
import { provideResultsProjections } from './results-projection-registry';

@Component({
	selector: 'nx-test-contract-card',
	template: '<article class="contract-card">{{ context.row.title }}</article>',
})
class ContractCardComponent {
	@Input() context!: ResultsProjectionContext;
}

describe('provideResultsProjections', () => {
	beforeEach(() =>
		TestBed.configureTestingModule({
			providers: [
				provideResultsProjections({
					id: 'custom.contract.card',
					hostId: 'generic-folderish',
					projection: 'item',
					mode: 'grid',
					when: (context) => (context as ResultsProjectionContext).row.type === 'Contract',
					component: ContractCardComponent,
				}),
			],
		}),
	);

	function render(hostId: string, mode: 'grid' | 'list') {
		const fixture = TestBed.createComponent(ResultsProjectionComponent);
		fixture.componentRef.setInput('hostId', hostId);
		fixture.componentRef.setInput('mode', mode);
		fixture.componentRef.setInput('rows', [
			{ uid: 'one', title: 'Master agreement', type: 'Contract' },
			{ uid: 'two', title: 'Scan', type: 'File' },
		]);
		fixture.detectChanges();
		return fixture.nativeElement as HTMLElement;
	}

	it('replaces the grid card of one document type in one listing', () => {
		const element = render('generic-folderish', 'grid');
		const cards = [...element.querySelectorAll('[role="list"] > * > *')];
		expect(cards.map((card) => card.tagName.toLowerCase())).toEqual([
			'nx-test-contract-card',
			'article',
		]);
		expect(element.querySelector('.contract-card')!.textContent).toBe('Master agreement');
	});

	it('keeps the default cards in other modes and listings', () => {
		expect(render('generic-folderish', 'list').querySelector('.contract-card')).toBeNull();
		expect(render('picturebook-content', 'grid').querySelector('.contract-card')).toBeNull();
	});
});
