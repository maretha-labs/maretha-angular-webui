import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DocumentAttachmentsService } from './document-attachments.service';

export type StagedUploadState = 'uploading' | 'uploaded' | 'failed';
export interface StagedUpload {
	readonly file: File;
	readonly index: number;
	readonly state: StagedUploadState;
}
/** An uploaded batch handed to a creation, which then owns and removes it. */
export interface StagedUploadBatch {
	readonly batchId: string;
	indexOf(file: File): number | undefined;
}

/**
 * One import dialog's files, uploaded the way stock's import uploads them: into one batch as soon as
 * they are chosen. Removing a file removes it from the batch, and a batch that was never handed to a
 * creation is removed when the dialog closes.
 */
@Injectable()
export class StagedImportUploads {
	private readonly attachments = inject(DocumentAttachmentsService);
	readonly entries = signal<readonly StagedUpload[]>([]);
	readonly files = computed(() => this.entries().map((entry) => entry.file));
	readonly uploading = computed(() => this.entries().some((entry) => entry.state === 'uploading'));
	readonly failed = computed(() => this.entries().some((entry) => entry.state === 'failed'));
	readonly ready = computed(
		() => this.entries().length > 0 && this.entries().every((entry) => entry.state === 'uploaded'),
	);
	private batchRequest?: Promise<string>;
	private batchId?: string;
	private nextIndex = 0;
	/** Changes when the files are handed off or discarded, so older uploads stop reporting. */
	private generation = 0;
	constructor() {
		inject(DestroyRef).onDestroy(() => void this.release());
	}
	add(files: readonly File[]): void {
		const added = files.map((file) => ({
			file,
			index: this.nextIndex++,
			state: 'uploading' as const,
		}));
		if (!added.length) return;
		this.entries.update((entries) => [...entries, ...added]);
		for (const entry of added) void this.upload(entry);
	}
	/** Uploads the failed files again; resolves when every upload has settled. */
	async retryFailed(): Promise<void> {
		const failed = this.entries().filter((entry) => entry.state === 'failed');
		for (const entry of failed) this.setState(entry, 'uploading');
		await Promise.all(failed.map((entry) => this.upload(entry)));
	}
	removeAt(position: number): void {
		const entry = this.entries()[position];
		if (!entry) return;
		this.entries.update((entries) => entries.filter((item) => item !== entry));
		// A file still uploading is removed from the batch when its upload lands.
		if (entry.state === 'uploaded' && this.batchId)
			void this.removeFromBatch(this.batchId, entry.index);
	}
	/** Hands the uploaded batch to a creation; this dialog no longer removes it. */
	take(): StagedUploadBatch | undefined {
		const batchId = this.batchId;
		const indexes = new Map(this.entries().map((entry) => [entry.file, entry.index]));
		this.reset();
		return batchId ? { batchId, indexOf: (file) => indexes.get(file) } : undefined;
	}
	private async release(): Promise<void> {
		const batchId = this.batchId;
		this.reset();
		if (batchId)
			await firstValueFrom(this.attachments.removeBatchJob(batchId)).catch(() => undefined);
	}
	private reset(): void {
		this.generation++;
		this.batchRequest = undefined;
		this.batchId = undefined;
		this.nextIndex = 0;
		this.entries.set([]);
	}
	private batch(): Promise<string> {
		if (this.batchRequest) return this.batchRequest;
		const generation = this.generation;
		const request = firstValueFrom(this.attachments.createUploadBatch()).then(
			(batchId) => {
				if (generation === this.generation) this.batchId = batchId;
				// Created after this dialog let its files go: nothing will use it.
				else void firstValueFrom(this.attachments.removeBatchJob(batchId)).catch(() => undefined);
				return batchId;
			},
			(error) => {
				if (generation === this.generation) this.batchRequest = undefined;
				throw error;
			},
		);
		return (this.batchRequest = request);
	}
	private async upload(entry: StagedUpload): Promise<void> {
		const generation = this.generation;
		try {
			const batchId = await this.batch();
			await firstValueFrom(this.attachments.uploadToBatch(batchId, entry.file, entry.index));
			if (generation !== this.generation) return;
			if (!this.current(entry)) return void this.removeFromBatch(batchId, entry.index);
			this.setState(entry, 'uploaded');
		} catch {
			if (generation === this.generation) this.setState(entry, 'failed');
		}
	}
	private current(entry: StagedUpload): StagedUpload | undefined {
		return this.entries().find((item) => item.file === entry.file && item.index === entry.index);
	}
	private setState(entry: StagedUpload, state: StagedUploadState): void {
		this.entries.update((entries) =>
			entries.map((item) =>
				item.file === entry.file && item.index === entry.index ? { ...item, state } : item,
			),
		);
	}
	private async removeFromBatch(batchId: string, index: number): Promise<void> {
		await firstValueFrom(this.attachments.removeBatchFile(batchId, index)).catch(() => undefined);
	}
}
