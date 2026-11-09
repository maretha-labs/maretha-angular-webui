import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { DocumentCollectionsService } from '../../helpers/document-collections.service';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { DocumentCollectionsPanelComponent } from './document-collections-panel.component';

describe('DocumentCollectionsPanelComponent', () => {
	let fixture: ComponentFixture<DocumentCollectionsPanelComponent>;
	let collections: jasmine.SpyObj<DocumentCollectionsService>;
	let documents: jasmine.SpyObj<DocumentsManagerService>;
	let membershipUpdates: Subject<any>;
	beforeEach(async () => {
		collections = jasmine.createSpyObj('DocumentCollectionsService', ['removeDocumentMembership']);
		membershipUpdates = new Subject();
		(collections as any).documentsAddedToCollection$ = membershipUpdates;
		documents = jasmine.createSpyObj('DocumentsManagerService', ['reloadDocument']);
		collections.removeDocumentMembership.and.returnValue(of({}));
		documents.reloadDocument.and.returnValue(of({}));
		await TestBed.configureTestingModule({
			imports: [DocumentCollectionsPanelComponent],
			providers: [
				provideRouter([]),
				{ provide: DocumentCollectionsService, useValue: collections },
				{ provide: DocumentsManagerService, useValue: documents },
			],
		}).compileComponents();
		fixture = TestBed.createComponent(DocumentCollectionsPanelComponent);
	});
	it('matches repository-tagged membership events and preserves untagged reloads', () => {
		fixture.componentRef.setInput('document', { uid: 'document-a', repository: 'archive' });
		const event = {
			documentUids: ['document-a'],
			collectionUid: 'favorites',
			collectionTotalCount: 1,
		};
		membershipUpdates.next({ ...event, repository: 'default' });
		expect(documents.reloadDocument).not.toHaveBeenCalled();
		membershipUpdates.next({ ...event, repository: 'archive' });
		expect(documents.reloadDocument).toHaveBeenCalledOnceWith('document-a', 'archive');
		documents.reloadDocument.calls.reset();
		membershipUpdates.next(event);
		expect(documents.reloadDocument).toHaveBeenCalledOnceWith('document-a');
	});
	it('renders enriched memberships and removes the current document with the source operation contract', () => {
		fixture.componentRef.setInput('document', {
			uid: 'document-a',
			contextParameters: {
				permissions: ['WriteProperties'],
				collections: [{ uid: 'collection-a', title: 'Finance' }],
			},
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('a').textContent).toContain('Finance');
		(fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
		expect(collections.removeDocumentMembership).toHaveBeenCalledOnceWith(
			'document-a',
			'collection-a',
		);
		expect(documents.reloadDocument).toHaveBeenCalledOnceWith('document-a');
	});
	it('does not expose removal for an immutable or non-writable document', () => {
		fixture.componentRef.setInput('document', {
			uid: 'document-a',
			isRecord: true,
			contextParameters: {
				permissions: [],
				collections: [{ uid: 'collection-a', title: 'Finance' }],
			},
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('button')).toBeNull();
		fixture.componentInstance.remove('collection-a');
		expect(collections.removeDocumentMembership).not.toHaveBeenCalled();
	});
});
