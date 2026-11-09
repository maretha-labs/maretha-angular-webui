import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DocumentLayoutContext } from '@maretha/webui-sdk';
import { STANDARD_FOLDER_RESULTS_TYPES } from '../../helpers/standard-document-surfaces';
import { GenericFolderishViewerComponent } from './generic-folderish-viewer/generic-folderish-viewer.component';
import { FolderishDetailsLayoutComponent } from './folderish-details-layout.component';
import { FolderishDetailsPanelComponent } from './folderish-details-panel.component';
import { PictureBookContentLayoutComponent } from './picturebook-content-layout.component';

@Component({ selector: 'nx-picturebook-content-layout', template: 'Scoped folder results' })
class ScopedResults {
	readonly document = input<any>();
	readonly noEdit = input(false);
	readonly layoutContext = input<DocumentLayoutContext>();
	readonly contentLabel = input('');
}
@Component({ selector: 'nx-generic-folderish-viewer', template: 'Generic custom results' })
class GenericResults {
	readonly document = input<any>();
}
@Component({ selector: 'nx-folderish-details-panel', template: 'Details' })
class Details {
	readonly document = input<any>();
	readonly noEdit = input(false);
}

describe('FolderishDetailsLayoutComponent results ownership', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({ imports: [FolderishDetailsLayoutComponent] });
		TestBed.overrideComponent(FolderishDetailsLayoutComponent, {
			remove: {
				imports: [
					PictureBookContentLayoutComponent,
					GenericFolderishViewerComponent,
					FolderishDetailsPanelComponent,
				],
			},
			add: { imports: [ScopedResults, GenericResults, Details] },
		});
	});
	it('mounts the scoped result and selection-action owner for ordinary Folder documents', () => {
		const fixture = TestBed.createComponent(FolderishDetailsLayoutComponent);
		const document = { uid: 'folder', type: 'Folder' };
		fixture.componentRef.setInput('document', document);
		fixture.componentRef.setInput('noEdit', true);
		fixture.detectChanges();
		const scoped = fixture.debugElement.query(By.directive(ScopedResults))
			.componentInstance as ScopedResults;
		expect(scoped.document()).toBe(document);
		expect(scoped.contentLabel()).toBe('Folder');
		expect(scoped.noEdit()).toBeTrue();
		expect(fixture.debugElement.query(By.directive(GenericResults))).toBeNull();
		// The scoped body owns its details panel; it must not be mounted twice.
		expect(fixture.debugElement.query(By.directive(Details))).toBeNull();
	});
	it('agrees with the outer toolbar on every stock result owner and preserves custom fallbacks', () => {
		const fixture = TestBed.createComponent(FolderishDetailsLayoutComponent);
		for (const type of STANDARD_FOLDER_RESULTS_TYPES) {
			fixture.componentRef.setInput('document', { uid: type, type });
			fixture.detectChanges();
			expect(fixture.debugElement.query(By.directive(ScopedResults)))
				.withContext(type)
				.not.toBeNull();
		}
		fixture.componentRef.setInput('document', { uid: 'custom', type: 'CustomerFolder' });
		fixture.detectChanges();
		expect(fixture.debugElement.query(By.directive(ScopedResults))).toBeNull();
		expect(fixture.debugElement.query(By.directive(GenericResults))).not.toBeNull();
		expect(fixture.debugElement.query(By.directive(Details))).not.toBeNull();
	});
});
