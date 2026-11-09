import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { config, of, throwError } from 'rxjs';
import { documentUrl } from 'app/helpers/document-route';
import { DocumentCollectionsService } from 'app/modules/explorer/helpers/document-collections.service';

import { CollectionsComponent } from './collections.component';

describe('CollectionsComponent', () => {
	let component: CollectionsComponent;
	let fixture: ComponentFixture<CollectionsComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				{ provide: 'documents', useValue: [fixtureDocument()] },
			],
			imports: [CollectionsComponent],
		}).compileComponents();
	});

	beforeEach(() => {
		fixture = TestBed.createComponent(CollectionsComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});

describe('Collections popover behaviour', () => {
	const favorites = { uid: 'fav', type: 'Favorites', title: 'Favorites', totalCount: 1 };
	const shared = {
		uid: 'shared',
		type: 'Collection',
		title: 'Shared',
		totalCount: 2,
		repository: 'secondary',
		path: '/shared',
	};
	function setup(editMode = false, callback?: jasmine.Spy) {
		TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				{
					provide: 'documents',
					useValue: [fixtureDocument(), { ...fixtureDocument(), uid: 'two' }],
				},
				{ provide: 'editMode', useValue: editMode },
				...(callback ? [{ provide: 'collectionSelected', useValue: callback }] : []),
			],
			imports: [CollectionsComponent],
		}).overrideComponent(CollectionsComponent, { set: { template: '' } });
		const service = TestBed.inject(DocumentCollectionsService);
		spyOn(service, 'loadCollections').and.returnValue(
			of([{ ...favorites }, { ...shared }, { uid: 'local', type: 'Collection', totalCount: 0 }]),
		);
		const fixture = TestBed.createComponent(CollectionsComponent);
		fixture.detectChanges();
		return { component: fixture.componentInstance, service, fixture };
	}
	it('lists the loaded collections and follows membership counts for the matching repository', () => {
		const { component, service } = setup();
		expect(component.loading).toBeFalse();
		expect(component.allDocumentCollections.map((x) => x.uid)).toEqual(['fav', 'shared', 'local']);
		service.documentsAddedToCollection$.next({
			documentUids: ['a'],
			collectionUid: 'shared',
			collectionTotalCount: 5,
			repository: 'default',
		} as never);
		expect(component.allDocumentCollections[1].totalCount).toBe(2);
		service.documentsAddedToCollection$.next({
			documentUids: ['a'],
			collectionUid: 'shared',
			collectionTotalCount: 5,
			repository: 'secondary',
		} as never);
		expect(component.allDocumentCollections[1].totalCount).toBe(5);
		service.documentsAddedToCollection$.next({
			documentUids: ['a'],
			collectionUid: 'local',
			collectionTotalCount: 1,
		} as never);
		expect(component.allDocumentCollections[2].totalCount).toBe(1);
		service.documentsRemovedFromCollection$.next({
			documentUids: ['a'],
			collectionUid: 'local',
		} as never);
		expect(component.allDocumentCollections[2].totalCount).toBe(1);
		service.documentsRemovedFromCollection$.next({
			documentUids: ['a'],
			collectionUid: 'local',
			collectionTotalCount: 0,
			repository: 'default',
		} as never);
		expect(component.allDocumentCollections[2].totalCount).toBe(0);
		service.documentCollectionsUpdated$.next([favorites]);
		expect(component.allDocumentCollections).toEqual([favorites]);
		expect(component.trackByFn(shared)).toBe('shared');
	});
	it('opens the chosen collection in browse mode and notifies the optional callback', () => {
		const callback = jasmine.createSpy('collectionSelected');
		const { component } = setup(false, callback);
		const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
		component.collectionSelected(shared);
		expect(callback).toHaveBeenCalledOnceWith(shared);
		expect(navigate).toHaveBeenCalledOnceWith(documentUrl(shared));
	});
	it('adds the documents to the chosen collection in edit mode, toggling favorites specially', () => {
		const { component, service } = setup(true);
		const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl');
		const add = spyOn(service, 'addToCollection').and.returnValue(of(undefined) as never);
		const favorite = spyOn(service, 'toggleFavoriteDocument').and.returnValue(
			of(undefined) as never,
		);
		component.collectionSelected(shared);
		expect(add).toHaveBeenCalledOnceWith(['fixture-document', 'two'], 'shared');
		component.collectionSelected(favorites);
		expect(favorite).toHaveBeenCalledOnceWith(['fixture-document', 'two'], true);
		expect(navigate).not.toHaveBeenCalled();
	});
	it('creates a collection from the typed title before adding, reporting either failure', async () => {
		const { component, service } = setup(true);
		// The popover reports failures through toasts and rethrows for callers; keep the rethrow
		// out of the global error channel so the assertions below own the verdict.
		const unhandled = jasmine.createSpy('unhandled');
		const previous = config.onUnhandledError;
		config.onUnhandledError = unhandled;
		const toastr = spyOn(TestBed.inject(ToastrService), 'error');
		const create = spyOn(service, 'createCollection').and.returnValue(of({ uid: 'created' }));
		const add = spyOn(service, 'addToCollection').and.returnValue(
			throwError(() => new Error('denied')) as never,
		);
		component.form!.patchValue({ title: 'Quarterly' });
		component.addToCollection();
		expect(create).toHaveBeenCalledOnceWith('Quarterly');
		expect(add).toHaveBeenCalledOnceWith(['fixture-document', 'two'], 'created');
		expect(toastr).toHaveBeenCalledOnceWith(
			'Failed to add the specified documents to the “Quarterly” collection.',
			'Error updating collection',
			{ enableHtml: false },
		);
		create.and.returnValue(throwError(() => new Error('conflict')));
		component.addToCollection();
		expect(add).toHaveBeenCalledTimes(1);
		expect(toastr).toHaveBeenCalledWith(
			'Failed to create the “Quarterly” collection.',
			'Error creating collection',
			{ enableHtml: false },
		);
		expect(toastr).toHaveBeenCalledTimes(3);
		// rxjs reports unhandled subscriber errors on a timer.
		await new Promise((resolve) => setTimeout(resolve));
		config.onUnhandledError = previous;
		expect(unhandled).toHaveBeenCalledTimes(2);
	});
});
