import { WebUiMessages } from '@maretha/webui-sdk';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from 'environments/environment';
import { ToastrService } from 'ngx-toastr';
import { Subject, of, map, catchError, throwError, switchMap, tap } from 'rxjs';
import { DocumentEnhancerService } from './document-enhancer.service';
import { DocumentsManagerService } from './documents-manager.service';

@Injectable({
	providedIn: 'root',
})
export class DocumentSnapshotsService {
	private readonly messages = inject(WebUiMessages);
	private readonly apiUrl = `${environment.nuxeoUrl}/api/v1`;

	snapshotCreated$ = new Subject();
	snapshotLoaded$ = new Subject();
	snapshotRestored$ = new Subject();
	comparingSnapshots$ = new Subject();

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly httpClient: HttpClient,
		private readonly toastrService: ToastrService,
		private readonly documentsManagerService: DocumentsManagerService,
		private readonly documentEnhancerService: DocumentEnhancerService,
	) {}

	// --------------------------------------------------------------------------------------------------
	getSnapshots(documentUid: string, repository?: string) {
		if (!documentUid) return of();

		const url = `${this.apiUrl}/automation/Document.GetVersions`;

		const headers = {
			headers: new HttpHeaders({
				properties: '*',
				...(repository ? { 'X-NXRepository': repository } : {}),
			}),
		};

		const payload = {
			params: {},
			context: {},
			input: documentUid,
		};

		return this.httpClient.post(url, payload, headers).pipe(
			map((x: any) => {
				const snapshots = x.entries
					.map((y: any) => this.documentEnhancerService.setDocumentCustomProperties(y))
					.reverse();

				let nextMinorVersion = '0.1';
				let nextMajorVersion = '1.0';

				if (snapshots.length > 0) {
					const next = snapshots[0].ng.version.split('.');

					nextMinorVersion = `${next[0]}.${(next[1] | 0) + 1}`;
					nextMajorVersion = `${(next[0] | 0) + 1}.0`;
				}

				return {
					snapshots,
					nextMinorVersion,
					nextMajorVersion,
				};
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	getSnapshot(snapshotUid: string) {
		return this.documentsManagerService
			.getDocumentInfo(snapshotUid)
			.pipe(tap(() => this.comparingSnapshots$.next(0)));
	}

	// --------------------------------------------------------------------------------------------------
	createSnapshot(documentUid: string, majorIncrement = false, repository?: string) {
		if (!documentUid) return of();

		const url = `${this.apiUrl}/automation/Document.CreateVersion`;

		const payload = {
			params: {
				increment: majorIncrement ? 'major' : 'minor',
				saveDocument: true,
			},
			context: {},
			input: documentUid,
		};

		return this.httpClient
			.post(url, payload, repository ? { headers: { 'X-NXRepository': repository } } : {})
			.pipe(
				tap((_x: any) => {
					this.toastrService.success(
						this.messages.format(
							'app.services.snapshots.created',
							{},
							'The document snapshot has been succesfully created.',
						),
						this.messages.format(
							'app.services.snapshots.created-title',
							{},
							'Document snapshot created',
						),
						{ enableHtml: false },
					);

					this.snapshotCreated$.next(documentUid);
				}),
				catchError((error) => {
					this.toastrService.error(
						this.messages.format(
							'app.services.snapshots.create-failed',
							{},
							'There was an error creating the document snapshot.',
						),
						this.messages.format(
							'app.services.snapshots.create-failed-title',
							{},
							'Error creating snapshot',
						),
						{ enableHtml: false },
					);

					return throwError(() => new Error(error));
				}),
			);
	}

	// --------------------------------------------------------------------------------------------------
	loadSnapshot(documentUid: string) {
		return this.documentsManagerService.reloadDocument(documentUid).pipe(
			tap((x) => {
				this.toastrService.info(
					this.messages.format(
						'app.services.snapshots.loaded',
						{ version: x.ng.version },
						'Displaying snapshot version {version}.',
					),
					this.messages.format(
						'app.services.snapshots.loaded-title',
						{},
						'Document snapshot loaded',
					),
					{ enableHtml: false },
				);

				this.snapshotLoaded$.next(documentUid);
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	restoreSnapshot(documentUid: string, backupBeforeRestore = false) {
		if (!documentUid) return of();

		const url = `${this.apiUrl}/automation/Document.RestoreVersion`;

		const payload = {
			params: {
				createVersion: backupBeforeRestore,
				checkout: true,
			},
			context: {},
			input: documentUid,
		};

		return this.httpClient.post(url, payload).pipe(
			switchMap(() => this.documentsManagerService.reloadDocument(documentUid)),
			tap((x) => {
				this.toastrService.success(
					this.messages.format(
						'app.services.snapshots.restored',
						{ version: x.ng.version },
						'The document has been restored to snapshot version {version}.',
					),
					this.messages.format(
						'app.services.snapshots.restored-title',
						{},
						'Document snapshot restored',
					),
					{ enableHtml: false },
				);

				this.snapshotRestored$.next(documentUid);
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	getSnapshotOriginalDocument(documentUid: string) {
		if (!documentUid) return of();

		const url = `${this.apiUrl}/automation/Proxy.GetSourceDocument`;

		const headers = {
			headers: new HttpHeaders({
				properties: '*',
			}),
		};

		const payload = {
			params: {},
			context: {},
			input: documentUid,
		};

		return this.httpClient
			.post(url, payload, headers)
			.pipe(map((x) => this.documentEnhancerService.setDocumentCustomProperties(x)));
	}
}
