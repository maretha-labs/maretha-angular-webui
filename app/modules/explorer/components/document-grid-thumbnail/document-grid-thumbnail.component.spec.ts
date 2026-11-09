import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DocumentCollectionsService } from '../../helpers/document-collections.service';
import { FavoriteChanges } from '../../helpers/favorite-changes.service';
import { DocumentGridThumbnailComponent } from './document-grid-thumbnail.component';

describe('DocumentGridThumbnailComponent', () => {
	const toggleFavoriteDocument = jasmine.createSpy('toggleFavoriteDocument');
	beforeEach(() => {
		toggleFavoriteDocument.calls.reset();
		toggleFavoriteDocument.and.returnValue(of(null));
		TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				{ provide: DocumentCollectionsService, useValue: { toggleFavoriteDocument } },
			],
		});
	});

	const mount = (document: any, inputs: Record<string, unknown> = {}) => {
		const fixture = TestBed.createComponent(DocumentGridThumbnailComponent);
		fixture.componentRef.setInput('document', document);
		for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
		fixture.detectChanges();
		return fixture;
	};

	it('draws the stock card and follows favourites changes made anywhere', () => {
		const fixture = mount({
			uid: 'doc',
			title: 'Bucharest',
			type: 'File',
			repository: 'default',
			properties: { 'file:content': { data: 'blob' } },
			contextParameters: {
				thumbnail: { url: '/thumb.png' },
				favorites: { isFavorite: false },
			},
		});
		const root: HTMLElement = fixture.nativeElement;
		expect(root.getAttribute('role')).toBe('listitem');
		expect(root.querySelector('.nx-grid-thumbnail__title')?.textContent?.trim()).toBe('Bucharest');
		expect(root.querySelector('.nx-grid-thumbnail__tag')?.textContent?.trim()).toBe('File');
		expect(root.querySelector('a.nx-grid-thumbnail__body img')?.getAttribute('src')).toBe(
			'/thumb.png',
		);
		const buttons = root.querySelectorAll('.nx-grid-thumbnail__actions button');
		expect(buttons.length).toBe(2);
		(buttons[0] as HTMLButtonElement).click();
		// The default repository is not named, so its cached favourites collection is reused.
		expect(toggleFavoriteDocument).toHaveBeenCalledOnceWith(['doc'], true, undefined);
		TestBed.inject(FavoriteChanges).changes$.next({ documentUids: ['doc'], favorite: true });
		fixture.detectChanges();
		expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
		TestBed.inject(FavoriteChanges).changes$.next({ documentUids: ['other'], favorite: false });
		fixture.detectChanges();
		expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
	});

	it('hides a failed thumbnail, reports selection, and hands host-resolved links back', () => {
		const fixture = mount(
			{ uid: 'member', title: 'Member', type: 'Note', contextParameters: {} },
			{ href: '/collections/member', selected: true, selecting: true },
		);
		const root: HTMLElement = fixture.nativeElement;
		expect(root.classList).toContain('nx-grid-thumbnail--selected');
		expect(root.querySelector('img')).toBeNull();
		expect(root.querySelectorAll('.nx-grid-thumbnail__actions button').length).toBe(1);
		const toggled = jasmine.createSpy('toggled');
		const opened = jasmine.createSpy('opened');
		fixture.componentInstance.toggleSelection.subscribe(toggled);
		fixture.componentInstance.open.subscribe(opened);
		root.querySelector<HTMLInputElement>('.nx-grid-thumbnail__select')!.click();
		expect(toggled).toHaveBeenCalledTimes(1);
		const link = root.querySelector<HTMLAnchorElement>('a.nx-grid-thumbnail__body')!;
		expect(link.getAttribute('href')).toBe('/collections/member');
		link.addEventListener('click', (event) => event.preventDefault());
		link.click();
		expect(opened).toHaveBeenCalledTimes(1);

		fixture.componentRef.setInput('document', {
			uid: 'pic',
			title: 'Picture',
			type: 'Picture',
			contextParameters: { thumbnail: 'broken.png' },
		});
		fixture.componentRef.setInput('href', null);
		fixture.componentRef.setInput('disabled', true);
		fixture.detectChanges();
		root.querySelector('img')!.dispatchEvent(new Event('error'));
		fixture.detectChanges();
		expect(root.querySelector('img')).toBeNull();
		expect(root.querySelector('a')).toBeNull();
		expect(root.querySelector('div.nx-grid-thumbnail__body')).not.toBeNull();
	});
});
