import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WebUiMessages } from '@maretha/webui-sdk';
import { BsModalService } from 'ngx-bootstrap/modal';
import { LayoutService } from '../../../helpers/layout.service';
import { DestinationCreateDialogComponent } from 'app/components/quick-search/destination-create-dialog.component';
import { DocumentCreateActionComponent } from './document-create-action.component';

describe('Document creation action', () => {
	it('updates its labels without changing the destination or opening another dialog', () => {
		const placement = signal('document-actions');
		const show = jasmine.createSpy('show');
		TestBed.configureTestingModule({
			imports: [DocumentCreateActionComponent],
			providers: [
				{ provide: LayoutService, useValue: { createButtonPlacement: placement } },
				{ provide: BsModalService, useValue: { show } },
			],
		});
		const fixture = TestBed.createComponent(DocumentCreateActionComponent);
		const document = {
			path: '/Customer folder/{name}',
			contextParameters: { permissions: ['AddChildren'] },
		};
		fixture.componentRef.setInput('context', { document, noEdit: false });
		fixture.detectChanges();
		const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
		expect(button.getAttribute('aria-label')).toBe('Create document');
		button.click();
		expect(show).toHaveBeenCalledOnceWith(
			DestinationCreateDialogComponent,
			jasmine.objectContaining({
				initialState: { initialPath: document.path, initialView: 'create' },
				ignoreBackdropClick: true,
				keyboard: false,
			}),
		);
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', {
			fr: {
				'app.modules.document-create-action.create-document-d81fdf': 'Créer un document',
				'app.modules.document-create-action.create-9e51ba': 'Créer',
			},
		});
		messages.locale.set('fr');
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('button')).toBe(button);
		expect(button.getAttribute('aria-label')).toBe('Créer un document');
		expect(button.textContent).toContain('Créer');
		expect(show).toHaveBeenCalledTimes(1);
		placement.set('global');
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('button')).toBeNull();
	});
	it('does not open when permission is absent or the current context is read-only', () => {
		const show = jasmine.createSpy('show');
		TestBed.configureTestingModule({
			imports: [DocumentCreateActionComponent],
			providers: [
				{ provide: LayoutService, useValue: { createButtonPlacement: () => 'document-actions' } },
				{ provide: BsModalService, useValue: { show } },
			],
		});
		const fixture = TestBed.createComponent(DocumentCreateActionComponent);
		for (const context of [
			{ document: null, noEdit: false },
			{ document: {}, noEdit: false },
			{ document: { contextParameters: { permissions: [] } }, noEdit: false },
			{ document: { contextParameters: { permissions: ['AddChildren'] } }, noEdit: true },
		]) {
			fixture.componentRef.setInput('context', context);
			fixture.detectChanges();
			fixture.nativeElement.querySelector('button').click();
		}
		expect(show).not.toHaveBeenCalled();
	});
});
