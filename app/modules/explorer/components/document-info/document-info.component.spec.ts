import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToastService } from 'app/helpers/toast.service';
import { of } from 'rxjs';
import { AutomationsService } from '../../helpers/automations.service';
import { DocumentSnapshotsService } from '../../helpers/document-snapshots.service';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';

import { DocumentInfoComponent } from './document-info.component';

describe('DocumentInfoComponent', () => {
	let component: DocumentInfoComponent;
	let fixture: ComponentFixture<DocumentInfoComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [DocumentInfoComponent],
		}).compileComponents();
	});

	beforeEach(() => {
		fixture = TestBed.createComponent(DocumentInfoComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('document', fixtureDocument());
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});

describe('Document info versions and updates', () => {
	const snapshots = {
		snapshots: [{ uid: 'v1', lastModified: '2026-01-01' }],
		nextMajorVersion: '2.0',
		nextMinorVersion: '1.1',
	};
	function create(document: any | null = { ...fixtureDocument(), ng: { versionable: true } }) {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [DocumentInfoComponent],
		}).overrideComponent(DocumentInfoComponent, { set: { template: '' } });
		const documents = TestBed.inject(DocumentsManagerService);
		const versions = TestBed.inject(DocumentSnapshotsService);
		const info = spyOn(documents, 'getDocumentInfo').and.callFake((uid: string) =>
			of({
				...fixtureDocument(),
				uid,
				lastModified: '2026-02-02',
				isCheckedOut: true,
				ng: { versionable: true },
			}),
		);
		const getSnapshots = spyOn(versions, 'getSnapshots').and.returnValue(of(snapshots));
		const fixture = TestBed.createComponent(DocumentInfoComponent);
		if (document) fixture.componentRef.setInput('document', document);
		else
			documents.documentInfo = { ...fixtureDocument(), uid: 'current', ng: { versionable: false } };
		fixture.detectChanges();
		return {
			fixture,
			component: fixture.componentInstance,
			documents,
			versions,
			info,
			getSnapshots,
		};
	}
	it('loads the document and its versions on init and derives whether a version can be created', () => {
		const { component, info, getSnapshots } = create();
		expect(info).toHaveBeenCalledOnceWith('fixture-document');
		expect(getSnapshots).toHaveBeenCalledOnceWith('fixture-document');
		expect(component.document.ng).toEqual(
			jasmine.objectContaining({
				snapshots: snapshots.snapshots,
				nextMajorVersion: '2.0',
				nextMinorVersion: '1.1',
				canCreateSnapshot: true,
			}),
		);
	});
	it('falls back to the current document and skips version loading for non-versionable documents', () => {
		const { component, info, getSnapshots, versions } = create(null);
		expect(info).toHaveBeenCalledOnceWith('current');
		expect(component.document.uid).toBe('current');
		getSnapshots.calls.reset();
		component.document.ng.versionable = false;
		versions.snapshotCreated$.next('current');
		expect(getSnapshots).not.toHaveBeenCalled();
		component.document.ng.versionable = true;
		versions.snapshotCreated$.next('current');
		expect(getSnapshots).toHaveBeenCalledOnceWith('current');
	});
	it('keeps loaded versions across document updates and ignores updates to other documents', () => {
		const { component, documents } = create();
		const loaded = component.document;
		documents.documentsUpdated$.next([{ uid: 'other', ng: {} }]);
		expect(component.document).toBe(loaded);
		const updated = {
			...fixtureDocument(),
			title: 'Renamed',
			isCheckedOut: false,
			ng: { versionable: true },
		};
		documents.documentsUpdated$.next([updated]);
		expect(component.document).toBe(updated);
		expect(component.document.ng.snapshots).toEqual(snapshots.snapshots);
		expect(component.document.ng.canCreateSnapshot).toBeFalse();
		component.document = { ...fixtureDocument(), ng: {} };
		const plain = { ...fixtureDocument(), title: 'Plain', ng: {} };
		documents.documentsUpdated$.next([plain]);
		expect(component.document).toBe(plain);
		expect(component.document.ng.snapshots).toBeUndefined();
	});
	it('creates minor versions by default and major versions on request', () => {
		const { component, versions } = create();
		const createSnapshot = spyOn(versions, 'createSnapshot').and.returnValue(of({}) as never);
		component.createSnapshot();
		component.createSnapshot(true);
		expect(createSnapshot.calls.allArgs()).toEqual([
			['fixture-document', false],
			['fixture-document', true],
		]);
	});
	it('refreshes the document and reports the publication of a copy of this document only', () => {
		const { component, info } = create();
		const toastr = spyOn(TestBed.inject(ToastService), 'success');
		const automations = TestBed.inject(AutomationsService);
		component.internalPublicationsPopover = true;
		automations.documentPublished$.next({ documentUid: 'other', targetUid: 'section' });
		expect(info).toHaveBeenCalledTimes(1);
		expect(component.internalPublicationsPopover).toBeTrue();
		automations.documentPublished$.next({ documentUid: 'fixture-document', targetUid: 'section' });
		expect(info).toHaveBeenCalledTimes(2);
		expect(component.internalPublicationsPopover).toBeFalse();
		expect(toastr).toHaveBeenCalledOnceWith(
			'A copy of the document was published to the specified section.',
			'Document published',
			{ enableHtml: false },
		);
	});
});
