import { WebUiMessages } from '@maretha/webui-sdk';
import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { provideRouter } from '@angular/router';
import { DocumentShareComponent } from './document-share.component';
describe('Document share', () => {
	beforeEach(() =>
		TestBed.configureTestingModule({
			imports: [DocumentShareComponent],
			providers: [
				provideRouter([]),
				{
					provide: Location,
					useValue: { prepareExternalUrl: (route: string) => '/nuxeo/ng' + route },
				},
			],
		}),
	);
	it('relocalizes copy success and permission failures while preserving the customer URL', async () => {
		const f = TestBed.createComponent(DocumentShareComponent);
		f.componentRef.setInput('context', { document: { uid: 'customer' }, noEdit: false });
		f.detectChanges();
		f.componentInstance.open();
		const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
		const writeText = jasmine.createSpy('writeText').and.resolveTo();
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
		try {
			await f.componentInstance.copy();
			expect(writeText).toHaveBeenCalledWith(f.componentInstance.permalink());
			const messages = TestBed.inject(WebUiMessages);
			messages.register('share-test', {
				fr: {
					'app.state.link-copied-71af38': 'Lien copié.',
					'app.state.copy-the-selected-link-using-your-keyboard-17309d':
						'Copiez le lien sélectionné.',
				},
			});
			messages.locale.set('fr');
			expect(f.componentInstance.status()).toBe('Lien copié.');
			writeText.and.rejectWith(new Error('denied'));
			await f.componentInstance.copy();
			f.detectChanges();
			expect(f.componentInstance.status()).toBe('Copiez le lien sélectionné.');
			const input = f.nativeElement.querySelector('input') as HTMLInputElement;
			expect(input.selectionEnd).toBe(input.value.length);
			expect(input.value).toBe(f.componentInstance.permalink());
		} finally {
			if (original) Object.defineProperty(navigator, 'clipboard', original);
			else delete (navigator as any).clipboard;
			f.destroy();
		}
	});

	it('builds a permanent link using the deployed base path without copying session query parameters', () => {
		const f = TestBed.createComponent(DocumentShareComponent);
		f.componentRef.setInput('context', {
			document: { uid: 'doc id', path: '/default-domain/workspaces/Example', title: 'Example' },
			noEdit: true,
		});
		f.detectChanges();
		const url = new URL(f.componentInstance.permalink());
		expect(url.pathname).toBe('/nuxeo/ng/browse/documents/doc%20id');
		expect(url.search).toBe('');
		expect(url.hash).toBe('');
	});
	it('closes the sharing dialog when the current document changes', () => {
		const f = TestBed.createComponent(DocumentShareComponent);
		f.componentRef.setInput('context', { document: { uid: 'first' }, noEdit: false });
		f.detectChanges();
		f.componentInstance.open();
		expect(f.nativeElement.querySelector('dialog').open).toBeTrue();
		f.componentRef.setInput('context', { document: { uid: 'second' }, noEdit: false });
		f.detectChanges();
		expect(f.nativeElement.querySelector('dialog').open).toBeFalse();
		expect(f.componentInstance.permalink()).toContain('/second');
		const events: Event[] = [];
		f.nativeElement.addEventListener('document-action-complete', (e: Event) => events.push(e));
		f.componentInstance.closed();
		expect(events.length).toBe(1);
	});
});
