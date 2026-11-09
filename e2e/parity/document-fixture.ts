import { HttpRequest, HttpResponse } from '@angular/common/http';
import {
	ChangeDetectionStrategy,
	Component,
	inject,
	makeEnvironmentProviders,
	signal,
} from '@angular/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { of, Subject } from 'rxjs';
import { DocumentViewContext } from '@maretha/webui-sdk';
import { DestinationCreateDialogComponent } from 'app/components/quick-search/destination-create-dialog.component';
import { StandardContentLayoutComponent } from 'app/modules/explorer/components/viewers/standard-content-layout.component';
import { StandardContentEditorComponent } from 'app/modules/explorer/components/editors/standard-content-editor.component';
import { StandardDocumentPermissionsViewComponent } from 'app/modules/explorer/components/viewers/standard-document-permissions-view.component';
import { provideDefaultDocumentLayouts } from 'app/modules/explorer/components/default-document-layouts';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { CreationParentService } from 'app/modules/explorer/helpers/creation-parent.service';
import { DocumentCollectionsService } from 'app/modules/explorer/helpers/document-collections.service';
import { DocumentLayoutGatewayService } from 'app/modules/explorer/helpers/document-layout-gateway.service';
import { MetadataPolicyService } from 'app/modules/explorer/helpers/metadata-policy.service';
import { DocumentAttachmentsService } from 'app/modules/explorer/helpers/document-attachments.service';
import { provideDefaultToolbar } from 'app/modules/explorer/components/document-toolbar/default-toolbar';

