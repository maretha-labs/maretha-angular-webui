import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { Component, ElementRef, Input, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { animations } from 'app/shared.constants';
import { ToastService } from 'app/helpers/toast.service';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FormsModule } from '@angular/forms';
import { AutofocusDirective } from '../../../../../directives/autofocus.directive';
import { MarkdownComponent } from 'ngx-markdown';

@Component({
	selector: 'nx-note-renderer',
	templateUrl: './note-renderer.component.html',
	styleUrls: ['./note-renderer.component.scss'],
	animations: [animations.verticalInOutAnimation],
	imports: [
		TooltipDirective,
		FontAwesomeModule,
		FormsModule,
		AutofocusDirective,
		MarkdownComponent,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NoteRendererComponent implements OnInit {
	private readonly uiNoteRendererComponentMessages = injectUiMessages(RuntimeUiMessages);

	private _document: any;

	noteMimeType?: string;
	note?: string;
	showEditor = false;
	canSave = false;
	saving = false;
	tinymceOptions: any = {
		plugins: 'lists link image table code help wordcount textpattern',
	};

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly documentsManagerService: DocumentsManagerService,
		private readonly elementRef: ElementRef,
		private readonly toastrService: ToastService,
	) {}

	// --------------------------------------------------------------------------------------------------
	@Input() set document(value: any) {
		this._document = value;

		if (value) {
			this.noteMimeType = value.properties['note:mime_type'];
			this.note = value.properties['note:note'];
		} else {
			this.noteMimeType = '';
			this.note = '';
		}
	}

	// --------------------------------------------------------------------------------------------------
	get document() {
		return this._document;
	}

	// --------------------------------------------------------------------------------------------------
	toggleEditor() {
		this.showEditor = !this.showEditor;

		if (this.showEditor) this.canSave = false;
	}

	// --------------------------------------------------------------------------------------------------
	allowSave(_event: any) {
		this.canSave = true;
	}

	// --------------------------------------------------------------------------------------------------
	handleKeydown(event: any) {
		if (event.key == 'Tab') {
			event.preventDefault();
			const start = event.target.selectionStart;
			const end = event.target.selectionEnd;
			event.target.value =
				event.target.value.substring(0, start) + '\t' + event.target.value.substring(end);
			event.target.selectionStart = event.target.selectionEnd = start + 1;
		}
	}

	// --------------------------------------------------------------------------------------------------
	openInFullscreen() {
		const viewer = this.elementRef.nativeElement.querySelector('#viewer');

		if (!viewer?.children) return;

		const renderer = viewer.children[0];

		if (renderer.requestFullscreen) renderer.requestFullscreen();
		else if (renderer.webkitRequestFullscreen) /* Safari */ renderer.webkitRequestFullscreen();
		else if (renderer.msRequestFullscreen) /* IE11 */ renderer.msRequestFullscreen();
		else
			this.toastrService.error(
				this.uiNoteRendererComponentMessages.text(
					'app.notices.fullscreen-is-not-available-in-your-browser-abce6c',
					'Fullscreen is not available in your browser.',
				),
				this.uiNoteRendererComponentMessages.text(
					'app.notices.fullscreen-not-available-bdc19a',
					'Fullscreen not available',
				),
				{ enableHtml: false },
			);
	}

	// --------------------------------------------------------------------------------------------------
	saveChanges() {
		this.saving = true;

		this.documentsManagerService
			.updateDocument(this.document.uid, { 'note:note': this.note })
			.subscribe((_x) => {
				this.toastrService.success(
					this.uiNoteRendererComponentMessages.text(
						'app.notices.the-note-has-been-successfully-modified-27f5e0',
						'The note has been successfully modified.',
					),
					this.uiNoteRendererComponentMessages.text('app.notices.note-saved-123e3c', 'Note saved'),
					{ enableHtml: false },
				);
				this.toggleEditor();
				this.saving = false;
			});
	}

	// --------------------------------------------------------------------------------------------------
	discardChanges() {
		this.note = this.document.properties['note:note'];
		this.toggleEditor();
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		if (!this.document) throw 'nx-note-renderer: you must specify the document';
	}
}
