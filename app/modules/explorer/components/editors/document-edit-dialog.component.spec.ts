import { Component, Input, OnInit, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { StandardContentEditorComponent } from './standard-content-editor.component';
import { BaseEditorComponent } from './base-editor/base-editor.component';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { Router, NavigationEnd } from '@angular/router';
import { ViewNavigation } from '@maretha/webui-sdk';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { NgSelectComponent, NgSelectConfig } from '@ng-select/ng-select';
import { Subject } from 'rxjs';
import { DocumentEditDialogComponent } from './document-edit-dialog.component';

@Component({ template: '<input aria-label="Fixture title" />' })
class FixtureEditor implements OnInit {
	@Input() documentType = '';
	@Input() data: any;
	readonly modal = inject(BsModalRef);
	readonly navigation = inject(ViewNavigation);
	readonly explicitGuard = jasmine.createSpy('compiled layout guard').and.resolveTo(true);
	componentRef: any = { instance: { canDeactivate: this.explicitGuard } };
	readonly canDeactivate = () => this.explicitGuard();
	ngOnInit(): void {
		if (this.data?.fallbackGuard) this.navigation.register(this.data.fallbackGuard);
	}
}

describe('DocumentEditDialogComponent', () => {
	function setup(data: any = {}) {
		const hidden = jasmine.createSpy('hide');
		const events = new Subject();
		TestBed.configureTestingModule({
			providers: [
				{ provide: BsModalRef, useValue: { hide: hidden } },
				{ provide: Router, useValue: { events } },
			],
		});
		const applicationNavigation = TestBed.inject(ViewNavigation);
		const fixture = TestBed.createComponent(DocumentEditDialogComponent);
		(fixture.componentInstance as any).editorComponent = FixtureEditor;
		fixture.componentRef.setInput('documentType', 'CustomDocument');
		fixture.componentRef.setInput('data', data);
		fixture.detectChanges();
		const editor = fixture.componentInstance.editor()!.componentInstance as FixtureEditor;
		return { fixture, editor, applicationNavigation, hidden, events };
	}

	it('mounts its existing type-editor outlet and focuses a field without changing the draft inputs', async () => {
		const data = { add: false, documents: [{ uid: 'one', properties: { 'dc:title': 'Draft' } }] };
		const { fixture, editor } = setup(data);
		await fixture.whenStable();
		expect(editor.documentType).toBe('CustomDocument');
		expect(editor.data).toBe(data);
		expect(document.activeElement).toBe(fixture.nativeElement.querySelector('input'));
	});

	it('rejects implicit dismissal when the compiled layout keeps its draft and permits accepted dismissal', async () => {
		const { fixture, editor, hidden } = setup();
		editor.explicitGuard.and.resolveTo(false);
		await expectAsync(fixture.componentInstance.interceptClose()).toBeRejected();
		expect(hidden).not.toHaveBeenCalled();
		editor.explicitGuard.and.resolveTo(true);
		await expectAsync(fixture.componentInstance.interceptClose()).toBeResolved();
		expect(editor.explicitGuard).toHaveBeenCalledTimes(2);
	});

	it('keeps an Escape consumed by a nested control from reaching the modal, while an unconsumed Escape still checks the draft', async () => {
		const { fixture, editor, hidden } = setup();
		editor.explicitGuard.and.resolveTo(false);
		const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
		const pending: Promise<void>[] = [];
		const modalListener = () => pending.push(fixture.componentInstance.interceptClose());
		window.addEventListener('keydown', modalListener);
		try {
			input.addEventListener('keydown', (event) => event.preventDefault(), { once: true });
			input.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
			);
			expect(pending.length).toBe(0);
			expect(editor.explicitGuard).not.toHaveBeenCalled();
			input.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
			);
			expect(pending.length).toBe(1);
			await expectAsync(pending[0]).toBeRejected();
			expect(editor.explicitGuard).toHaveBeenCalledTimes(1);
			expect(hidden).not.toHaveBeenCalled();
		} finally {
			window.removeEventListener('keydown', modalListener);
		}
	});

	it('coalesces simultaneous Escape and backdrop dismissal while confirmation is pending', async () => {
		const { fixture, editor } = setup();
		let approve!: (value: boolean) => void;
		editor.explicitGuard.and.returnValue(new Promise<boolean>((resolve) => (approve = resolve)));
		const first = fixture.componentInstance.interceptClose();
		const second = fixture.componentInstance.interceptClose();
		expect(second).toBe(first);
		expect(editor.explicitGuard).toHaveBeenCalledTimes(1);
		approve(true);
		await first;
	});

	it('closes once after an editor-approved Cancel or successful save without asking its guard again', async () => {
		const { fixture, editor, hidden } = setup();
		editor.modal.hide();
		editor.modal.hide();
		expect(hidden).toHaveBeenCalledTimes(1);
		await expectAsync(fixture.componentInstance.interceptClose()).toBeResolved();
		expect(editor.explicitGuard).not.toHaveBeenCalled();
	});

	it('keeps the application guard owned by the modal and avoids duplicate child-editor guards', async () => {
		const fallbackGuard = jasmine.createSpy('base editor guard').and.resolveTo(false);
		const { fixture, editor, applicationNavigation } = setup({ fallbackGuard });
		editor.explicitGuard.and.resolveTo(false);
		expect(await applicationNavigation.canLeave('/another-document')).toBeFalse();
		expect(editor.explicitGuard).toHaveBeenCalledTimes(1);
		expect(fallbackGuard).not.toHaveBeenCalled();
		// Binary/fallback editors without a compiled canDeactivate still protect their BaseEditor draft.
		editor.componentRef = undefined;
		expect(await applicationNavigation.canLeave('/another-document')).toBeFalse();
		expect(fallbackGuard).toHaveBeenCalledTimes(1);
		fixture.destroy();
		expect(await applicationNavigation.canLeave('/another-document')).toBeTrue();
	});

	it('only closes on a completed navigation, after application departure guards have accepted', () => {
		const { hidden, events } = setup();
		expect(hidden).not.toHaveBeenCalled();
		events.next(new NavigationEnd(1, '/document/two', '/document/two'));
		expect(hidden).toHaveBeenCalledTimes(1);
	});
});