const types = [
	'Audio',
	'Collection',
	'File',
	'Folder',
	'Note',
	'OrderedFolder',
	'Picture',
	'Video',
];
const parent = {
	uid: 'synthetic-parent',
	type: 'Folder',
	title: 'Synthetic folder',
	path: '/synthetic',
	facets: ['Folderish'],
	contextParameters: {
		permissions: ['Read', 'WriteProperties', 'AddChildren'],
		subtypes: types.map((type) => ({ type })),
	},
	ng: {
		subTypes: types.map((name) => ({
			name,
			label: name,
			schemas: { file: ['File', 'Picture', 'Audio', 'Video'].includes(name) },
		})),
	},
};
const note: any = {
	uid: 'synthetic-note',
	repository: 'default',
	parentRef: parent.uid,
	type: 'Note',
	title: 'Synthetic note',
	path: '/synthetic/note',
	state: 'project',
	changeToken: 'fixture',
	isCheckedOut: true,
	facets: ['Versionable', 'NXTag'],
	schemas: [
		{ name: 'dublincore', prefix: 'dc' },
		{ name: 'note', prefix: 'note' },
	],
	properties: {
		'dc:title': 'Synthetic note',
		'dc:description': 'Local document parity fixture',
		'dc:creator': 'fixture-user',
		'dc:contributors': ['fixture-user'],
		'dc:created': '2026-10-24T12:00:00Z',
		'dc:modified': '2026-10-24T12:00:00Z',
		'uid:major_version': 0,
		'uid:minor_version': 1,
		'note:mime_type': 'text/plain',
		'note:note': 'This synthetic note tests the real document layout and comment controls.',
		'dc:subjects': [],
		'files:files': [],
		'nxtag:tags': [],
	},
	contextParameters: {
		permissions: ['Read', 'WriteProperties', 'WriteSecurity'],
		userVisiblePermissions: ['Read', 'ReadWrite', 'Everything'],
		acls: [
			{
				name: 'inherited',
				aces: [
					{
						id: 'fixture-ace',
						username: 'fixture-user',
						permission: 'Everything',
						granted: true,
						status: 'effective',
					},
				],
			},
		],
		tags: [],
		pendingTasks: [],
		runningWorkflows: [],
	},
	ng: {
		createdBy: 'fixture-user',
		isFolder: false,
		canWrite: true,
		versionable: true,
		version: '0.1',
		snapshots: [],
		collections: {},
		facets: {},
		schemas: {},
		attachments: [],
	},
};
const metadata = {
	name: 'Note',
	schemas: [
		{
			name: 'dublincore',
			prefix: 'dc',
			fields: {
				title: { type: 'string' },
				description: { type: 'string' },
				nature: { type: 'string' },
				subjects: { type: 'string[]' },
				coverage: { type: 'string' },
				expired: { type: 'date' },
			},
		},
		{
			name: 'note',
			prefix: 'note',
			fields: { mime_type: { type: 'string' }, note: { type: 'string' } },
		},
	],
};
const comments: any[] = [];
export function provideDocumentFixture() {
	const fetched = new Subject<any>();
	return makeEnvironmentProviders([
		provideDefaultDocumentLayouts(),
		provideDefaultToolbar(),
		{
			provide: DocumentsManagerService,
			useValue: {
				documentInfo: note,
				documentFetched: signal(note),
				documentFetched$: fetched,
				documentsUpdated$: of([]),
				selectedDocumentsUpdated$: of([]),
				documentTypes: {},
				getDocumentType: (type: string) => of({ ...metadata, name: type }),
				getComments: () => of({ entries: [...comments], totalSize: comments.length }),
				leaveComment: (parentId: string, text: string, id?: string) => {
					const result = {
						id: id || `comment-${comments.length + 1}`,
						parentId,
						text,
						author: 'fixture-user',
						creationDate: new Date().toISOString(),
						modificationDate: new Date().toISOString(),
						ancestorIds: [note.uid],
						numberOfReplies: 0,
					};
					if (!id) comments.push(result);
					return of(result);
				},
				deleteComment: (_parentId: string, id: string) => {
					const index = comments.findIndex((comment) => comment.id === id);
					if (index >= 0) comments.splice(index, 1);
					return of({});
				},
				reloadDocument: () => of(note),
				syncSavedDocument: () => of(note),
				getDocumentInfo: () => of(note),
				suggestTag: () => of([]),
				addTag: () => of(note),
				removeTag: () => of(note),
			},
		},
		{
			provide: CreationParentService,
			useValue: {
				load: () =>
					of({
						document: parent,
						types: types.map((name) => ({
							name,
							label: name,
							file: ['File', 'Audio', 'Video', 'Picture', 'Note'].includes(name),
							folder: ['Folder', 'OrderedFolder', 'Collection'].includes(name),
						})),
						allowed: true,
					}),
				readId: () => of(parent),
			},
		},
		{
			provide: DocumentCollectionsService,
			useValue: {
				documentCollectionsList: signal([]),
				documentCollectionsUpdated$: of([]),
				documentsAddedToCollection$: new Subject(),
				documentsRemovedFromCollection$: new Subject(),
			},
		},
		{
			provide: MetadataPolicyService,
			useValue: {
				revision: signal(0),
				policy: signal({ version: 1, rules: [] }),
				load: () => Promise.resolve(),
				userPreferences: () => ({
					hiddenSchemas: [],
					hiddenFields: [],
					fieldOrder: [],
					metadataHidden: false,
				}),
				canRead: () => true,
				canWrite: () => true,
				visibleDocument: (document: any) => document,
				setUserPreferences: () => undefined,
				assertWritable: () => Promise.resolve(),
			},
		},
		{
			provide: DocumentLayoutGatewayService,
			useValue: {
				readType: () => Promise.resolve(metadata),
				readDocumentType: () => Promise.resolve(metadata),
				resolveReference: () => of(null),
				resolveReference$: () => of(null),
				searchReferences: () => of([]),
				update: (_document: any, properties: any) =>
					Promise.resolve({ ...note, properties: { ...note.properties, ...properties } }),
			},
		},
		{
			provide: DocumentAttachmentsService,
			useValue: { downloadDocumentBlob: () => of(undefined) },
		},
	]);
}
export function documentFixtureResponse(
	request: HttpRequest<unknown>,
): HttpResponse<unknown> | null {
	if (request.url.endsWith('/ui/config.jsp'))
		return new HttpResponse({
			body: 'Nuxeo.UI.config = {"permissions":{"externalUsers":"true"}};',
		});
	if (request.url.includes('/api/v1/user/'))
		return new HttpResponse({
			body: {
				id: 'fixture-user',
				properties: { username: 'fixture-user', email: 'fixture-user@example.invalid' },
			},
		});
	if (request.url.includes('/synthetic-note')) return new HttpResponse({ body: note });
	if (request.url.includes('/config/types/')) return new HttpResponse({ body: metadata });
	if (request.url.endsWith('/UserGroup.Suggestion'))
		return new HttpResponse({ body: [{ id: 'members', label: 'Members', type: 'GROUP_TYPE' }] });
	return null;
}
@Component({
	selector: 'nx-document-parity-fixture',
	imports: [
		StandardContentLayoutComponent,
		StandardContentEditorComponent,
		StandardDocumentPermissionsViewComponent,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `<nav aria-label="Document fixture views">
			<a href="?surface=document-parity&view=note">Note</a
			><a href="?surface=document-parity&view=permissions">Permissions</a
			><a href="?surface=document-parity&view=create">Create wizard</a
			><a href="?surface=document-parity&view=file-edit">File edit</a>
		</nav>
		@switch (view) {
			@case ('permissions') {
				<nx-standard-document-permissions-view [context]="context" />
			}
			@case ('create') {
				<button type="button" (click)="create()">Open Create / Import</button>
			}
			@case ('file-edit') {
				<nx-standard-content-editor documentType="File" [add]="false" [documents]="[file]" />
			}
			@default {
				<nx-standard-content-layout [document]="note" />
			}
		}`,
	styles:
		':host{display:block;min-width:0}nav{display:flex;gap:16px;flex-wrap:wrap;padding:16px}nav a{color:var(--nuxeo-primary-color)}',
})
export class DocumentParityFixture {
	readonly view = new URLSearchParams(location.search).get('view') || 'note';
	readonly note = note;
	readonly file = { ...note, type: 'File' };
	readonly context = {
		document: note,
		noEdit: false,
		viewId: 'permissions',
		loading: false,
		searchActive: false,
	} as DocumentViewContext;
	private readonly modal = inject(BsModalService);
	create(): void {
		this.modal.show(DestinationCreateDialogComponent, {
			class: 'modal-lg modal-dialog-centered',
			ignoreBackdropClick: true,
			keyboard: false,
			initialState: { initialPath: '/synthetic' },
		});
	}
}
