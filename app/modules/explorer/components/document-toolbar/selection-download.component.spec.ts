import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { BulkZipJob } from 'app/helpers/blob-delivery.service';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { SelectionDownloadService } from '../../helpers/selection-download.service';
import { SelectionDownloadComponent } from './selection-download.component';

describe('ZIP preparation controls', () => {
	const pending: BulkZipJob = {
		id: 'opaque-job',
		state: 'preparing',
		completed: 3,
		total: 10,
		bytesProcessed: 30,
		totalBytes: 100,
		expiresAt: Date.now() + 1_800_000,
		error: null,
	};
	const ready = { ...pending, state: 'ready' as const, completed: 10 };
	const grant = {
		id: 'opaque-grant',
		url: 'https://app.example/content/opaque-grant',
		expiresAt: Date.now() + 300_000,
	};
	let service: {
		download: jasmine.Spy;
		retryDownload: jasmine.Spy;
		regenerateDownload: jasmine.Spy;
		cancelDownload: jasmine.Spy;
		sessionEnded$: Subject<void>;
	};
	let click: jasmine.Spy;
	beforeEach(() => {
		service = {
			download: jasmine.createSpy(),
			retryDownload: jasmine.createSpy(),
			regenerateDownload: jasmine.createSpy(),
			cancelDownload: jasmine.createSpy().and.returnValue(of(undefined)),
			sessionEnded$: new Subject<void>(),
		};
		click = spyOn(HTMLAnchorElement.prototype, 'click');
		TestBed.configureTestingModule({
			imports: [SelectionDownloadComponent],
			providers: [
				...legacyTestProviders(),
				{ provide: SelectionDownloadService, useValue: service },
			],
		});
	});
	function render() {
		const fixture = TestBed.createComponent(SelectionDownloadComponent);
		fixture.componentRef.setInput('context', {
			document: { repository: 'archive' },
			selectedDocuments: [{ uid: 'folder', repository: 'archive' }],
			busy: false,
		});
		fixture.detectChanges();
		return fixture;
	}
	it('renders the label beside the icon when one is given and keeps the icon-only form otherwise', () => {
		const plain = render();
		expect(plain.nativeElement.querySelector('button .action-label')).toBeNull();
		const labelled = render();
		labelled.componentRef.setInput('label', 'Download');
		labelled.detectChanges();
		const button = labelled.nativeElement.querySelector('button.selection-icon-action');
		expect(button.querySelector('.action-label').textContent).toBe('Download');
		expect(button.getAttribute('aria-label')).toBe('Download');
	});
	it('shows real preparation counts and confirms cancellation only after the operation acknowledges it', async () => {
		let reject!: (error: unknown) => void;
		service.download.and.callFake((_ids, _repo, _signal, progress) => {
			progress(pending);
			return new Promise((_resolve, fail) => (reject = fail));
		});
		const f = render();
		const run = f.componentInstance.download();
		f.detectChanges();
		expect(f.nativeElement.textContent).toContain('3 of 10 files prepared');
		expect(f.nativeElement.textContent).not.toContain('opaque-job');
		await f.componentInstance.cancel();
		f.detectChanges();
		expect(f.nativeElement.textContent).toContain('Cancelling preparation');
		expect(service.download.calls.first().args[2].aborted).toBeTrue();
		expect(click).not.toHaveBeenCalled();
		reject(new DOMException('Cancelled', 'AbortError'));
		await run;
		f.detectChanges();
		expect(f.nativeElement.textContent).toContain('Archive preparation cancelled.');
		f.destroy();
	});
	it('starts one native download without a blob URL, completion claim, result probe or reusable save link', async () => {
		const objectUrl = spyOn(URL, 'createObjectURL');
		service.download.and.callFake(async (_ids, _repo, _signal, progress) => {
			progress(ready);
			return grant;
		});
		const f = render();
		await f.componentInstance.download();
		f.detectChanges();
		expect(click).toHaveBeenCalledTimes(1);
		expect((click.calls.first().object as HTMLAnchorElement).href).toBe(grant.url);
		expect(objectUrl).not.toHaveBeenCalled();
		expect(f.nativeElement.querySelector('a')).toBeNull();
		expect(f.nativeElement.textContent).toContain('Download started.');
		expect(f.nativeElement.textContent).toContain('Regenerate ZIP');
		expect(service.retryDownload).not.toHaveBeenCalled();
		expect(service.regenerateDownload).not.toHaveBeenCalled();
		f.destroy();
		expect(service.cancelDownload).not.toHaveBeenCalled();
	});
	it('uses the same safe bounded ZIP name for creation and the native download hint', async () => {
		service.download.and.callFake(async (_ids, _repo, _signal, progress) => {
			progress(ready);
			return grant;
		});
		const f = render();
		f.componentRef.setInput('filename', 'Title/Part\\Section:\u0000' + 'A'.repeat(200));
		f.detectChanges();
		await f.componentInstance.download();
		const expected = ('Title-Part-Section-' + 'A'.repeat(200)).slice(0, 176) + '.zip';
		expect(service.download.calls.first().args[4]).toBe(expected);
		expect((click.calls.first().object as HTMLAnchorElement).download).toBe(expected);
		f.destroy();
	});
	it('shows bounded JSON quota and regeneration errors as text without losing the current job', async () => {
		service.download.and.rejectWith(
			new HttpErrorResponse({
				status: 400,
				error: { error: 'At most 3 ZIP jobs may be active. Cancel a preparation first.' },
			}),
		);
		const f = render();
		await f.componentInstance.download();
		f.detectChanges();
		expect(f.nativeElement.querySelector('[role=alert]').textContent).toContain(
			'At most 3 ZIP jobs',
		);
		f.componentInstance.job.set(ready);
		service.regenerateDownload.and.rejectWith(
			new HttpErrorResponse({
				status: 409,
				error: { error: 'The <archive> cannot be prepared. Retry later.' },
			}),
		);
		await f.componentInstance.regenerate();
		f.detectChanges();
		expect(f.nativeElement.querySelector('[role=alert]').textContent).toContain('The <archive>');
		expect(f.nativeElement.querySelector('archive')).toBeNull();
		expect(f.componentInstance.job()).toEqual(ready);
		expect(click).not.toHaveBeenCalled();
		f.destroy();
	});
	it('ignores malformed HTTP error payloads and preserves unconfirmed cancellation wording', async () => {
		const f = render();
		for (const error of [{ error: { secret: 'invalid' } }, { error: 'X'.repeat(1001) }]) {
			service.download.and.rejectWith(new HttpErrorResponse({ status: 500, error }));
			await f.componentInstance.download();
			expect(f.componentInstance.error()).toContain('Archive preparation could not be confirmed');
		}
		let reject!: (error: unknown) => void;
		service.download.and.callFake((_ids, _repo, _signal, progress) => {
			progress(pending);
			return new Promise((_resolve, fail) => (reject = fail));
		});
		const run = f.componentInstance.download();
		await f.componentInstance.cancel();
		reject(new HttpErrorResponse({ status: 409, error: { error: 'Internal cancel detail' } }));
		await run;
		expect(f.componentInstance.error()).toContain('Cancellation could not be confirmed');
		expect(f.componentInstance.error()).not.toContain('Internal cancel detail');
		expect(f.componentInstance.phase()).toBe('idle');
		f.destroy();
	});
	it('retries status for the captured job and regenerates explicitly after browser download initiation', async () => {
		service.download.and.callFake(async (_ids, _repo, _signal, progress) => {
			progress(pending);
			throw new Error('Status unavailable');
		});
		service.retryDownload.and.callFake(async (_job, _signal, progress) => {
			progress(ready);
			return grant;
		});
		service.regenerateDownload.and.callFake(async (_id, _signal, progress) => {
			progress({ ...ready, id: 'new-job' });
			return { ...grant, id: 'new-grant' };
		});
		const f = render();
		await f.componentInstance.download();
		f.detectChanges();
		expect(f.nativeElement.textContent).toContain('Retry status');
		await f.componentInstance.retryStatus();
		expect(service.retryDownload.calls.first().args[0]).toEqual(pending);
		expect(service.download).toHaveBeenCalledTimes(1);
		f.componentRef.setInput('context', {
			document: { repository: 'different' },
			selectedDocuments: [{ uid: 'different' }],
			busy: false,
		});
		f.detectChanges();
		await f.componentInstance.regenerate();
		expect(service.regenerateDownload.calls.first().args[0]).toBe('opaque-job');
		expect(service.download).toHaveBeenCalledTimes(1);
		expect(click).toHaveBeenCalledTimes(2);
		f.destroy();
	});
	it('never initiates a late native download after the component is destroyed', async () => {
		let resolve!: (value: typeof grant) => void;
		service.download.and.callFake(() => new Promise((done) => (resolve = done)));
		const f = render();
		const run = f.componentInstance.download();
		f.destroy();
		resolve(grant);
		await run;
		expect(service.download.calls.first().args[2].aborted).toBeTrue();
		expect(click).not.toHaveBeenCalled();
	});
	it('allows explicit cancellation after status polling failed and displays a failed cancellation truthfully', async () => {
		service.download.and.callFake(async (_ids, _repo, _signal, progress) => {
			progress(pending);
			throw new Error('Status unavailable');
		});
		const f = render();
		await f.componentInstance.download();
		service.cancelDownload.and.returnValue(throwError(() => new Error('Offline')));
		await f.componentInstance.cancel();
		expect(f.componentInstance.phase()).toBe('idle');
		expect(f.componentInstance.error()).toContain('could not be confirmed');
		service.cancelDownload.and.returnValue(of(undefined));
		await f.componentInstance.cancel();
		expect(service.cancelDownload).toHaveBeenCalledWith('opaque-job');
		expect(f.componentInstance.phase()).toBe('cancelled');
		f.destroy();
	});
});
