import { Component, inject, Injectable, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Subject, finalize } from 'rxjs';
import { WebUiMessages } from '@maretha/webui-sdk';
import { BaseEditorComponent } from 'app/modules/explorer/components/editors/base-editor/base-editor.component';
import {
	DocumentAttachmentsService,
	FileUploadError,
	UploadedBatch,
} from 'app/modules/explorer/helpers/document-attachments.service';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';

@Injectable()
class SaveFixtureRequests {
	readonly file = new File(['deterministic fixture bytes'], 'Customer {file}.txt', {
		type: 'text/plain',
	});
	upload = new Subject<UploadedBatch>();
	save = new Subject<any>();
	progress?: Parameters<DocumentAttachmentsService['uploadFiles']>[1];
	readonly uploadPending = signal(false);
	readonly savePending = signal(false);
	readonly attachments = {
		uploadFiles: (
			_files: File[],
			progress?: Parameters<DocumentAttachmentsService['uploadFiles']>[1],
		) => {
			this.progress = progress;
			this.upload = new Subject<UploadedBatch>();
			this.uploadPending.set(true);
			return this.upload.pipe(finalize(() => this.uploadPending.set(false)));
		},
	};
	readonly manager = {
		updateDocument: () => {
			this.save = new Subject<any>();
			this.savePending.set(true);
			return this.save.pipe(finalize(() => this.savePending.set(false)));
		},
	};
}

/** Real editor/announcement code, with explicit local responses and no repository writes. */
@Component({
	selector: 'nx-save-a11y-fixture',
	imports: [BaseEditorComponent, ReactiveFormsModule],
	providers: [
		SaveFixtureRequests,
		{
			provide: DocumentAttachmentsService,
			useFactory: () => inject(SaveFixtureRequests).attachments,
		},
		{ provide: DocumentsManagerService, useFactory: () => inject(SaveFixtureRequests).manager },
	],
	changeDetection: ChangeDetectionStrategy.Eager,
	template: `
		<section [attr.aria-label]="arabic ? 'اختبار حفظ محلي' : 'Local save fixture'">
			@if (!closed()) {
				<nx-base-editor
					[add]="false"
					[documents]="documents"
					[editorForm]="form"
					[announceSuccess]="closeOnSuccess"
					(save)="saved($event)"
				>
					<span modalTitle>{{ arabic ? 'تحرير مستند تجريبي' : 'Edit fixture document' }}</span>
					<form modalBody [formGroup]="form">
						<label for="fixture-save-title">{{
							arabic ? 'عنوان المستند' : 'Document title'
						}}</label>
						<input id="fixture-save-title" formControlName="dc:title" class="form-control" />
					</form>
				</nx-base-editor>
			}
			<div data-save-fixture-controls>
				<p>
					{{
						arabic
							? 'استجابات محلية فقط؛ لا تُرسل ملفات أو تغييرات.'
							: 'Local responses only; no files or changes are sent.'
					}}
				</p>
				<label
					><input
						type="checkbox"
						data-close-on-success
						[checked]="closeOnSuccess"
						(change)="closeOnSuccess = $any($event.target).checked"
					/>
					{{ arabic ? 'إغلاق المحرر بعد النجاح' : 'Close editor after success' }}</label
				>
				<button type="button" data-upload-progress (click)="uploadProgress()">
					{{ arabic ? 'تقدم الرفع' : 'Upload progress' }}
				</button>
				<button type="button" data-upload-complete (click)="uploadComplete()">
					{{ arabic ? 'إكمال الرفع' : 'Complete upload' }}
				</button>
				<button type="button" data-upload-fail (click)="uploadFail()">
					{{ arabic ? 'فشل الرفع' : 'Fail upload' }}
				</button>
				<button type="button" data-save-complete (click)="saveComplete()">
					{{ arabic ? 'إكمال الحفظ' : 'Complete save' }}
				</button>
				<button type="button" data-save-fail (click)="saveFail()">
					{{ arabic ? 'فشل الحفظ' : 'Fail save' }}
				</button>
				<p data-fixture-save-result>{{ savedCount() }}</p>
			</div>
		</section>
	`,
})
export class SaveFixture {
	readonly requests = inject(SaveFixtureRequests);
	private readonly messages = inject(WebUiMessages);
	get arabic(): boolean {
		return this.messages.locale() === 'ar';
	}
	readonly documents = [
		{
			uid: 'fixture-save',
			properties: { 'dc:title': 'Customer {title}' },
			ng: { attachments: [] },
		},
	];
	readonly form = new FormGroup({
		'dc:title': new FormControl('Customer {title}'),
		'file:content': new FormControl(this.requests.file),
	});
	readonly closed = signal(false);
	readonly savedCount = signal(0);
	closeOnSuccess = false;
	constructor() {
		this.form.controls['dc:title'].markAsDirty();
		this.form.controls['file:content'].markAsDirty();
	}
	uploadProgress(): void {
		this.requests.progress?.({
			file: this.requests.file,
			fileIdx: 0,
			chunkIndex: 0,
			chunkCount: 2,
		});
	}
	uploadComplete(): void {
		this.requests.upload.next({
			batchId: 'fixture-batch',
			uploadedFiles: { [this.requests.file.name]: 0 },
			entries: [{ file: this.requests.file, fileIdx: 0 }],
		});
		this.requests.upload.complete();
	}
	uploadFail(): void {
		this.requests.upload.error(
			new FileUploadError(
				'The files could not be uploaded. Check your connection and permissions, then retry.',
				new Error('fixture only'),
				'app.services.attachments.upload-failed',
			),
		);
	}
	saveComplete(): void {
		this.requests.save.next(this.documents[0]);
		this.requests.save.complete();
	}
	saveFail(): void {
		this.requests.save.error({
			error: {
				'entity-type': 'validation_report',
				violations: [
					{ path: [{ field_name: 'customer:field' }], message: 'Customer {literal} <text>' },
				],
			},
		});
	}
	saved(documents: unknown[]): void {
		this.savedCount.set(documents.length);
		if (this.closeOnSuccess) this.closed.set(true);
	}
}
