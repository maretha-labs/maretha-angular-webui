import { BsModalRef } from 'ngx-bootstrap/modal';
import { WebUiMessages } from '@maretha/webui-sdk';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
	ConfirmationDialogComponent,
	confirmationDialogOptions,
} from './confirmation-dialog.component';

describe('ConfirmationDialogComponent', () => {
	let component: ConfirmationDialogComponent;
	let fixture: ComponentFixture<ConfirmationDialogComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [ConfirmationDialogComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(ConfirmationDialogComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('message', 'Confirm fixture action');
		fixture.detectChanges();
	});

	it('emits the chosen outcome once and hides the modal', () => {
		const confirm = jasmine.createSpy('confirm'),
			decline = jasmine.createSpy('decline');
		component.confirm$.subscribe(confirm);
		component.decline$.subscribe(decline);
		const hide = spyOn(TestBed.inject(BsModalRef), 'hide');
		component.close(true);
		expect(confirm).toHaveBeenCalledOnceWith(true);
		expect(decline).not.toHaveBeenCalled();
		component.close();
		expect(decline).toHaveBeenCalledOnceWith(false);
		expect(hide).toHaveBeenCalledTimes(2);
	});
	it('should create', () => {
		expect(component).toBeTruthy();
	});
	it('asks a title-only question without an empty body', () => {
		const question = TestBed.createComponent(ConfirmationDialogComponent);
		question.componentRef.setInput('title', 'Delete selected document(s)?');
		question.detectChanges();
		const element = question.nativeElement as HTMLElement;
		expect(element.querySelector('h2')?.textContent).toContain('Delete selected document(s)?');
		expect(element.querySelector('.nx-confirmation__text p')).toBeNull();
	});
	it('fills the default button, keeps the other a visible button and shows the icon badge', () => {
		const choice = TestBed.createComponent(ConfirmationDialogComponent);
		choice.componentRef.setInput('title', 'Delete selected document(s)?');
		choice.componentRef.setInput('icon', 'nuxeo:delete');
		choice.componentRef.setInput('declineButtonTitle', 'Cancel');
		choice.componentRef.setInput('confirmButtonTitle', 'Move to trash');
		choice.detectChanges();
		const element = choice.nativeElement as HTMLElement;
		const labels = [...element.querySelectorAll('.nx-confirmation__actions button')].map((button) =>
			button.textContent?.trim(),
		);
		expect(labels).toEqual(['Cancel', 'Move to trash']);
		const defaultLabel = () =>
			element.querySelector('.nx-confirmation__default')?.textContent?.trim();
		expect(defaultLabel()).toBe('Move to trash');
		expect(element.querySelector('.nx-confirmation__icon nx-webui-icon')).not.toBeNull();
		choice.componentRef.setInput('defaultButtonConfirm', false);
		choice.detectChanges();
		expect(defaultLabel()).toBe('Cancel');
	});
	it('connects simultaneous dialog options to distinct heading IDs', () => {
		const first = confirmationDialogOptions({
			initialState: { title: 'Delete first item', message: 'First?' },
		});
		const second = confirmationDialogOptions({
			initialState: { title: 'Delete second item', message: 'Second?' },
		});
		fixture.componentRef.setInput('titleId', first.initialState!.titleId);
		fixture.componentRef.setInput('title', first.initialState!.title);
		fixture.detectChanges();
		const firstHeading = fixture.nativeElement.querySelector('h2') as HTMLHeadingElement;
		const other = TestBed.createComponent(ConfirmationDialogComponent);
		for (const [name, value] of Object.entries(second.initialState!))
			other.componentRef.setInput(name, value);
		other.detectChanges();
		const secondHeading = other.nativeElement.querySelector('h2') as HTMLHeadingElement;
		expect(first.ariaLabelledBy).toBe(firstHeading.id);
		expect(second.ariaLabelledBy).toBe(secondHeading.id);
		expect(firstHeading.id).not.toBe(secondHeading.id);
		expect(firstHeading.textContent).toContain('Delete first item');
		expect(secondHeading.textContent).toContain('Delete second item');
		other.destroy();
	});
	it('updates keyed copy and defaults on locale changes while keeping parameters text-only', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('dialog-locale-test', {
			fr: {
				'dialog.confirmation': 'Confirmation en français',
				'dialog.confirm': 'Confirmer',
				'dialog.decline': 'Annuler',
				'client.confirm': 'Supprimer {name} ?',
			},
		});
		fixture.componentRef.setInput('messageKey', 'client.confirm');
		fixture.componentRef.setInput('message', 'Delete {name}?');
		fixture.componentRef.setInput('messageValues', { name: '<b>Save.customer.literal</b>' });
		messages.locale.set('fr');
		fixture.detectChanges();
		const body = fixture.nativeElement.querySelector('.nx-confirmation__text p');
		expect(body.textContent).toContain('Supprimer <b>Save.customer.literal</b> ?');
		expect(body.querySelector('b')).toBeNull();
		expect(component.titleText).toBe('Confirmation en français');
		expect(component.confirmText).toBe('Confirmer');
		messages.locale.set('en-US');
		fixture.detectChanges();
		expect(body.textContent).toContain('Delete <b>Save.customer.literal</b>?');
	});
	it('keeps supplied literal labels and legacy message content independent of the locale', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('literal-test', {
			fr: { 'client.literal': 'Must not replace customer text' },
		});
		fixture.componentRef.setInput('title', 'client.literal');
		fixture.componentRef.setInput('confirmButtonTitle', 'client.literal');
		fixture.componentRef.setInput('message', '<em>client.literal</em>');
		messages.locale.set('fr');
		fixture.detectChanges();
		expect(component.titleText).toBe('client.literal');
		expect(component.confirmText).toBe('client.literal');
		expect(fixture.nativeElement.querySelector('.nx-confirmation__text em')?.textContent).toBe(
			'client.literal',
		);
	});
});
