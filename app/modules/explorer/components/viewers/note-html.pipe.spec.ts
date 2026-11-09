import { Component } from '@angular/core';
import { WebUiMessages } from '@maretha/webui-sdk';
import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { NoteContentLocaleDirective, noteVideoUrl, sanitizeNoteHtml } from './note-html.pipe';

@Component({
	imports: [NoteContentLocaleDirective],
	template: `<div nxNoteContentLocale>
		<iframe title="Embedded video" data-nx-note-default-title="true" sandbox></iframe
		><iframe title="Customer video" sandbox></iframe>
	</div>`,
})
class NoteLocaleHost {}

describe('Note HTML formatting boundary', () => {
	it('keeps text colors and alignment while removing active markup and unsafe CSS', () => {
		const html = sanitizeNoteHtml(
			'<p style="color: #ff0000; background-color: #ffff00; text-align:center; background-image:url(https://example.invalid/x)"><b>Note</b></p><img src="x" onerror="alert(1)"><script>alert(1)</script>',
			TestBed.inject(DomSanitizer),
		);
		const result = new DOMParser().parseFromString(html, 'text/html');
		expect(result.querySelector('p')?.style.color).toBe('rgb(255, 0, 0)');
		expect(result.querySelector('p')?.style.backgroundColor).toBe('rgb(255, 255, 0)');
		expect(result.querySelector('p')?.style.textAlign).toBe('center');
		expect(html).not.toMatch(/onerror|<script|background-image|example\.invalid/);
	});
	it('permits only sandboxed known video embeds and rejects executable or lookalike URLs', () => {
		expect(noteVideoUrl('https://youtu.be/abcdefghijk')).toBe(
			'https://www.youtube-nocookie.com/embed/abcdefghijk',
		);
		expect(noteVideoUrl('https://youtube.com.evil.invalid/embed/abcdefghijk')).toBeNull();
		expect(noteVideoUrl('javascript:alert(1)')).toBeNull();
		const html = sanitizeNoteHtml(
			'<iframe src="https://www.youtube.com/embed/abcdefghijk" onload="alert(1)"></iframe><iframe srcdoc="<script>alert(1)</script>"></iframe>',
			TestBed.inject(DomSanitizer),
		);
		const frames = new DOMParser().parseFromString(html, 'text/html').querySelectorAll('iframe');
		expect(frames.length).toBe(1);
		expect(frames[0].getAttribute('sandbox')).toBe(
			'allow-scripts allow-same-origin allow-presentation',
		);
		expect(html).not.toMatch(/onload|srcdoc|<script/);
	});
	it('preserves authored iframe titles and marks only generated defaults across sanitization', () => {
		const sanitizer = TestBed.inject(DomSanitizer);
		const input =
			'<iframe title="Customer &amp; video" src="https://youtu.be/abcdefghijk"></iframe><iframe src="https://youtu.be/abcdefghijk"></iframe>';
		const html = sanitizeNoteHtml(input, sanitizer);
		const parsed = new DOMParser().parseFromString(sanitizeNoteHtml(html, sanitizer), 'text/html');
		const frames = parsed.querySelectorAll('iframe');
		expect(frames[0].title).toBe('Customer & video');
		expect(frames[0].hasAttribute('data-nx-note-default-title')).toBeFalse();
		expect(frames[1].hasAttribute('data-nx-note-default-title')).toBeTrue();
	});
	it('changes only generated title attributes without replacing or reloading embedded frames', async () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', { fr: { 'app.viewer.embeddedVideo': 'Vidéo intégrée' } });
		const fixture = TestBed.createComponent(NoteLocaleHost);
		fixture.detectChanges();
		await fixture.whenStable();
		const frames = [...fixture.nativeElement.querySelectorAll('iframe')] as HTMLIFrameElement[];
		const content = frames[0].contentWindow;
		const source = frames[0].getAttribute('src');
		messages.locale.set('fr');
		fixture.detectChanges();
		await fixture.whenStable();
		expect(fixture.nativeElement.querySelector('iframe')).toBe(frames[0]);
		expect(frames[0].contentWindow === content).toBeTrue();
		expect(frames[0].getAttribute('src')).toBe(source);
		expect(frames[0].title).toBe('Vidéo intégrée');
		expect(frames[1].title).toBe('Customer video');
	});
});
