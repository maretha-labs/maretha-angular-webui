import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BlobActionComponent } from './blob-action.component';

describe('BlobActionComponent', () => {
	let fixture: ComponentFixture<BlobActionComponent>;
	let context: any;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [BlobActionComponent],
		}).compileComponents();
		context = {
			document: { uid: 'doc-1' },
			blob: { name: 'a.txt' },
			xpath: 'file:content',
			noEdit: false,
			draft: false,
			allowedMimeTypes: ['text/plain'],
			replace: jasmine.createSpy('replace'),
			remove: jasmine.createSpy('remove'),
			download: jasmine.createSpy('download'),
		};
		fixture = TestBed.createComponent(BlobActionComponent);
		fixture.componentRef.setInput('context', context);
	});

	it('downloads or removes through the context without a dialog', () => {
		fixture.componentRef.setInput('action', 'download');
		fixture.detectChanges();
		(fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
		expect(context.download).toHaveBeenCalled();
		fixture.componentRef.setInput('action', 'remove');
		fixture.detectChanges();
		(fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
		expect(context.remove).toHaveBeenCalled();
	});

	it('replaces the file only after the stock-style dialog confirms a chosen file', () => {
		fixture.componentRef.setInput('action', 'replace');
		fixture.detectChanges();
		const component = fixture.componentInstance;
		const dialog = fixture.nativeElement.querySelector(
			'dialog.replace-dialog',
		) as HTMLDialogElement;
		expect(dialog.open).toBeFalse();
		(
			fixture.nativeElement.querySelector('button[aria-label="Replace file"]') as HTMLButtonElement
		).click();
		fixture.detectChanges();
		expect(dialog.open).toBeTrue();
		const confirm = [...fixture.nativeElement.querySelectorAll('dialog footer button')].at(
			-1,
		) as HTMLButtonElement;
		expect(confirm.disabled).toBeTrue();
		component.confirmReplace(dialog);
		expect(context.replace).not.toHaveBeenCalled();
		const file = new File(['x'], 'b.txt', { type: 'text/plain' });
		component.choose([file]);
		fixture.detectChanges();
		expect(confirm.disabled).toBeFalse();
		component.confirmReplace(dialog);
		expect(context.replace).toHaveBeenCalledWith(file);
		expect(dialog.open).toBeFalse();
		component.replace([file]);
		expect(context.replace).toHaveBeenCalledTimes(2);
	});

	it('does not open the dialog or replace when editing is not allowed', () => {
		context.noEdit = true;
		fixture.componentRef.setInput('context', { ...context });
		fixture.componentRef.setInput('action', 'replace');
		fixture.detectChanges();
		fixture.componentInstance.openReplace();
		expect((fixture.nativeElement.querySelector('dialog') as HTMLDialogElement).open).toBeFalse();
		fixture.componentInstance.choose([new File(['x'], 'b.txt')]);
		fixture.componentInstance.confirmReplace(fixture.nativeElement.querySelector('dialog'));
		fixture.componentInstance.replace([new File(['x'], 'b.txt')]);
		expect(context.replace).not.toHaveBeenCalled();
	});
});
