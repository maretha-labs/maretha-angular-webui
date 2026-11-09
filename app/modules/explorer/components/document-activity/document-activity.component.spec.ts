import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import {
	faFilter,
	faUser,
	faCalendar,
	faTimes,
	faSpinner,
} from '@fortawesome/free-solid-svg-icons';
import { of, Subject, BehaviorSubject } from 'rxjs';
import { UsersAndGroupsFinderService } from 'app/helpers/users-and-groups-finder.service';
import { DocumentActivityService } from '../../helpers/document-activity.service';
import { DocumentActivityComponent } from './document-activity.component';

describe('DocumentActivityComponent', () => {
	let fixture: ComponentFixture<DocumentActivityComponent>;
	let getActivity: jasmine.Spy;
	let vocabulary: BehaviorSubject<{ types: unknown[]; categories: unknown[] }>;
	let responses: Subject<{ entries: unknown[]; canLoadMore: boolean }>[];
	beforeEach(() => {
		responses = [];
		vocabulary = new BehaviorSubject<{ types: unknown[]; categories: unknown[] }>({
			types: [],
			categories: [],
		});
		getActivity = jasmine.createSpy().and.callFake(() => {
			const response = new Subject<{ entries: unknown[]; canLoadMore: boolean }>();
			responses.push(response);
			return response.asObservable();
		});
		TestBed.configureTestingModule({
			imports: [DocumentActivityComponent, NoopAnimationsModule],
			providers: [
				{
					provide: DocumentActivityService,
					useValue: {
						initialized$: vocabulary,
						getDocumentActivity: getActivity,
					},
				},
				{ provide: UsersAndGroupsFinderService, useValue: { findUsers: () => of([]) } },
			],
		});
		TestBed.inject(FaIconLibrary).addIcons(faFilter, faUser, faCalendar, faTimes, faSpinner);
		fixture = TestBed.createComponent(DocumentActivityComponent);
		fixture.componentRef.setInput('document', { uid: 'one' });
		fixture.detectChanges();
	});
	it('cancels previous document responses and releases subscriptions on destruction', () => {
		fixture.componentRef.setInput('document', { uid: 'two' });
		fixture.detectChanges();
		expect(responses[0].observers.length).toBe(0);
		responses[0].next({ entries: [{ id: 'stale' }], canLoadMore: false });
		expect(fixture.componentInstance.documentActivity).toEqual([]);
		responses[1].next({ entries: [{ id: 'current' }], canLoadMore: false });
		expect(fixture.componentInstance.documentActivity).toEqual([{ id: 'current' }]);
		fixture.destroy();
		expect(responses[1].observers.length).toBe(0);
	});
	it('retries the failed page without skipping entries or repeatedly loading from scroll events', () => {
		responses[0].error(new Error('Network unavailable'));
		expect(fixture.componentInstance.loadingActivities).toBeFalse();
		expect(fixture.componentInstance.currentPage).toBe(1);
		fixture.componentInstance.getDocumentActivity();
		expect(getActivity).toHaveBeenCalledTimes(1);
		fixture.componentInstance.retryActivity();
		expect(getActivity).toHaveBeenCalledWith('one', {}, 1);
		responses[1].next({ entries: [], canLoadMore: false });
		expect(fixture.componentInstance.currentPage).toBe(2);
		expect(fixture.componentInstance.error).toBeNull();
	});
	it('updates retained audit labels from refreshed vocabulary without refetching history', () => {
		responses[0].next({ entries: [{ eventId: 'custom', event: 'Old label' }], canLoadMore: false });
		vocabulary.next({
			types: [{ id: 'custom', displayLabel: 'Etiqueta del servidor' }],
			categories: [],
		});
		expect(
			fixture.componentInstance.eventLabel(fixture.componentInstance.documentActivity[0]),
		).toBe('Etiqueta del servidor');
		vocabulary.next({ types: [{ id: 'custom', displayLabel: 'وسم الخادم' }], categories: [] });
		expect(
			fixture.componentInstance.eventLabel(fixture.componentInstance.documentActivity[0]),
		).toBe('وسم الخادم');
		expect(fixture.componentInstance.eventLabel({ eventId: 'label.loadMore' })).toBe(
			'label.loadMore',
		);
		expect(getActivity).toHaveBeenCalledTimes(1);
	});
});
