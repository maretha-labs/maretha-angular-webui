import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
	HttpBackend,
	HttpClient,
	HttpEvent,
	HttpHeaderResponse,
	HttpHeaders,
	HttpRequest,
	HttpResponse,
} from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { pdfDefaultOptions } from 'ngx-extended-pdf-viewer';
import { ImageRendererComponent } from 'app/modules/explorer/components/viewers/image-renderer/image-renderer.component';
import { PdfRendererComponent } from 'app/modules/explorer/components/viewers/pdf-renderer/pdf-renderer.component';
import { MetadataPolicyService } from 'app/modules/explorer/helpers/metadata-policy.service';
import { DocumentAttachmentsService } from 'app/modules/explorer/helpers/document-attachments.service';

const requests = signal<string[]>([]);
function fixturePdf(): Uint8Array {
	const stream =
		'BT /F1 24 Tf 60 720 Td (Parity PDF fixture) Tj 0 -40 Td /F1 12 Tf (Synthetic content - range transport verification) Tj ET';
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
		`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
	];
	let text = '%PDF-1.4\n';
	const offsets = [0];
	objects.forEach((object, i) => {
		offsets.push(text.length);
		text += `${i + 1} 0 obj\n${object}\nendobj\n`;
	});
	const xref = text.length;
	text += `xref\n0 6\n0000000000 65535 f \n${offsets
		.slice(1)
		.map((n) => String(n).padStart(10, '0') + ' 00000 n \n')
		.join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
	return new TextEncoder().encode(text);
}
class MediaBackend extends HttpBackend {
	handle(request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
		if (request.url.endsWith('/image'))
			return of(
				new HttpResponse({
					body: new Blob(
						[
							'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#c4d6d9"/><rect x="100" y="100" width="700" height="550" fill="#355c68"/><circle cx="1100" cy="450" r="230" fill="#e4ac58"/><text x="100" y="800" font-size="64" font-family="sans-serif">Synthetic picture fixture</text></svg>',
						],
						{ type: 'image/svg+xml' },
					),
				}),
			);
		const bytes = fixturePdf();
		const range = request.headers.get('Range') || `bytes=0-${bytes.length - 1}`;
		requests.update((current) => [...current, range]);
		const [, begin, end] = /bytes=(\d+)-(\d+)/.exec(range)!.map(Number);
		const headers = new HttpHeaders({
			'Content-Range': `bytes ${begin}-${end}/${bytes.length}`,
			'Content-Length': String(end - begin + 1),
			ETag: '"fixture-pdf"',
		});
		return new Observable((observer) => {
			observer.next(new HttpHeaderResponse({ status: 200, headers }));
			const timer = setTimeout(() => {
				observer.next(
					new HttpResponse({ status: 200, headers, body: bytes.slice(begin, end + 1).buffer }),
				);
				observer.complete();
			});
			return () => clearTimeout(timer);
		});
	}
}
@Component({
	selector: 'nx-media-parity-fixture',
	imports: [ImageRendererComponent, PdfRendererComponent],
	providers: [
		{ provide: HttpClient, useFactory: () => new HttpClient(new MediaBackend()) },
		{
			provide: MetadataPolicyService,
			useValue: {
				userPreferences: () => ({ hiddenSchemas: [], hiddenFields: [] }),
				canRead: () => true,
			},
		},
		{
			provide: DocumentAttachmentsService,
			useValue: { downloadDocumentBlob: () => of(undefined) },
		},
	],
	template: `<h1>Media parity verification</h1>
		@if (view === 'image') {
			<nx-image-renderer [document]="picture" contentUrl="/fixture/image" />
		} @else {
			<p data-range-log>Requests: {{ requests().join(', ') }}</p>
			<div class="pdf">
				<nx-pdf-renderer [document]="pdf" contentUrl="/fixture/rendition/pdf" />
			</div>
		}`,
	styles:
		':host { display:block; padding:24px; max-width:1100px; margin:auto } h1 {font-size:20px} .pdf { height:720px; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaParityFixture {
	readonly view = new URLSearchParams(location.search).get('media') || 'image';
	readonly requests = requests;
	readonly picture = {
		uid: 'synthetic-picture',
		type: 'Picture',
		title: 'Synthetic picture fixture',
		properties: {},
		ng: { attachment: { name: 'synthetic-picture.svg', length: 400, data: '/fixture/image' } },
	};
	readonly pdf = {
		uid: 'synthetic-pdf',
		title: 'Synthetic PDF fixture',
		ng: { attachment: { name: 'synthetic.pdf' } },
	};
	constructor() {
		pdfDefaultOptions.assetsFolder = 'bleeding-edge';
		requests.set([]);
	}
}
