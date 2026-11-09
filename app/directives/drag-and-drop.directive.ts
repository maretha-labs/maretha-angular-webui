import { Directive, HostListener, EventEmitter, Output, Input } from '@angular/core';

@Directive({ selector: '[nxDragAndDrop]' })
export class DragAndDropDirective {
	@Input() nxDragAndDrop = true;
	@Output() readonly filesDragged = new EventEmitter<boolean>();
	@Output() readonly filesDropped = new EventEmitter<File[]>();

	// --------------------------------------------------------------------------------------------------
	@HostListener('dragover', ['$event'])
	onDragOver(event: any) {
		if (!this.nxDragAndDrop) return;

		event.preventDefault();
		event.stopPropagation();

		if (event.dataTransfer.types.every((x: string) => x === 'Files')) this.filesDragged.emit(true);
	}

	// --------------------------------------------------------------------------------------------------
	@HostListener('dragleave', ['$event'])
	onDragLeave(event: any) {
		if (!this.nxDragAndDrop) return;

		event.preventDefault();
		event.stopPropagation();

		if (event.dataTransfer.types.every((x: string) => x === 'Files')) this.filesDragged.emit(false);
	}

	// --------------------------------------------------------------------------------------------------
	@HostListener('drop', ['$event'])
	onDrop(event: any) {
		if (!this.nxDragAndDrop) return;

		event.preventDefault();
		event.stopPropagation();

		if (!event.dataTransfer.types.every((x: string) => x === 'Files')) return;

		const files: File[] = Array.from(event.dataTransfer.files);

		this.filesDragged.emit(false);

		if (files.length) this.filesDropped.emit(files);
	}
}
