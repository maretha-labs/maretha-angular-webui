import { By } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { BaseEditorComponent } from '../base-editor/base-editor.component';
import { DocumentsManagerService } from '../../../helpers/documents-manager.service';
import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DomainEditorComponent } from './domain-editor.component';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

describe('DomainEditorComponent', () => {
	let component: DomainEditorComponent;
	let fixture: ComponentFixture<DomainEditorComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [DomainEditorComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(DomainEditorComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('documentType', 'Domain');
		fixture.componentRef.setInput('parentDocument', fixtureDocument());
		fixture.componentRef.setInput('documents', [
			fixtureDocument(),
			{ ...fixtureDocument(), uid: 'fixture-second' },
		]);
		fixture.detectChanges();
	});

	it('uses the shared guarded save journey and forwards the created Domain to its host', async () => {
		const base = fixture.debugElement.query(By.directive(BaseEditorComponent))
			.componentInstance as BaseEditorComponent;
		const hide = spyOn(TestBed.inject(BsModalRef), 'hide');
		const title: HTMLInputElement = fixture.nativeElement.querySelector('#title');
		title.value = 'Guarded domain';
		title.dispatchEvent(new Event('input', { bubbles: true }));
		await fixture.whenStable();
		fixture.detectChanges();
		const confirm = spyOn(TestBed.inject(ConfirmDialogService), 'confirm').and.resolveTo(false);
		fixture.nativeElement.querySelector('.modal-header button').click();
		await fixture.whenStable();
		expect(confirm).toHaveBeenCalled();
		expect(hide).not.toHaveBeenCalled();
		const request = new Subject<any>();
		const create = spyOn(TestBed.inject(DocumentsManagerService), 'createDocument').and.returnValue(
			request,
		);
		let saved: any;
		component.save$.subscribe((documents) => (saved = documents));
		fixture.nativeElement.querySelector('.modal-footer button:last-child').click();
		expect(base.working).toBeTrue();
		expect(base.canLeave()).toBeFalse();
		expect(create.calls.mostRecent().args[1]).toBe('Domain');
		const document = {
			uid: 'new-domain',
			type: 'Domain',
			properties: { 'dc:title': 'Guarded domain' },
		};
		request.next(document);
		request.complete();
		expect(saved).toEqual([document]);
		expect(hide).toHaveBeenCalledTimes(1);
		expect(component.editorForm!.pristine).toBeTrue();
	});
	it('renders the Domain source directory and expiration controls', () => {
		expect(
			fixture.nativeElement.querySelector('nx-nature-subjects-coverage-expiration'),
		).not.toBeNull();
		expect(component.editorForm?.contains('natureSubjectsCoverageExpiration')).toBeTrue();
	});
	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
