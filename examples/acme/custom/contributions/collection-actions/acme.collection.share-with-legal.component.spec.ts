import { TestBed } from '@angular/core/testing';
import type { ResultsToolbarContext } from '@maretha/webui-sdk';
import { AcmeCollectionShareWithLegalComponent } from './acme.collection.share-with-legal.component';

describe('AcmeCollectionShareWithLegalComponent', () => {
	it('shares the current collection', () => {
		const reportMessage = jasmine.createSpy('reportMessage');
		const fixture = TestBed.createComponent(AcmeCollectionShareWithLegalComponent);
		fixture.componentRef.setInput('context', {
			document: null,
			collection: { uid: 'collection-1', title: 'Leases 2026' },
			noEdit: false,
			reportMessage,
		} as unknown as ResultsToolbarContext);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Share with legal');
		fixture.nativeElement.querySelector('button').click();
		expect(reportMessage).toHaveBeenCalledOnceWith(
			'acme.collection.shared',
			'Collection shared with legal',
		);
	});
});
