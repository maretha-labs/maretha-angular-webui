import { TestBed } from '@angular/core/testing';
import { BsModalService } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { ConfirmDialogService } from './confirm-dialog.service';

describe('ConfirmDialogService', () => {
	function setup() {
		const confirm$ = new Subject<unknown>();
		const onHidden = new Subject<unknown>();
		const show = jasmine
			.createSpy('show')
			.and.returnValue({ content: { confirm$ }, onHidden, hide: () => onHidden.next('hide') });
		TestBed.configureTestingModule({
			providers: [{ provide: BsModalService, useValue: { show } }],
		});
		return { service: TestBed.inject(ConfirmDialogService), show, confirm$, onHidden };
	}
	it('resolves true only after the dialog confirmed and hid, and returns focus to the opener', async () => {
		const { service, show, confirm$, onHidden } = setup();
		const opener = document.createElement('button');
		document.body.appendChild(opener);
		opener.focus();
		const pending = service.confirm({ message: 'Delete it?', destructive: true });
		const options = show.calls.mostRecent().args[1];
		expect(options.keyboard).toBeTrue();
		expect(options.ignoreBackdropClick).toBeFalse();
		expect(options.initialState.defaultButtonConfirm).toBeFalse();
		expect(options.initialState.declineButtonTitle).toBe('Cancel');
		confirm$.next(true);
		opener.blur();
		onHidden.next('confirm');
		expect(await pending).toBeTrue();
		expect(document.activeElement).toBe(opener);
		opener.remove();
	});
	it('resolves false when the dialog is dismissed by Escape, the backdrop or the close control', async () => {
		const { service, onHidden } = setup();
		const pending = service.confirm({ messageKey: 'x', message: 'x' });
		onHidden.next('esc');
		expect(await pending).toBeFalse();
	});
});
