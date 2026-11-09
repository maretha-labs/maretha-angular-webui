import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	Input,
	OnChanges,
	OnDestroy,
	OnInit,
	SimpleChanges,
	inject,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import {
	ComparisonProperty,
	DocumentComparisonService,
} from '../../../helpers/document-comparison.service';
import { ComparisonValueComponent } from '../document-comparison/comparison-value.component';
import { DocumentsManagerService } from '../../../helpers/documents-manager.service';

@Component({
	selector: 'nx-document-snapshot-comparison',
	templateUrl: './document-snapshot-comparison.component.html',
	styleUrls: ['./document-snapshot-comparison.component.scss'],
	imports: [FormsModule, NgClass, ComparisonValueComponent, WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentSnapshotComparisonComponent implements OnChanges, OnInit, OnDestroy {
	@Input() documents: Record<string, any>[] = [];
	@Input() snapshots: Record<string, any>[] = [];
	propertiesToCompare: readonly ComparisonProperty[] = [];
	pivot?: Record<string, any>;
	private readonly manager = inject(DocumentsManagerService);
	private readonly cdr = inject(ChangeDetectorRef);
	private metadataEpoch = 0;
	private metadataRequest?: Subscription;
	constructor(
		private readonly bsModalRef: BsModalRef,
		private readonly comparison: DocumentComparisonService,
	) {}
	ngOnChanges(changes: SimpleChanges): void {
		if (changes['documents']) this.initialize();
	}
	ngOnInit(): void {
		this.initialize();
	}
	ngOnDestroy(): void {
		this.metadataRequest?.unsubscribe();
		this.metadataEpoch++;
	}
	private initialize(): void {
		this.metadataRequest?.unsubscribe();
		const epoch = ++this.metadataEpoch;
		if (!this.documents.length) {
			this.propertiesToCompare = [];
			this.pivot = undefined;
			return;
		}
		this.propertiesToCompare = this.comparison.properties(this.documents);
		if (!this.pivot || !this.documents.includes(this.pivot)) this.pivot = this.documents[0];
		this.metadataRequest = this.manager
			.getDocumentType(String(this.documents[0]['type'] || ''))
			.subscribe({
				next: (metadata) => {
					if (epoch !== this.metadataEpoch) return;
					this.propertiesToCompare = this.comparison.properties(this.documents, metadata);
					this.cdr.markForCheck();
				},
				error: () => {
					if (epoch === this.metadataEpoch) this.cdr.markForCheck();
				},
			});
	}
	close(): void {
		this.bsModalRef.hide();
	}
	version(document: Record<string, any>): string {
		return String(document['ng']?.['version'] || document['uid'] || '');
	}
	updateDocument(index: number, version: string): void {
		const next = this.snapshots.find((snapshot) => this.version(snapshot) === version);
		if (!next) return;
		this.documents = this.documents.map((document, candidate) =>
			candidate === index ? next : document,
		);
		this.initialize();
	}
	cell(document: Record<string, any>, property: ComparisonProperty) {
		return this.comparison.cell(document, property, this.pivot);
	}
}
