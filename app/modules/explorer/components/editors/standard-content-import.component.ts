import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	Input,
	OnInit,
	inject,
} from '@angular/core';
import { ReactiveFormsModule, UntypedFormBuilder, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DOCUMENT_IMPORT_DRAFT, DocumentLayoutContext, WebUiMessagePipe } from '@maretha/webui-sdk';
import { StandardContentFieldsComponent } from './standard-content-fields.component';

/**
 * Import fields for Audio, Video and Note, after Polymer's per-type import layouts. The
 * import host owns the file, its upload and the document creation.
 */
@Component({
	selector: 'nx-standard-content-import',
	standalone: true,
	imports: [ReactiveFormsModule, StandardContentFieldsComponent, WebUiMessagePipe],
	template: `
		<div [formGroup]="form">
			<div class="field">
				<label for="import-title">{{
					'app.modules.standard-content-import.title-516cb5' | webuiMessage: 'Title *'
				}}</label
				><input id="import-title" class="form-control" formControlName="dc:title" required />
			</div>
			<div class="field">
				<label for="import-description">{{
					'app.modules.standard-content-import.description-19a3e3' | webuiMessage: 'Description'
				}}</label
				><textarea
					id="import-description"
					class="form-control"
					formControlName="dc:description"
					rows="3"
				></textarea>
			</div>
			@if (isNote) {
				<div class="field">
					<label for="import-format">{{
						'app.modules.standard-content-import.format-213a92' | webuiMessage: 'Format'
					}}</label
					><select id="import-format" class="form-select" formControlName="note:mime_type">
						<option value="text/html">
							{{ 'mimetype.text/html' | webuiMessage: 'HTML' }}
						</option>
						<option value="text/plain">
							{{ 'mimetype.text/plain' | webuiMessage: 'Text' }}
						</option>
						<option value="text/xml">
							{{ 'mimetype.text/xml' | webuiMessage: 'XML' }}
						</option>
						<option value="text/x-web-markdown">
							{{ 'mimetype.text/x-web-markdown' | webuiMessage: 'Markdown' }}
						</option>
					</select>
				</div>
			}
			<nx-standard-content-fields formControlName="common" />
		</div>
	`,
	styles: [
		`
			.field {
				margin-bottom: 1rem;
			}
			label {
				display: block;
				margin-bottom: 0.35rem;
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandardContentImportComponent implements OnInit {
	@Input() layoutContext?: DocumentLayoutContext;
	private readonly draft = inject(DOCUMENT_IMPORT_DRAFT);
	private readonly destroyRef = inject(DestroyRef);
	private readonly properties = this.draft.properties;
	readonly form = inject(UntypedFormBuilder).group({
		'dc:title': [this.properties['dc:title'] ?? '', Validators.required],
		'dc:description': [this.properties['dc:description'] ?? ''],
		'note:mime_type': [this.properties['note:mime_type'] ?? 'text/plain'],
		common: [
			{
				'dc:nature': this.properties['dc:nature'] ?? null,
				'dc:subjects': this.properties['dc:subjects'] ?? [],
				'dc:coverage': this.properties['dc:coverage'] ?? null,
				'dc:expired': this.properties['dc:expired'] ?? null,
			},
		],
	});
	get isNote(): boolean {
		// documentLayoutContext lowercases the type name.
		return this.layoutContext?.documentType === 'note';
	}
	ngOnInit(): void {
		// The vocabulary control reports only changed fields; keep the others.
		const common = this.form.get('common')!;
		let previous = common.value;
		common.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
			previous = { ...previous, ...value };
			common.setValue(previous, { emitEvent: false });
		});
		this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
			const { common: fields, ['note:mime_type']: format, ...values } = this.form.getRawValue();
			this.draft.update({
				...values,
				...fields,
				...(this.isNote ? { 'note:mime_type': format } : {}),
			});
			this.draft.setValid(this.form.valid);
		});
		this.draft.setValid(this.form.valid);
	}
}
