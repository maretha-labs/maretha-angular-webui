import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { WebUiMessages } from '@maretha/webui-sdk';
import { MetadataPolicyService } from '../../helpers/metadata-policy.service';
import { FolderishDetailsPanelComponent } from './folderish-details-panel.component';
import { NoteRichtextEditorComponent } from './note-richtext-editor.component';

describe('Folder and note locale boundaries', () => {
	it('updates folder labels and number/boolean presentation while preserving customer fields and activity', () => {
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{
					provide: MetadataPolicyService,
					useValue: { canRead: () => true, canWrite: () => false },
				},
			],
		}).overrideComponent(FolderishDetailsPanelComponent, { set: { template: '', imports: [] } });
		const f = TestBed.createComponent(FolderishDetailsPanelComponent);
		f.componentRef.setInput('document', {
			uid: 'folder',
			type: 'Folder',
			state: 'custom-state',
			properties: { 'dc:title': 'Customer title' },
			contextParameters: {
				audit: [
					{ eventId: 'view', principalName: 'Customer', eventDate: '2026-10-03T10:00:00Z' },
					{ eventId: 'view', principalName: 'Customer', eventDate: '2026-10-03T10:01:00Z' },
				],
			},
		});
		f.detectChanges();
		const c = f.componentInstance;
		const messages = TestBed.inject(WebUiMessages);
		messages.register('folder-test', {
			fr: {
				'app.labels.title-7e8cd2': 'Titre',
				'common.yes': 'Oui',
				'common.no': 'Non',
				'lifecycle.project': 'Projet',
			},
		});
		messages.locale.set('fr');
		expect(c.fields[0].label).toBe('Titre');
		expect(c.value('dc:title')).toBe('Customer title');
		expect(c.stateLabel).toBe('custom-state');
		expect(c.display(1234.5)).toBe(new Intl.NumberFormat('fr').format(1234.5));
		expect(c.display(true)).toBe('Oui');
		expect(c.display(false)).toBe('Non');
		expect(c.display([{ label: 'Customer label' }, 'Customer value'])).toBe(
			'Customer label, Customer value',
		);
		expect(c.activities().length).toBe(1);
		expect(c.canRead('dc:title')).toBeTrue();
		expect(c.canWrite('dc:title')).toBeFalse();
		expect(c.userLabel({ properties: { firstName: 'Customer', lastName: 'Name' } })).toBe(
			'Customer Name',
		);
		f.componentRef.setInput('document', { type: 'PictureBook', state: 'project', properties: {} });
		f.detectChanges();
		expect(c.fields.length).toBe(2);
		expect(c.stateLabel).toBe('Projet');
		expect(c.activities()).toEqual([]);
		TestBed.inject(HttpTestingController).verify();
	});
	it('updates note controls and retained errors without replacing the editable customer draft', () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const f = TestBed.createComponent(NoteRichtextEditorComponent);
		f.componentRef.setInput('value', '<p>Customer draft {literal}</p>');
		f.detectChanges();
		const c = f.componentInstance;
		const editor = f.nativeElement.querySelector('.editor') as HTMLElement;
		editor.innerHTML = '<p>Customer unsaved draft</p>';
		c.changed();
		c.insertLink('javascript:alert(1)');
		c.insertVideo('http://untrusted.test/movie');
		const messages = TestBed.inject(WebUiMessages);
		messages.register('note-test', {
			fr: {
				'app.labels.bold-94fee6': 'Gras',
				'app.state.enter-an-https-http-or-email-link-50abcc': 'Lien HTTP ou courriel requis.',
				'app.state.enter-a-youtube-or-vimeo-https-video-url-6cc690': 'Vidéo HTTPS requise.',
			},
		});
		messages.locale.set('fr');
		f.detectChanges();
		expect(c.controls[0].label).toBe('Gras');
		expect(c.linkError).toBe('Lien HTTP ou courriel requis.');
		expect(c.videoError).toBe('Vidéo HTTPS requise.');
		expect(editor.innerHTML).toBe('<p>Customer unsaved draft</p>');
		expect(editor.querySelector('iframe')).toBeNull();
		c.imagesError = 'Customer server error';
		messages.locale.set('ar');
		expect(c.imagesError).toBe('Customer server error');
		TestBed.inject(HttpTestingController).verify();
	});
});
