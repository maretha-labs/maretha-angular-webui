import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { of } from 'rxjs';
import { AddToCollectionDialogComponent } from './add-to-collection-dialog.component';
import { DocumentCollectionsService } from '../../helpers/document-collections.service';

describe('Add to Collection draft', () => {
	let add: jasmine.Spy, create: jasmine.Spy, hide: jasmine.Spy;
	beforeEach(() => {
		add = jasmine.createSpy('addToCollection').and.returnValue(of({}));
		create = jasmine.createSpy('createCollection').and.returnValue(of({ uid: 'created' }));
		hide = jasmine.createSpy('hide');
		TestBed.configureTestingModule({
			imports: [AddToCollectionDialogComponent],
			providers: [
				provideHttpClient(withXhr()),
				provideHttpClientTesting(),
				{ provide: BsModalRef, useValue: { hide } },
				{
					provide: DocumentCollectionsService,
					useValue: { addToCollection: add, createCollection: create },
				},
			],
		}).overrideComponent(AddToCollectionDialogComponent, { set: { template: '', imports: [] } });
	});
	it('does not mutate on selection or Cancel; confirms a single selected collection', fakeAsync(() => {
		const fixture = TestBed.createComponent(AddToCollectionDialogComponent);
		fixture.componentRef.setInput('documents', [{ uid: 'fixture' }]);
		fixture.detectChanges();
		tick(301);
		const http = TestBed.inject(HttpTestingController);
		http
			.expectOne((request) => request.url.endsWith('/user_collections/execute'))
			.flush({ entries: [{ uid: 'target', title: 'Target' }] });
		fixture.componentInstance.selected = { uid: 'target', title: 'Target' };
		expect(add).not.toHaveBeenCalled();
		fixture.componentInstance.close();
		expect(add).not.toHaveBeenCalled();
		void fixture.componentInstance.add();
		tick();
		expect(add).toHaveBeenCalledOnceWith(['fixture'], 'target');
		http.verify();
		fixture.destroy();
	}));
	it('retains optional description for an explicitly confirmed new collection', fakeAsync(() => {
		const fixture = TestBed.createComponent(AddToCollectionDialogComponent);
		fixture.componentRef.setInput('documents', [{ uid: 'fixture' }]);
		fixture.detectChanges();
		tick(301);
		TestBed.inject(HttpTestingController)
			.expectOne((request) => request.url.endsWith('/user_collections/execute'))
			.flush({ entries: [] });
		fixture.componentInstance.selected = fixture.componentInstance.newCollection('New collection');
		fixture.componentInstance.description = 'Fixture description';
		expect(create).not.toHaveBeenCalled();
		void fixture.componentInstance.add();
		tick();
		expect(create).toHaveBeenCalledOnceWith('New collection', 'Fixture description');
		expect(add).toHaveBeenCalledOnceWith(['fixture'], 'created');
		fixture.destroy();
	}));
});
