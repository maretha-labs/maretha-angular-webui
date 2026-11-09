import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ApplicationRef, ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DocumentNavigationBarComponent } from './document-navigation-bar.component';

describe('DocumentNavigationBarComponent', () => {
	let component: DocumentNavigationBarComponent;
	let fixture: ComponentFixture<DocumentNavigationBarComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [DocumentNavigationBarComponent],
		}).compileComponents();
	});

	beforeEach(() => {
		fixture = TestBed.createComponent(DocumentNavigationBarComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	it('renders the compact header as the stock breadcrumb: " > " between ancestors, "..." first when folded', async () => {
		await fixture.whenStable();
		// Let the manager's first (empty) document reach the bar before the test sets its own.
		TestBed.inject(ApplicationRef).tick();
		component.compact = true;
		component.uid = 'doc';
		component.document = { uid: 'doc', title: 'FILE', type: 'File', properties: {} };
		component.breadcrumbs = [
			{ uid: 'domain', title: 'Domain', path: '/default-domain' },
			{ uid: 'workspaces', title: 'Workspaces', path: '/default-domain/workspaces' },
			{ uid: 'doc', title: 'FILE', path: '/default-domain/workspaces/FILE' },
		];
		fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck();
		fixture.detectChanges();
		const element: HTMLElement = fixture.nativeElement;
		const items = () =>
			[...element.querySelectorAll('.document-identity nav li')].map((item) =>
				item.textContent!.trim(),
			);
		expect(items()).toEqual(['Domain', 'Workspaces']);
		expect(element.querySelector('.document-identity nav')!.textContent).not.toContain('›');
		const ancestors = element.querySelectorAll('.document-identity nav li');
		expect(getComputedStyle(ancestors[1], '::before').content).toBe('" > "');
		expect(getComputedStyle(element.querySelector('.document-identity h1')!).fontSize).toBe('17px');
		expect(getComputedStyle(element.querySelector('.document-identity ol')!).fontSize).toMatch(
			/^(9\.75|10\.5)px$/,
		);
		component.collapsedBreadcrumbs = 1;
		fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck();
		fixture.detectChanges();
		expect(items()).toEqual(['...', 'Workspaces']);
	});
});
