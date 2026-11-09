import { Component, forwardRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DocumentViewsComponent, WebUiMessages } from '@maretha/webui-sdk';
import { Subject } from 'rxjs';
import { AutomationsService } from '../../../helpers/automations.service';
import { StandardDocumentPublishComponent } from './standard-document-publish.component';

@Component({
	selector: 'nx-paired-views',
	template: '',
	providers: [
		{ provide: DocumentViewsComponent, useExisting: forwardRef(() => GuardedPublishView) },
	],
})
class GuardedPublishView {
	readonly canDeactivate = jasmine.createSpy('canDeactivate').and.resolveTo(false);
}

describe('Standard document publish dialog', () => {
	it('keeps manual close guarded but dismisses only its committed publication without the discard guard', async () => {
		const published = new Subject<{
			documentUid: string;
			targetUid: string;
			repository?: string;
		}>();
		TestBed.configureTestingModule({
			imports: [StandardDocumentPublishComponent],
			providers: [
				{ provide: AutomationsService, useValue: { documentPublished$: published } },
				{
					provide: WebUiMessages,
					useValue: { text: (_key: string, fallback: string) => fallback },
				},
			],
		}).overrideComponent(StandardDocumentPublishComponent, {
			set: {
				imports: [GuardedPublishView],
				template: '<dialog #dialog>@if (snapshot()) { <nx-paired-views /> }</dialog>',
			},
		});
		const fixture = TestBed.createComponent(StandardDocumentPublishComponent);
		fixture.componentRef.setInput('context', {
			noEdit: false,
			standardHeaderActions: true,
			document: {
				uid: 'note',
				type: 'Note',
				repository: 'secondary',
				facets: ['Publishable'],
				contextParameters: { permissions: ['WriteVersion'] },
			},
		});
		fixture.detectChanges();
		const component = fixture.componentInstance;
		expect(component.label).toBe('Publish');
		component.open();
		fixture.detectChanges();
		const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
		const guard = fixture.debugElement.query(By.directive(GuardedPublishView))
			.componentInstance as GuardedPublishView;
		expect(dialog.open).toBeTrue();
		await component.close();
		expect(dialog.open).toBeTrue();
		expect(guard.canDeactivate).toHaveBeenCalledTimes(1);
		published.next({ documentUid: 'another-note', targetUid: 'section' });
		await Promise.resolve();
		expect(dialog.open).toBeTrue();
		published.next({ documentUid: 'note', targetUid: 'section', repository: 'default' });
		await Promise.resolve();
		expect(dialog.open).toBeTrue();
		published.next({ documentUid: 'note', targetUid: 'section', repository: 'secondary' });
		await Promise.resolve();
		expect(dialog.open).toBeFalse();
		expect(component.snapshot()).toBeNull();
		expect(guard.canDeactivate).toHaveBeenCalledTimes(1);
		component.open();
		fixture.detectChanges();
		const nextGuard = fixture.debugElement.query(By.directive(GuardedPublishView))
			.componentInstance as GuardedPublishView;
		nextGuard.canDeactivate.and.resolveTo(true);
		await component.close();
		expect(component.snapshot()).toBeNull();
		component.open();
		fixture.detectChanges();
		fixture.componentRef.setInput('context', { document: { uid: 'changed' }, noEdit: true });
		fixture.detectChanges();
		expect(component.snapshot()).toBeNull();
		expect(dialog.open).toBeFalse();
	});
});
