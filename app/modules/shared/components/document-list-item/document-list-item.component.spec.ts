import { of } from 'rxjs';
import { DocumentCollectionsService } from 'app/modules/explorer/helpers/document-collections.service';
import { DocumentAttachmentsService } from 'app/modules/explorer/helpers/document-attachments.service';
import { FavoriteChanges } from 'app/modules/explorer/helpers/favorite-changes.service';
import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
	ResultsProjectionComponent,
	ResultsProjectionContext,
	ResultsProjectionRegistry,
	WebUiMessages,
} from '@maretha/webui-sdk';
import { WebUiLocale } from 'app/extensions/i18n/webui-locale';
import { REPOSITORY_SEARCH } from 'app/modules/search/helpers/repository-search-definitions';
import { searchViewComponents } from 'app/modules/search/helpers/search-view-components';
import { DocumentListItemComponent } from './document-list-item.component';

@Component({ template: 'Override {{ context().row.title }}' })
class CustomTrashListItem {
	readonly context = input.required<ResultsProjectionContext>();
}

describe('Stock document list item hook', () => {
	const row = {
		uid: 'one',
		title: 'Trashed file',
		type: 'File',
		properties: { 'dc:modified': '2026-11-04', 'dc:lastContributor': 'administrator' },
	};

	async function mount(searchId: 'default' | 'trash' = 'trash', rows: readonly any[] = [row]) {
		const fixture = TestBed.createComponent(ResultsProjectionComponent);
		fixture.componentRef.setInput('rows', rows);
		fixture.componentRef.setInput('mode', 'list');
		fixture.componentRef.setInput('searchId', searchId);
		fixture.componentRef.setInput('rowActivation', true);
		fixture.componentRef.setInput(
			'components',
			searchViewComponents(REPOSITORY_SEARCH[searchId], 'list'),
		);
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		return fixture;
	}

	it('loads the shared list presentation with a translated type and grey fallback, without metadata rows', async () => {
		TestBed.inject(WebUiMessages).register('test.trash-list-type', {
			es: { 'label.document.type.file': 'Archivo' },
		});
		const fixture = await mount();
		const card: HTMLElement = fixture.nativeElement.querySelector('nx-document-list-item');
		expect(card.getAttribute('role')).toBe('listitem');
		expect(card.querySelector('.document-list-item__title')?.textContent?.trim()).toBe(
			'Trashed file',
		);
		expect(card.querySelector('.document-list-item__type')?.textContent?.trim()).toBe('File');
		expect(card.querySelector('img')).toBeNull();
		expect(card.textContent).not.toContain('2026-11-04');
		expect(card.textContent).not.toContain('administrator');
		TestBed.inject(WebUiLocale).locale.set('es');
		fixture.detectChanges();
		expect(card.querySelector('.document-list-item__type')?.textContent?.trim()).toBe('Archivo');
		fixture.componentRef.setInput('rows', [
			{ ...row, contextParameters: { thumbnail: { url: 'data:image/png;base64,broken' } } },
		]);
		fixture.detectChanges();
		card.querySelector('img')!.dispatchEvent(new Event('error'));
		fixture.detectChanges();
		expect(card.querySelector('img')).toBeNull();
		expect(searchViewComponents(REPOSITORY_SEARCH.trash, 'grid')).toEqual({});
		expect(Object.keys(searchViewComponents(REPOSITORY_SEARCH.trash, 'table'))).toEqual([
			'cell:flags',
		]);
	});

	it('uses the host activation and selection callbacks, including selection mode and stale-context guards', async () => {
		const fixture = await mount();
		const projection = fixture.componentInstance;
		const activated = jasmine.createSpy('activated');
		const selected = jasmine.createSpy('selected');
		projection.rowActivated.subscribe(activated);
		projection.selectionChange.subscribe(selected);
		const card: HTMLElement = fixture.nativeElement.querySelector('nx-document-list-item');
		card.querySelector<HTMLElement>('.document-list-item__title')!.click();
		expect(activated).toHaveBeenCalledOnceWith(row);
		activated.calls.reset();
		card.dispatchEvent(new MouseEvent('click', { ctrlKey: true }));
		expect(activated).not.toHaveBeenCalled();
		card.querySelector<HTMLInputElement>('input')!.click();
		expect(selected).toHaveBeenCalledOnceWith(['one']);
		expect(activated).not.toHaveBeenCalled();
		selected.calls.reset();
		fixture.componentRef.setInput('selection', ['other']);
		fixture.detectChanges();
		card.querySelector<HTMLElement>('.document-list-item__thumbnail')!.click();
		expect(selected).toHaveBeenCalledOnceWith(['other', 'one']);
		expect(activated).not.toHaveBeenCalled();
		selected.calls.reset();
		fixture.componentRef.setInput('selection', []);
		fixture.detectChanges();
		card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		expect(activated).toHaveBeenCalledOnceWith(row);
		card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
		expect(selected).toHaveBeenCalledOnceWith(['one']);
		activated.calls.reset();
		selected.calls.reset();
		for (const name of ['loading', 'readOnly']) {
			fixture.componentRef.setInput(name, true);
			fixture.detectChanges();
			card.click();
			card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
			expect(card.querySelector<HTMLInputElement>('input')!.disabled).toBeTrue();
			expect(activated).not.toHaveBeenCalled();
			expect(selected).not.toHaveBeenCalled();
			fixture.componentRef.setInput(name, false);
		}
		fixture.detectChanges();
		const oldContext = fixture.debugElement
			.query(By.directive(DocumentListItemComponent))
			.componentInstance.context() as ResultsProjectionContext;
		fixture.componentRef.setInput('rows', [{ uid: 'replacement', title: 'Replacement' }]);
		fixture.detectChanges();
		oldContext.activateRow();
		oldContext.toggleSelection();
		expect(activated).not.toHaveBeenCalled();
		expect(selected).not.toHaveBeenCalled();
	});

	it('keeps search-targeted add-ons ahead of the definition default', async () => {
		const unregister = TestBed.inject(ResultsProjectionRegistry).register({
			id: 'test.trash-list',
			searchId: 'trash',
			mode: 'list',
			projection: 'item',
			component: CustomTrashListItem,
		});
		const fixture = await mount();
		expect(fixture.nativeElement.querySelector('nx-document-list-item')).toBeNull();
		expect(fixture.nativeElement.textContent).toContain('Override Trashed file');
		unregister();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('nx-document-list-item')).not.toBeNull();
	});
	it('shares the default list hook and safely renders server highlights without metadata fallback', async () => {
		const fixture = await mount('default', [
			{
				...row,
				contextParameters: {
					highlight: [
						{ field: 'dc:title', segments: ['before <em>match</em> after', '<img src=x>'] },
					],
				},
			},
		]);
		const card: HTMLElement = fixture.nativeElement.querySelector('nx-document-list-item');
		expect(card).not.toBeNull();
		expect(card.querySelector('.document-list-item__highlight em')?.textContent).toBe('match');
		expect(card.querySelector('.document-list-item__highlight')?.textContent).toContain(
			'<img src=x>',
		);
		expect(card.querySelector('.document-list-item__highlight img')).toBeNull();
		expect(card.textContent).not.toContain('administrator');
		expect(card.textContent).not.toContain('2026-11-04');
	});

	it('owns favorite and download clicks without activating or selecting the row', async () => {
		const favorite = jasmine.createSpy('favorite').and.returnValue(of(undefined));
		const download = jasmine.createSpy('download').and.returnValue(of(undefined));
		TestBed.configureTestingModule({
			providers: [
				{ provide: DocumentCollectionsService, useValue: { toggleFavoriteDocument: favorite } },
				{ provide: DocumentAttachmentsService, useValue: { downloadDocumentBlob: download } },
			],
		});
		const document = {
			...row,
			facets: [],
			repository: 'other',
			properties: { 'file:content': { name: 'file.pdf' } },
		};
		const fixture = await mount('default', [document]);
		const activated = jasmine.createSpy('activated');
		const selected = jasmine.createSpy('selected');
		fixture.componentInstance.rowActivated.subscribe(activated);
		fixture.componentInstance.selectionChange.subscribe(selected);
		const buttons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll(
			'.document-list-item__actions button',
		);
		buttons[0].click();
		await fixture.whenStable();
		expect(favorite).toHaveBeenCalledOnceWith(['one'], true, 'other');
		TestBed.inject(FavoriteChanges).changes$.next({ documentUids: ['one'], favorite: true });
		fixture.detectChanges();
		expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
		buttons[1].click();
		await fixture.whenStable();
		expect(download).toHaveBeenCalledOnceWith(document, document.properties['file:content']);
		expect(activated).not.toHaveBeenCalled();
		expect(selected).not.toHaveBeenCalled();
		fixture.componentRef.setInput('loading', true);
		fixture.detectChanges();
		expect([...buttons].every((button) => button.disabled)).toBeTrue();
		buttons[0].click();
		buttons[1].click();
		expect(favorite).toHaveBeenCalledTimes(1);
		expect(download).toHaveBeenCalledTimes(1);
	});
});
