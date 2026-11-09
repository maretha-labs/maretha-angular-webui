import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, Input } from '@angular/core';
import { DocumentProjectionRegistry } from '@maretha/webui-sdk';

import { DocumentVersionsComponent } from './document-snapshots.component';
import { DocumentSnapshotsService } from '../../helpers/document-snapshots.service';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { of } from 'rxjs';

@Component({
	standalone: true,
	template: '<output>version projection {{ projectionContext?.document?.uid }}</output>',
})
class VersionProjection {
	@Input() projectionContext: any;
}

describe('DocumentVersionsComponent', () => {
	let component: DocumentVersionsComponent;
	let fixture: ComponentFixture<DocumentVersionsComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders(), { provide: 'document', useValue: fixtureDocument() }],
			imports: [DocumentVersionsComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(DocumentVersionsComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	it('mounts and disposes a client versions-items projection at the real snapshots host', () => {
		(component.document.ng as any).snapshots = [
			{
				uid: 'snapshot',
				lastModified: '2026-01-01T00:00:00Z',
				ng: { version: '1.0', lastModifiedBy: 'system' },
			},
		];
		const registry = TestBed.inject(DocumentProjectionRegistry);
		const dispose = registry.register({
			id: 'client.items',
			name: 'versions.items',
			component: VersionProjection,
			priority: 10,
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('version projection fixture-document');
		dispose();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('1.0');
	});

	it('hides and restores default snapshot actions through the real host', () => {
		component.document.contextParameters.permissions.push('WriteVersion');
		(component.document.ng as any).canCreateSnapshot = true;
		(component.document.ng as any).nextMinorVersion = '1.1';
		const registry = TestBed.inject(DocumentProjectionRegistry);
		const hide = registry.register({
			id: 'client.hide-actions',
			name: 'versions.actions',
			disabled: true,
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).not.toContain('Create a new minor snapshot');
		hide();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Create a new minor snapshot');
	});
	it('renders server version properties and modification details in the compact list without unlabeled action buttons', () => {
		fixture.componentRef.setInput('compact', true);
		component.document.ng.snapshots = [
			{
				uid: 'snapshot',
				properties: {
					'uid:major_version': 0,
					'uid:minor_version': 2,
					'dc:modified': '2026-10-26T14:00:00Z',
					'dc:lastContributor': 'gpt',
				},
				ng: {},
			},
		];
		fixture.detectChanges();
		const button = fixture.nativeElement.querySelector(
			'.compact-versions button',
		) as HTMLButtonElement;
		expect(button.textContent).toContain('0.2');
		expect(button.textContent).toContain('gpt');
		expect(fixture.nativeElement.querySelectorAll('.compact-versions button').length).toBe(1);
	});
	it('offers a major version by default and names the current version in the dialog heading, as stock does', () => {
		expect(component.versionKind).toBe('major');
		component.document.contextParameters.permissions.push('WriteVersion');
		component.document.isCheckedOut = true;
		component.document.properties['uid:major_version'] = 1;
		component.document.properties['uid:minor_version'] = 2;
		fixture.componentRef.setInput('compact', true);
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('dialog h2')?.textContent).toContain(
			`Create Version for ${component.document.title} - Version 1.2`,
		);
	});

	it('creates the chosen major version in the document repository and reloads it', async () => {
		component.document.repository = 'archive';
		component.document.contextParameters.permissions.push('WriteVersion');
		component.document.isCheckedOut = true;
		component.versionKind = 'major';
		const create = spyOn(
			TestBed.inject(DocumentSnapshotsService),
			'createSnapshot',
		).and.returnValue(of({}));
		const reload = spyOn(TestBed.inject(DocumentsManagerService), 'reloadDocument').and.returnValue(
			of(component.document),
		);
		const dialog = { close: jasmine.createSpy() };
		await component.createCompactVersion(dialog as any);
		expect(create).toHaveBeenCalledWith(component.document.uid, true, 'archive');
		expect(reload).toHaveBeenCalledWith(component.document.uid, 'archive');
		expect(dialog.close).toHaveBeenCalled();
	});

	it('mounts a client versions-actions projection through the real host', () => {
		const dispose = TestBed.inject(DocumentProjectionRegistry).register({
			id: 'client.actions',
			name: 'versions.actions',
			component: VersionProjection,
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('version projection fixture-document');
		dispose();
	});
});
