import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { AutomationsService } from '../../../helpers/automations.service';
import { PublishSectionViewComponent } from '../../viewers/publish-section-view.component';

import {
	InternalPublicationComponent,
	STANDARD_PUBLISH_REPOSITORY,
} from './internal-publication.component';

describe('InternalPublicationComponent', () => {
	let component: InternalPublicationComponent;
	let fixture: ComponentFixture<InternalPublicationComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders(), { provide: 'document', useValue: fixtureDocument() }],
			imports: [InternalPublicationComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(InternalPublicationComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});

describe('Scoped publication repository', () => {
	it('supplies the repository override for every opted-in typed document', () => {
		TestBed.configureTestingModule({ imports: [PublishSectionViewComponent] }).overrideComponent(
			PublishSectionViewComponent,
			{ set: { template: '' } },
		);
		const fixture = TestBed.createComponent(PublishSectionViewComponent);
		for (const [type, optedIn, expected] of [
			['Note', true, 'secondary'],
			['Note', false, null],
			['Folder', true, 'secondary'],
			['File', true, 'secondary'],
			['Picture', true, 'secondary'],
			['Contract', true, 'secondary'],
			['Contract', false, null],
		] as const) {
			fixture.componentRef.setInput('context', {
				document: { uid: 'note', type, repository: 'secondary' },
				noEdit: false,
				standardHeaderActions: optedIn,
			});
			fixture.detectChanges();
			expect(fixture.componentInstance.componentInjector().get(STANDARD_PUBLISH_REPOSITORY)).toBe(
				expected,
			);
		}
	});

	for (const scoped of [true, false]) {
		it(`${scoped ? 'forwards the document repository' : 'preserves legacy default requests'} for lookup and publishing`, async () => {
			TestBed.configureTestingModule({
				imports: [InternalPublicationComponent],
				providers: [
					...legacyTestProviders(),
					{
						provide: 'document',
						useValue: { ...fixtureDocument('Note'), repository: 'secondary' },
					},
					{ provide: STANDARD_PUBLISH_REPOSITORY, useValue: scoped ? 'secondary' : null },
				],
			}).overrideComponent(InternalPublicationComponent, { set: { template: '' } });
			const fixture = TestBed.createComponent(InternalPublicationComponent);
			fixture.detectChanges();
			const component = fixture.componentInstance;
			const http = TestBed.inject(HttpTestingController);
			const event = jasmine.createSpy('published');
			const events = TestBed.inject(AutomationsService).documentPublished$.subscribe(event);
			const locations = component.locations$.subscribe();
			component.fetchEntries(null);
			await new Promise((resolve) => setTimeout(resolve, 320));
			const lookup = http.expectOne((request) => request.url.endsWith('/Repository.PageProvider'));
			expect(lookup.request.headers.get('X-NXRepository')).toBe(scoped ? 'secondary' : 'default');
			expect(lookup.request.body.params.repository).toBe(scoped ? 'secondary' : 'default');
			lookup.flush({ entries: [{ uid: 'section', path: '/section', title: 'Section' }] });
			component.editorForm!.patchValue({ location: 'section', overrideExistingPublications: true });
			component.saveChanges();
			const publish = http.expectOne((request) =>
				request.url.endsWith('/Document.PublishToSection'),
			);
			expect(publish.request.headers.get('X-NXRepository')).toBe(scoped ? 'secondary' : 'default');
			expect(publish.request.headers.get('nx-es-sync')).toBe(scoped ? 'true' : null);
			expect(publish.request.body.input).toBe('fixture-document');
			expect(publish.request.body.params.target).toBe('section');
			publish.flush({});
			expect(event).toHaveBeenCalledWith({
				documentUid: 'fixture-document',
				targetUid: 'section',
				...(scoped ? { repository: 'secondary' } : {}),
			});
			expect(component.working).toBeFalse();
			locations.unsubscribe();
			events.unsubscribe();
			http.verify();
		});
	}
});

describe('Internal publication form guards', () => {
	function create(repository: string | null = null) {
		TestBed.configureTestingModule({
			imports: [InternalPublicationComponent],
			providers: [
				...legacyTestProviders(),
				{ provide: 'document', useValue: fixtureDocument() },
				{ provide: STANDARD_PUBLISH_REPOSITORY, useValue: repository },
			],
		}).overrideComponent(InternalPublicationComponent, { set: { template: '' } });
		const fixture = TestBed.createComponent(InternalPublicationComponent);
		fixture.detectChanges();
		return { component: fixture.componentInstance, http: TestBed.inject(HttpTestingController) };
	}
	it('publishes nothing without a location or while a publication is in flight', () => {
		const { component, http } = create();
		component.saveChanges();
		expect(component.isControlInvalid('location')).toBeFalse();
		component.editorForm!.get('location')!.markAsTouched();
		expect(component.isControlInvalid('location')).toBeTrue();
		component.editorForm!.patchValue({ location: 'section', rendition: 'pdf' });
		expect(component.isControlInvalid('location')).toBeFalse();
		component.saveChanges();
		component.saveChanges();
		const publish = http.expectOne((request) => request.url.endsWith('/Document.PublishToSection'));
		expect(publish.request.body.params.renditionName).toBe('pdf');
		publish.flush({}, { status: 403, statusText: 'Forbidden' });
		expect(component.working).toBeFalse();
		expect(String(component.error)).toContain('Publication failed');
		http.verify();
	});
	it('requests the section list once and recovers from a scoped lookup failure with an empty list', async () => {
		const { component, http } = create('secondary');
		const lists: unknown[] = [];
		const subscription = component.locations$.subscribe((x) => lists.push(x));
		component.fetchEntries(null);
		component.fetchEntries(null);
		await new Promise((resolve) => setTimeout(resolve, 320));
		const lookup = http.expectOne((request) => request.url.endsWith('/Repository.PageProvider'));
		expect(component.loading).toBeTrue();
		lookup.flush({}, { status: 500, statusText: 'Server error' });
		expect(component.loading).toBeFalse();
		expect(lists).toEqual([[], []]);
		subscription.unsubscribe();
		http.verify();
	});
});
