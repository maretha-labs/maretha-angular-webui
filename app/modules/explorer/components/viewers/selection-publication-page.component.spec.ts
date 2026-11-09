import { TestBed } from '@angular/core/testing';
import { SelectionPublicationService } from '../../helpers/selection-publication.service';
import { SelectionPublicationPageComponent } from './selection-publication-page.component';

describe('Selection publishing page', () => {
	let service: jasmine.SpyObj<SelectionPublicationService>;
	beforeEach(() => {
		service = jasmine.createSpyObj('publication', ['publish', 'destinations']);
		service.destinations.and.resolveTo([
			{ uid: 'section', title: 'Section', path: '/sections/test' },
		]);
		TestBed.configureTestingModule({
			imports: [SelectionPublicationPageComponent],
			providers: [{ provide: SelectionPublicationService, useValue: service }],
		});
	});
	async function render() {
		const fixture = TestBed.createComponent(SelectionPublicationPageComponent);
		fixture.componentRef.setInput('context', {
			document: null,
			noEdit: false,
			selectedDocuments: [
				{ uid: 'one', repository: 'other' },
				{ uid: 'two', repository: 'other' },
			],
		});
		fixture.detectChanges();
		await fixture.componentInstance.findDestinations();
		fixture.componentInstance.target = 'section';
		return fixture;
	}
	it('reports partial completion and retries only unfinished IDs with the pinned target', async () => {
		const f = await render();
		service.publish.and.callFake(async (uid) => {
			if (uid === 'two') throw new Error('Access denied');
		});
		await f.componentInstance.publish();
		expect(f.componentInstance.completed()).toEqual(['one']);
		expect(f.componentInstance.error()).toContain('Access denied');
		service.publish.calls.reset();
		service.publish.and.resolveTo();
		await f.componentInstance.publish();
		expect(service.publish).toHaveBeenCalledOnceWith('two', 'other', 'section', false, undefined);
		expect(f.componentInstance.completed()).toEqual(['one', 'two']);
	});
	it('blocks departure until the current operation settles and stops before the next document', async () => {
		const f = await render();
		let finish!: () => void;
		service.publish.and.returnValue(new Promise<void>((resolve) => (finish = resolve)));
		const done = f.componentInstance.publish();
		expect(f.componentInstance.canDeactivate()).toBeFalse();
		f.componentInstance.stopRequested = true;
		finish();
		await done;
		expect(service.publish).toHaveBeenCalledTimes(1);
		expect(f.componentInstance.completed()).toEqual(['one']);
		expect(f.componentInstance.canDeactivate()).toBeTrue();
	});
	it('shows failed destination lookups without inventing an empty successful result', async () => {
		const f = await render();
		service.destinations.and.rejectWith(new Error('offline'));
		await f.componentInstance.findDestinations();
		expect(f.componentInstance.error()).toContain('could not be loaded');
		expect(f.componentInstance.loading()).toBeFalse();
	});
});
