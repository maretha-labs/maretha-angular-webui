import { pdfDefaultOptions } from 'ngx-extended-pdf-viewer';
import { fixtureDocument, legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DocumentLayoutGatewayService } from '../../../helpers/document-layout-gateway.service';
import { DocumentsManagerService } from '../../../helpers/documents-manager.service';
import { MetadataPolicyService } from '../../../helpers/metadata-policy.service';

import { GenericNonFolderishViewerComponent } from './generic-non-folderish-viewer.component';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

describe('GenericNonFolderishViewerComponent', () => {
	let component: GenericNonFolderishViewerComponent;
	let fixture: ComponentFixture<GenericNonFolderishViewerComponent>;

	let previousFolder: typeof pdfDefaultOptions.assetsFolder;
	let previousTarget: typeof pdfDefaultOptions.externalLinkTarget;
	beforeEach(async () => {
		previousFolder = pdfDefaultOptions.assetsFolder;
		previousTarget = pdfDefaultOptions.externalLinkTarget;
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [GenericNonFolderishViewerComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(GenericNonFolderishViewerComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	afterEach(() => {
		fixture.destroy();
		pdfDefaultOptions.assetsFolder = previousFolder;
		pdfDefaultOptions.externalLinkTarget = previousTarget;
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
	it('preserves existing rendition query parameters when adding the content revision', () => {
		const document: any = fixtureDocument();
		document.ng.attachment = { 'mime-type': 'text/plain' };
		document.contextParameters.renditions = [
			{ name: 'pdf', url: '/nuxeo/api/rendition/pdf?repository=default' },
		];
		document.changeToken = '11-0';
		component.document = document;
		const url = new URL(component.contentUrl);
		expect(url.searchParams.get('repository')).toBe('default');
		expect(url.searchParams.get('changeToken')).toBe('11-0');
		expect(component.mimeType).toBe('pdf');
	});
	it('updates only the displayed document when a retained result list emits changes', () => {
		const document = {
			...fixtureDocument(),
			uid: 'displayed',
			repository: 'archive',
			title: 'Before',
		};
		component.document = document;
		const changes = TestBed.inject(DocumentsManagerService).documentsUpdated$;
		changes.next([
			{ ...document, uid: 'unrelated', title: 'Wrong first result' },
			{ ...document, title: 'Updated' },
		]);
		expect(component.document.uid).toBe('displayed');
		expect(component.document.title).toBe('Updated');
		changes.next([{ ...document, repository: 'default', title: 'Wrong repository' }]);
		expect(component.document.repository).toBe('archive');
		expect(component.document.title).toBe('Updated');
	});
});

describe('Document main file controls', () => {
	let fixture: ComponentFixture<GenericNonFolderishViewerComponent>;
	let component: GenericNonFolderishViewerComponent;
	let gateway: { uploadBlob: jasmine.Spy; releaseBlob: jasmine.Spy; update: jasmine.Spy };
	let policy: { canWrite: jasmine.Spy; assertWritable: jasmine.Spy; revision: () => number };
	let manager: { reloadDocument: jasmine.Spy; documentFetched$: any; documentsUpdated$: any };
	const doc = (uid = 'file', repository = 'archive') => ({
		...fixtureDocument('File'),
		uid,
		repository,
		properties: {
			'file:content': { data: '/main.pdf', name: 'main.pdf', 'mime-type': 'application/pdf' },
		},
		contextParameters: { permissions: ['WriteProperties'], renditions: [] },
	});
	beforeEach(async () => {
		gateway = {
			uploadBlob: jasmine.createSpy().and.resolveTo({ 'upload-batch': 'batch' }),
			releaseBlob: jasmine.createSpy().and.resolveTo(),
			update: jasmine.createSpy().and.resolveTo({}),
		};
		policy = {
			canWrite: jasmine.createSpy().and.returnValue(true),
			assertWritable: jasmine.createSpy().and.resolveTo(),
			revision: () => 0,
		};
		manager = {
			reloadDocument: jasmine
				.createSpy()
				.and.callFake((uid, repository) => of(doc(uid, repository))),
			documentFetched$: of(),
			documentsUpdated$: of(),
		};
		await TestBed.configureTestingModule({
			imports: [GenericNonFolderishViewerComponent],
			providers: [
				...legacyTestProviders(),
				{ provide: DocumentLayoutGatewayService, useValue: gateway },
				{ provide: MetadataPolicyService, useValue: policy },
				{ provide: DocumentsManagerService, useValue: manager },
			],
		})
			.overrideComponent(GenericNonFolderishViewerComponent, { set: { template: '', imports: [] } })
			.compileComponents();
		fixture = TestBed.createComponent(GenericNonFolderishViewerComponent);
		component = fixture.componentInstance;
		component.document = doc();
	});
	afterEach(() => fixture.destroy());
	it('offers writable main-file actions and recomputes them for retention, no-edit, and metadata restrictions', () => {
		const blob = component.document.properties['file:content'];
		expect(component.blobContext(blob, 'file:content').noEdit).toBeFalse();
		component.noEdit = true;
		expect(component.blobContext(blob, 'file:content').noEdit).toBeTrue();
		component.noEdit = false;
		component.document.isUnderRetentionOrLegalHold = true;
		expect(component.blobContext(blob, 'file:content').noEdit).toBeTrue();
		component.document.isUnderRetentionOrLegalHold = false;
		policy.canWrite.and.returnValue(false);
		expect(component.blobContext(blob, 'file:content').noEdit).toBeTrue();
	});
	it('removes the main blob in its repository and reloads the saved document', async () => {
		await component.saveMainBlob(null);
		expect(policy.assertWritable).toHaveBeenCalledWith(jasmine.objectContaining({ uid: 'file' }), {
			'file:content': null,
		});
		expect(gateway.update).toHaveBeenCalledWith(
			jasmine.objectContaining({ uid: 'file' }),
			{ 'file:content': null },
			'archive',
		);
		expect(manager.reloadDocument).toHaveBeenCalledWith('file', 'archive');
	});
	it('releases an upload without saving it after navigating to another document', async () => {
		let complete!: (value: unknown) => void;
		gateway.uploadBlob.and.returnValue(
			new Promise((resolve) => {
				complete = resolve;
			}),
		);
		const upload = component.replaceMainBlob(new File(['content'], 'replacement.txt'));
		component.document = doc('other');
		complete({ 'upload-batch': 'batch' });
		await upload;
		expect(gateway.update).not.toHaveBeenCalled();
		expect(gateway.releaseBlob).toHaveBeenCalledWith({ 'upload-batch': 'batch' });
	});
	it('rejects callbacks retained from another document and callbacks for a rendition xpath', async () => {
		const old = component.blobContext(
			component.document.properties['file:content'],
			'file:content',
		);
		component.document = doc('other');
		const confirm = spyOn(TestBed.inject(ConfirmDialogService), 'confirm').and.resolveTo(true);
		old.replace?.(new File(['replacement'], 'replacement.txt'));
		old.remove?.();
		const rendition = component.blobContext(
			component.document.properties['file:content'],
			'picture:views/0/content',
		);
		rendition.replace?.(new File(['replacement'], 'replacement.txt'));
		rendition.remove?.();
		await Promise.resolve();
		expect(confirm).not.toHaveBeenCalled();
		expect(gateway.uploadBlob).not.toHaveBeenCalled();
		expect(gateway.update).not.toHaveBeenCalled();
	});
});
