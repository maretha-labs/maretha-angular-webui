import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { DocumentAttachmentsService } from './document-attachments.service';
import { StagedImportUploads } from './staged-import-uploads';

describe('StagedImportUploads', () => {
	let attachments: jasmine.SpyObj<DocumentAttachmentsService>;
	let staged: StagedImportUploads;
	const settle = () => new Promise((resolve) => setTimeout(resolve));
	const a = new File(['a'], 'a.txt');
	const b = new File(['b'], 'b.txt');
	beforeEach(() => {
		attachments = jasmine.createSpyObj('attachments', [
			'createUploadBatch',
			'uploadToBatch',
			'removeBatchFile',
			'removeBatchJob',
		]);
		attachments.createUploadBatch.and.returnValue(of('batch-1'));
		attachments.uploadToBatch.and.returnValue(of(undefined));
		attachments.removeBatchFile.and.returnValue(of(null));
		attachments.removeBatchJob.and.returnValue(of(null));
		TestBed.configureTestingModule({
			providers: [
				StagedImportUploads,
				{ provide: DocumentAttachmentsService, useValue: attachments },
			],
		});
		staged = TestBed.inject(StagedImportUploads);
	});

	it('uploads chosen files at once into one batch and hands it to a creation', async () => {
		staged.add([a]);
		staged.add([b]);
		expect(staged.uploading()).toBeTrue();
		await settle();
		expect(attachments.createUploadBatch).toHaveBeenCalledTimes(1);
		expect(attachments.uploadToBatch.calls.allArgs()).toEqual([
			['batch-1', a, 0],
			['batch-1', b, 1],
		]);
		expect(staged.ready()).toBeTrue();
		const handed = staged.take()!;
		expect(handed.batchId).toBe('batch-1');
		expect([handed.indexOf(a), handed.indexOf(b)]).toEqual([0, 1]);
		expect(staged.files()).toEqual([]);
		TestBed.resetTestingModule();
		expect(attachments.removeBatchJob).not.toHaveBeenCalled();
	});

	it('removes a removed file from the batch, also when its upload lands later', async () => {
		const pending = new Subject<void>();
		attachments.uploadToBatch.and.returnValues(of(undefined), pending);
		staged.add([a, b]);
		await settle();
		staged.removeAt(0);
		await settle();
		expect(attachments.removeBatchFile).toHaveBeenCalledOnceWith('batch-1', 0);
		staged.removeAt(0);
		expect(attachments.removeBatchFile).toHaveBeenCalledTimes(1);
		pending.next();
		pending.complete();
		await settle();
		expect(attachments.removeBatchFile.calls.allArgs()).toEqual([
			['batch-1', 0],
			['batch-1', 1],
		]);
		expect(staged.files()).toEqual([]);
	});

	it('reports a failed upload and uploads it again on retry', async () => {
		attachments.uploadToBatch.and.returnValues(
			throwError(() => new Error('offline')),
			of(undefined),
		);
		staged.add([a]);
		await settle();
		expect(staged.failed()).toBeTrue();
		expect(staged.ready()).toBeFalse();
		await staged.retryFailed();
		expect(staged.ready()).toBeTrue();
		expect(attachments.uploadToBatch).toHaveBeenCalledTimes(2);
		expect(attachments.createUploadBatch).toHaveBeenCalledTimes(1);
	});

	it('removes a batch that was never handed to a creation when the dialog closes', async () => {
		staged.add([a]);
		await settle();
		TestBed.resetTestingModule();
		expect(attachments.removeBatchJob).toHaveBeenCalledOnceWith('batch-1');
	});
});