describe('Document edit modal save integration', () => {
	it('retains a failed standard-editor save and closes once after a successful retry without duplicate requests', () => {
		const hidden = jasmine.createSpy('hide');
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders(), { provide: BsModalRef, useValue: { hide: hidden } }],
		});
		const fixture = TestBed.createComponent(DocumentEditDialogComponent);
		(fixture.componentInstance as any).editorComponent = StandardContentEditorComponent;
		fixture.nativeElement.classList.add('nx-document-edit-dialog');
		const document = fixtureDocument('PictureBook');
		spyOnProperty(fixture.componentInstance, 'editorInputs', 'get').and.returnValue({
			documentType: 'PictureBook',
			add: false,
			documents: [document],
		});
		fixture.detectChanges();
		const editor = fixture.componentInstance.editor()!
			.componentInstance as StandardContentEditorComponent;
		const base = fixture.debugElement.query(By.directive(BaseEditorComponent))
			.componentInstance as BaseEditorComponent;
		const title = editor.editorForm!.get('dc:title')!;
		title.setValue('Retained draft');
		title.markAsDirty();
		fixture.detectChanges();
		const request = new Subject<any>();
		const update = spyOn(TestBed.inject(DocumentsManagerService), 'updateDocument').and.returnValue(
			request,
		);
		const save: HTMLButtonElement = fixture.nativeElement.querySelector(
			'.modal-footer .btn-primary',
		);
		expect(getComputedStyle(save).flexGrow).toBe('0');
		expect(save.getBoundingClientRect().width).toBeCloseTo(96, 0);
		const cancel = fixture.nativeElement.querySelector(
			'.modal-footer .btn-link',
		) as HTMLButtonElement;
		expect(getComputedStyle(cancel).color).toBe('rgb(0, 102, 255)');
		save.click();
		save.click();
		expect(update).toHaveBeenCalledOnceWith(document.uid, { 'dc:title': 'Retained draft' });
		request.error(new Error('Permission changed'));
		fixture.detectChanges();
		expect(hidden).not.toHaveBeenCalled();
		expect(editor.editorForm!.dirty).toBeTrue();
		expect(title.value).toBe('Retained draft');
		expect(base.saveError).toContain('Your changes are still available');
		const retry = new Subject<any>();
		update.and.returnValue(retry);
		save.click();
		save.click();
		expect(update).toHaveBeenCalledTimes(2);
		retry.next({ ...document, properties: { 'dc:title': 'Retained draft' } });
		retry.complete();
		expect(hidden).toHaveBeenCalledTimes(1);
		expect(editor.editorForm!.pristine).toBeTrue();
	});
});

@Component({ imports: [DocumentEditDialogComponent], template: '<nx-document-edit-dialog />' })
class DropdownDialogFixture {}

describe('Document edit dropdown portal', () => {
	it('inherits application defaults and portals the real dropdown outside the scrolling body but inside the modal', async () => {
		const parentConfig = Object.assign(new NgSelectConfig(), {
			notFoundText: 'Fixture no matches',
			openOnEnter: false,
		});
		TestBed.configureTestingModule({
			providers: [
				{ provide: NgSelectConfig, useValue: parentConfig },
				{ provide: BsModalRef, useValue: { hide: jasmine.createSpy('hide') } },
				{ provide: Router, useValue: { events: new Subject() } },
			],
		});
		TestBed.overrideComponent(DocumentEditDialogComponent, {
			set: {
				imports: [NgSelectComponent],
				template: `<div class="modal-body" style="height:40px;overflow:auto"><ng-select [items]="['United Kingdom', 'United States']" ariaLabel="Coverage fixture" /></div>`,
			},
		});
		const fixture = TestBed.createComponent(DropdownDialogFixture);
		fixture.detectChanges();
		const dialog = fixture.debugElement.query(By.directive(DocumentEditDialogComponent));
		const localConfig = dialog.injector.get(NgSelectConfig);
		expect(localConfig).not.toBe(parentConfig);
		expect(localConfig.notFoundText).toBe(parentConfig.notFoundText);
		expect(localConfig.openOnEnter).toBeFalse();
		expect(parentConfig.appendTo).toBeUndefined();
		const select = fixture.debugElement.query(By.directive(NgSelectComponent))
			.componentInstance as NgSelectComponent;
		select.open();
		fixture.detectChanges();
		await fixture.whenStable();
		const panel = dialog.nativeElement.querySelector('ng-dropdown-panel');
		expect(panel.parentElement).toBe(dialog.nativeElement);
		expect(panel.closest('.modal-body')).toBeNull();
		const modalEscape = jasmine.createSpy('window Escape');
		window.addEventListener('keydown', modalEscape);
		try {
			const input = dialog.nativeElement.querySelector('ng-select input') as HTMLInputElement;
			input.focus();
			input.dispatchEvent(
				new KeyboardEvent('keydown', {
					key: 'Escape',
					keyCode: 27,
					bubbles: true,
					cancelable: true,
				}),
			);
			fixture.detectChanges();
			expect(select.isOpen()).toBeFalse();
			expect(modalEscape).not.toHaveBeenCalled();
			expect(document.activeElement).toBe(input);
		} finally {
			window.removeEventListener('keydown', modalEscape);
		}
	});
});
