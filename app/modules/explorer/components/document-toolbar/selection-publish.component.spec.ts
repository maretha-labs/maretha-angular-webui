import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DocumentViewsComponent, WebUiMessages } from '@maretha/webui-sdk';
import { SelectionPublishComponent } from './selection-publish.component';

const publishable = (uid: string, repository = 'default') => ({
	uid,
	repository,
	title: 'Customer {title}',
	facets: ['Publishable'],
	contextParameters: { permissions: ['WriteVersion'] },
});

describe('Selection publication dialog', () => {
	it('captures a deduplicated immutable selection and relocalizes without reopening or replacing it', async () => {
		TestBed.configureTestingModule({ imports: [SelectionPublishComponent] });
		const fixture = TestBed.createComponent(SelectionPublishComponent);
		const first = publishable('first');
		fixture.componentRef.setInput('context', {
			selectedDocuments: [first, first, publishable('second')],
			busy: false,
			noEdit: false,
		});
		fixture.detectChanges();
		const dialog: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
		const open = spyOn(dialog, 'showModal').and.callThrough();
		fixture.nativeElement.querySelector('.selection-icon-action').click();
		fixture.detectChanges();
		const snapshot = fixture.componentInstance.snapshot()!;
		expect(snapshot.selectedDocuments?.map((document) => document['uid'])).toEqual([
			'first',
			'second',
		]);
		first.title = 'Changed after opening';
		expect(snapshot.selectedDocuments?.[0]['title']).toBe('Customer {title}');
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', {
			ro: {
				'app.modules.selection-publish.publish-selection-cca260': 'Publicați selecția',
				'app.modules.selection-publish.close-3f2518': 'Închideți',
				'app.modules.selection-publish.publish-destinations-fdc9a4': 'Destinații de publicare',
			},
		});
		messages.locale.set('ro');
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('h2').textContent).toContain('Publicați selecția');
		expect(
			fixture.nativeElement.querySelector('.selection-icon-action').getAttribute('aria-label'),
		).toBe('Publicați selecția');
		expect(fixture.componentInstance.snapshot()).toBe(snapshot);
		expect(open).toHaveBeenCalledTimes(1);
		const views = fixture.debugElement.query(By.directive(DocumentViewsComponent))
			.componentInstance as DocumentViewsComponent;
		const guard = spyOn(views, 'canDeactivate').and.resolveTo(false);
		await fixture.componentInstance.close();
		expect(dialog.open).toBeTrue();
		expect(fixture.componentInstance.snapshot()).toBe(snapshot);
		guard.and.resolveTo(true);
		await fixture.componentInstance.close();
		expect(dialog.open).toBeFalse();
		expect(fixture.componentInstance.snapshot()).toBeNull();
	});
	it('rejects read-only, busy, empty, unpublishable and mixed-repository selections before opening', () => {
		TestBed.configureTestingModule({ imports: [SelectionPublishComponent] });
		const fixture = TestBed.createComponent(SelectionPublishComponent);
		fixture.componentRef.setInput('context', { selectedDocuments: [], busy: false, noEdit: false });
		fixture.detectChanges();
		const open = spyOn(fixture.nativeElement.querySelector('dialog'), 'showModal');
		for (const context of [
			{ selectedDocuments: [publishable('one')], busy: true, noEdit: false },
			{ selectedDocuments: [publishable('one')], busy: false, noEdit: true },
			{ selectedDocuments: [], busy: false, noEdit: false },
			{ selectedDocuments: [{ uid: 'unpublishable' }], busy: false, noEdit: false },
			{
				selectedDocuments: [publishable('one'), publishable('two', 'other')],
				busy: false,
				noEdit: false,
			},
		]) {
			fixture.componentRef.setInput('context', context);
			fixture.detectChanges();
			fixture.componentInstance.open();
		}
		expect(open).not.toHaveBeenCalled();
		expect(fixture.componentInstance.snapshot()).toBeNull();
	});
});
