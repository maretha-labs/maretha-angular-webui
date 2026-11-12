import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { DocumentCollectionsService } from 'app/modules/explorer/helpers/document-collections.service';
import { FavoritesDrawerComponent } from './favorites-drawer.component';
import { ResultsPagingSettings } from '@maretha/webui-sdk';

describe('Favorites drawer navigation', () => {
	const member = (uid: string) => ({ uid, title: uid, repository: 'secondary' });
	const members = (request: { url: string }) =>
		request.url.endsWith('/default_content_collection/execute');
	beforeEach(() => {
		TestBed.configureTestingModule({
			imports: [FavoritesDrawerComponent],
			providers: [
				provideHttpClient(withXhr()),
				provideHttpClientTesting(),
				{
					provide: Router,
					useValue: {
						url: '/browse',
						navigateByUrl: jasmine.createSpy('navigateByUrl').and.resolveTo(true),
					},
				},
				{
					provide: DocumentCollectionsService,
					useValue: {
						documentsAddedToCollection$: new Subject(),
						documentsRemovedFromCollection$: new Subject(),
					},
				},
			],
		}).overrideComponent(FavoritesDrawerComponent, {
			set: {
				template: `
			<div (keydown)="navigateKeys($event)">
				@for (document of documents(); track document.uid) {
					<div class="favorite-row"><button class="open-document" [attr.data-row-uid]="document.uid">{{ document.title }}</button></div>
				}
			</div>`,
			},
		});
	});
	afterEach(() => TestBed.inject(HttpTestingController).verify());
	async function setup() {
		const fixture = TestBed.createComponent(FavoritesDrawerComponent);
		const navigate = jasmine.createSpy('legacyCloseNavigation');
		fixture.componentRef.setInput('context', {
			user: { id: 'user' },
			document: member('workspace'),
			noEdit: false,
			navigate,
		});
		fixture.detectChanges();
		const http = TestBed.inject(HttpTestingController);
		http
			.expectOne((request) => request.url.endsWith('/Favorite.Fetch'))
			.flush({ uid: 'favorites' });
		await Promise.resolve();
		http.expectOne(members).flush({ entries: [member('first')], isNextPageAvailable: true });
		await fixture.whenStable();
		fixture.detectChanges();
		return { fixture, http, component: fixture.componentInstance, navigate };
	}
	it('retains favorites and a retryable message after a rejected navigation promise', async () => {
		const { component } = await setup();
		const navigate = TestBed.inject(Router).navigateByUrl as jasmine.Spy;
		navigate.and.rejectWith(new Error('offline'));
		await component.open(component.documents()[0]);
		expect(component.navigationError()).toContain('Try again');
		expect(component.documents().map((row) => row.uid)).toEqual(['first']);
		navigate.and.resolveTo(true);
		await component.open(component.documents()[0]);
		expect(component.navigationError()).toBe('');
	});
	it('keeps the drawer list while navigating and after a rejected route guard', async () => {
		const { component, navigate } = await setup();
		await component.open(component.documents()[0]);
		expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith(
			'/browse/documents/first?repository=secondary',
		);
		expect(navigate).not.toHaveBeenCalled();
		(TestBed.inject(Router).navigateByUrl as jasmine.Spy).and.resolveTo(false);
		await component.open(component.documents()[0]);
		expect(component.navigationError()).toContain('cancelled');
		expect(component.documents().map((row) => row.uid)).toEqual(['first']);
	});
	it('loads on scroll only while enabled and keeps explicit paging available', async () => {
		const { fixture, http, component } = await setup();
		const event = {
			target: { scrollHeight: 1000, scrollTop: 500, clientHeight: 500 },
		} as unknown as Event;
		const settings = TestBed.inject(ResultsPagingSettings);
		component.onScroll(event);
		http.expectNone(members);
		component.loadMore();
		http.expectOne(members).flush({ entries: [member('second')], isNextPageAvailable: true });
		await fixture.whenStable();
		settings.apply({ scrollPagingEnabled: true });
		component.onScroll(event);
		const next = http.expectOne(members);
		expect(next.request.params.get('currentPageIndex')).toBe('2');
		next.flush({ entries: [member('third')], isNextPageAvailable: true });
		await fixture.whenStable();
		settings.apply({ scrollPagingEnabled: false });
		component.onScroll(event);
		http.expectNone(members);
		expect(component.documents().map((row) => row.uid)).toEqual(['first', 'second', 'third']);
	});
	it('loads the next provider page and focuses its first row when moving down past loaded rows', async () => {
		const { fixture, http } = await setup();
		const first = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
		first.focus();
		const event = new KeyboardEvent('keydown', {
			key: 'ArrowDown',
			bubbles: true,
			cancelable: true,
		});
		first.dispatchEvent(event);
		expect(event.defaultPrevented).toBeTrue();
		const next = http.expectOne(members);
		expect(next.request.params.get('currentPageIndex')).toBe('1');
		next.flush({ entries: [member('second')], isNextPageAvailable: false });
		await fixture.whenStable();
		fixture.detectChanges();
		expect(document.activeElement).toBe(
			fixture.nativeElement.querySelector('[data-row-uid="second"]'),
		);
	});
});
