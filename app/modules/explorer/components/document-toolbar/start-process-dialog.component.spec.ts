import { TestBed } from '@angular/core/testing';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { StartProcessDialogComponent } from './start-process-dialog.component';

describe('Start Process confirmation', () => {
	let execute: jasmine.Spy, hide: jasmine.Spy;
	beforeEach(() => {
		execute = jasmine.createSpy('execute').and.resolveTo();
		hide = jasmine.createSpy('hide');
		TestBed.configureTestingModule({
			imports: [StartProcessDialogComponent],
			providers: [{ provide: BsModalRef, useValue: { hide } }],
		});
	});
	async function render() {
		const fixture = TestBed.createComponent(StartProcessDialogComponent);
		fixture.componentRef.setInput('context', {
			availableCommands: ['workflow'],
			workflows: [
				{ name: 'SerialDocumentReview', title: 'wf.serialDocumentReview.SerialDocumentReview' },
			],
			execute,
		});
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		return fixture;
	}
	it('selects a translated model without starting and starts once only after confirmation', async () => {
		const fixture = await render();
		const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
		select.value = 'SerialDocumentReview';
		select.dispatchEvent(new Event('change'));
		fixture.detectChanges();
		expect(select.selectedOptions[0].textContent).toContain('Serial Document Review');
		expect(execute).not.toHaveBeenCalled();
		let finish!: () => void;
		execute.and.returnValue(new Promise<void>((resolve) => (finish = resolve)));
		const saving = fixture.componentInstance.start();
		await fixture.componentInstance.start();
		expect(execute).toHaveBeenCalledOnceWith('workflow', 'SerialDocumentReview');
		expect(hide).not.toHaveBeenCalled();
		finish();
		await saving;
		expect(hide).toHaveBeenCalledTimes(1);
	});
	it('keeps a rejected start visible and permits a retry', async () => {
		const fixture = await render();
		fixture.componentInstance.selected = 'SerialDocumentReview';
		execute.and.rejectWith(new Error('denied'));
		await fixture.componentInstance.start();
		expect(hide).not.toHaveBeenCalled();
		expect(fixture.componentInstance.error()).toContain('could not be started');
		execute.and.resolveTo();
		await fixture.componentInstance.start();
		expect(hide).toHaveBeenCalledTimes(1);
	});
});
