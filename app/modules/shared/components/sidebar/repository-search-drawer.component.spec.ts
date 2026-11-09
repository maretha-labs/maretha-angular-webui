import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AssetsSearchQueueService } from 'app/modules/search/helpers/assets-search-queue.service';
import { RepositorySearchHosts } from 'app/modules/search/helpers/repository-search-hosts.service';
import { AssetsSearchQueueComponent } from 'app/modules/search/components/search-queue/assets-search-queue.component';
import { RepositorySearchComponent } from 'app/modules/search/components/repository-search/repository-search.component';
import { RepositorySearchDrawerComponent } from './repository-search-drawer.component';
import { REPOSITORY_SEARCH } from 'app/modules/search/helpers/repository-search-definitions';

@Component({ selector: 'nx-assets-search-queue', template: 'Queue' })
class QueueProbe {}
@Component({ selector: 'nx-repository-search', template: 'Filters' })
class HostProbe {
	definition = input<unknown>();
	context = input<unknown>();
	drawerOnly = input(false);
}
@Component({ selector: 'nx-assets-search-filters', template: 'Shared filters' })
class FiltersProbe {
	search = input<unknown>();
}

describe('Repository search drawer', () => {
	const active = signal(false),
		kind = signal('assets'),
		filtersRequested = signal(false);
	let openDefault: jasmine.Spy;
	beforeEach(() => {
		active.set(false);
		kind.set('assets');
		filtersRequested.set(false);
		openDefault = jasmine.createSpy('openDefault');
		TestBed.configureTestingModule({
			imports: [RepositorySearchDrawerComponent],
			providers: [
				{
					provide: AssetsSearchQueueService,
					useValue: {
						active,
						kind,
						filtersRequested,
						openDefault,
					},
				},
			],
		});
		TestBed.overrideComponent(RepositorySearchDrawerComponent, {
			remove: {
				imports: [AssetsSearchQueueComponent, RepositorySearchComponent],
			},
			add: { imports: [QueueProbe, HostProbe] },
		});
	});
	it('reuses the mounted result host draft and aggregation state through its lazy form, falling back to the same filters-only host', async () => {
		const fixture = TestBed.createComponent(RepositorySearchDrawerComponent);
		const context = { user: { id: 'test' }, noEdit: false, document: null };
		fixture.componentRef.setInput('context', context);
		const loadForm = jasmine.createSpy('loadForm').and.resolveTo(FiltersProbe);
		fixture.componentRef.setInput('definition', {
			...REPOSITORY_SEARCH.assets,
			form: { ...REPOSITORY_SEARCH.assets.form, loadComponent: loadForm },
		});
		fixture.detectChanges();
		const standalone = fixture.debugElement.query(By.directive(HostProbe))
			.componentInstance as HostProbe;
		expect(standalone.drawerOnly()).toBeTrue();
		expect(standalone.context()).toBe(context);
		expect(loadForm).not.toHaveBeenCalled();
		const host = { text: 'unchanged draft' } as unknown as RepositorySearchComponent;
		const unregister = TestBed.inject(RepositorySearchHosts).register('assets', host);
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(loadForm).toHaveBeenCalledTimes(1);
		expect(fixture.debugElement.query(By.directive(HostProbe))).toBeNull();
		expect(fixture.debugElement.query(By.directive(FiltersProbe)).componentInstance.search()).toBe(
			host,
		);
		unregister();
		fixture.detectChanges();
		expect(fixture.debugElement.query(By.directive(HostProbe))).toBeTruthy();
	});
	it('keeps Assets and Expired queues scoped to their own rail item', () => {
		const fixture = TestBed.createComponent(RepositorySearchDrawerComponent);
		fixture.componentRef.setInput('context', {});
		fixture.componentRef.setInput('definition', REPOSITORY_SEARCH.expired);
		active.set(true);
		kind.set('expired');
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('nx-assets-search-queue')).toBeTruthy();
		fixture.componentRef.setInput('definition', REPOSITORY_SEARCH.assets);
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('nx-assets-search-queue')).toBeNull();
	});
	it('opens the Expired drawer on its default queue once per signed-in user, scoped to the browsed repository', () => {
		const fixture = TestBed.createComponent(RepositorySearchDrawerComponent);
		fixture.componentRef.setInput('definition', REPOSITORY_SEARCH.expired);
		fixture.componentRef.setInput('context', { document: null });
		fixture.detectChanges();
		expect(openDefault).not.toHaveBeenCalled();
		fixture.componentRef.setInput('context', {
			user: { id: 'test' },
			document: { repository: 'archive' },
		});
		fixture.detectChanges();
		expect(openDefault).toHaveBeenCalledOnceWith('test', 'archive', 'expired');
		active.set(true);
		kind.set('expired');
		fixture.componentRef.setInput('context', { user: { id: 'test' }, document: null });
		fixture.detectChanges();
		expect(openDefault).toHaveBeenCalledTimes(1);
		expect(fixture.nativeElement.classList.contains('showing-queue')).toBeTrue();
	});
	it('never swaps the filter form for the queue once the user asked for filters or the results page is mounted', () => {
		const fixture = TestBed.createComponent(RepositorySearchDrawerComponent);
		fixture.componentRef.setInput('definition', REPOSITORY_SEARCH.expired);
		filtersRequested.set(true);
		fixture.componentRef.setInput('context', { user: { id: 'test' }, document: null });
		fixture.detectChanges();
		expect(openDefault).not.toHaveBeenCalled();
		filtersRequested.set(false);
		const unregister = TestBed.inject(RepositorySearchHosts).register(
			'expired',
			{} as unknown as RepositorySearchComponent,
		);
		fixture.detectChanges();
		expect(openDefault).not.toHaveBeenCalled();
		unregister();
		fixture.detectChanges();
		expect(openDefault).toHaveBeenCalledOnceWith('test', 'default', 'expired');
		fixture.componentRef.setInput('definition', REPOSITORY_SEARCH.assets);
		fixture.componentRef.setInput('context', { user: { id: 'other' }, document: null });
		fixture.detectChanges();
		expect(openDefault).toHaveBeenCalledTimes(1);
	});
});
