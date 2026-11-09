import { WebUiMessages } from '@maretha/webui-sdk';
import {
	afterEveryRender,
	effect,
	Directive,
	ElementRef,
	Pipe,
	PipeTransform,
	SecurityContext,
	inject,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

export function noteVideoUrl(value: string): string | null {
	try {
		const url = new URL(value);
		if (url.protocol !== 'https:') return null;
		if (
			['youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com', 'youtu.be'].includes(
				url.hostname,
			)
		) {
			const id =
				url.hostname === 'youtu.be'
					? url.pathname.slice(1)
					: url.searchParams.get('v') || url.pathname.match(/^\/embed\/([^/]+)$/)?.[1];
			return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
		}
		if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(url.hostname)) {
			const id = url.pathname.match(/^\/(?:video\/)?(\d+)$/)?.[1];
			return id ? `https://player.vimeo.com/video/${id}` : null;
		}
	} catch {
		/* Invalid URLs are omitted. */
	}
	return null;
}

/** Angular removes active markup first; only validated visual styles and known video embeds are restored. */
export function sanitizeNoteHtml(value: string, sanitizer: DomSanitizer): string {
	if (typeof DOMParser === 'undefined')
		return sanitizer.sanitize(SecurityContext.HTML, value) ?? '';
	const source = new DOMParser().parseFromString(value, 'text/html');
	const styles = new Map<string, Record<string, string>>();
	const videos = new Map<string, { url: string; title: string | null }>();
	let next = 0;
	for (const node of Array.from(source.body.querySelectorAll<HTMLElement>('*'))) {
		for (const cls of Array.from(node.classList))
			if (cls.startsWith('nx-note-safe-')) node.classList.remove(cls);
	}
	for (const node of Array.from(
		source.body.querySelectorAll<HTMLElement>('[style],font[color],iframe'),
	)) {
		const marker = `nx-note-safe-${next++}`;
		if (node.tagName === 'IFRAME') {
			const url = noteVideoUrl(node.getAttribute('src') ?? '');
			if (!url) {
				node.remove();
				continue;
			}
			const placeholder = source.createElement('span');
			placeholder.className = marker;
			node.replaceWith(placeholder);
			videos.set(marker, {
				url,
				title: node.hasAttribute('data-nx-note-default-title') ? null : node.getAttribute('title'),
			});
			continue;
		}
		const safe: Record<string, string> = {};
		for (const property of ['color', 'background-color']) {
			const color =
				node.style.getPropertyValue(property) ||
				(property === 'color' ? (node.getAttribute('color') ?? '') : '');
			if (
				/^(#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|transparent|black|white|red|blue|green|yellow)$/i.test(
					color,
				)
			)
				safe[property] = color;
		}
		if (['left', 'center', 'right', 'justify'].includes(node.style.textAlign))
			safe['text-align'] = node.style.textAlign;
		if (Object.keys(safe).length) {
			node.classList.add(marker);
			styles.set(marker, safe);
		}
	}
	const cleaned = sanitizer.sanitize(SecurityContext.HTML, source.body.innerHTML) ?? '';
	const result = new DOMParser().parseFromString(cleaned, 'text/html');
	for (const [marker, safe] of styles)
		for (const node of Array.from(result.querySelectorAll<HTMLElement>(`.${marker}`))) {
			for (const [property, color] of Object.entries(safe)) node.style.setProperty(property, color);
			node.classList.remove(marker);
			if (!node.className) node.removeAttribute('class');
		}
	for (const [marker, video] of videos) {
		const placeholder = result.querySelector(`.${marker}`);
		if (!placeholder) continue;
		const frame = result.createElement('iframe');
		frame.src = video.url;
		frame.title = video.title?.trim() ? video.title : 'Embedded video';
		if (!video.title?.trim()) frame.setAttribute('data-nx-note-default-title', 'true');
		frame.width = '560';
		frame.height = '315';
		frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
		frame.setAttribute('allowfullscreen', '');
		frame.setAttribute('referrerpolicy', 'no-referrer');
		placeholder.replaceWith(frame);
	}
	return result.body.innerHTML;
}

@Pipe({ name: 'noteHtml', standalone: true })
export class NoteHtmlPipe implements PipeTransform {
	private readonly sanitizer = inject(DomSanitizer);
	transform(value: string): SafeHtml {
		return this.sanitizer.bypassSecurityTrustHtml(sanitizeNoteHtml(value, this.sanitizer));
	}
}

/** Update only generated labels: replacing innerHTML on locale changes would reload embedded media. */
@Directive({ selector: '[nxNoteContentLocale]' })
export class NoteContentLocaleDirective {
	private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
	private readonly messages = inject(WebUiMessages);
	constructor() {
		const update = () => {
			const title = this.messages.format('app.viewer.embeddedVideo', {}, 'Embedded video');
			for (const frame of this.host.nativeElement.querySelectorAll<HTMLIFrameElement>(
				'iframe[data-nx-note-default-title]',
			))
				if (frame.title !== title) frame.title = title;
		};
		effect(update);
		afterEveryRender(update);
	}
}
