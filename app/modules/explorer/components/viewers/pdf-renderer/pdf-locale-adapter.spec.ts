import { TestBed } from '@angular/core/testing';
import {
	PDFScriptLoaderService,
	PdfCspPolicyService,
	pdfDefaultOptions,
} from 'ngx-extended-pdf-viewer';
import { PdfLocaleAdapter } from './pdf-locale-adapter';

function localization(lang: string) {
	return {
		getLanguage: () => lang,
		getDirection: () => (lang === 'ar' ? 'rtl' : 'ltr'),
		get: jasmine.createSpy('get').and.resolveTo('Print'),
		translate: jasmine.createSpy('translate').and.resolveTo(),
		translateOnce: jasmine.createSpy('translateOnce').and.resolveTo(),
		destroy: jasmine.createSpy('destroy').and.resolveTo(),
		pause: jasmine.createSpy('pause'),
		resume: jasmine.createSpy('resume'),
	};
}

interface NativeDocument {
	numPages: number;
	annotationStorage: {
		setValue(id: string, value: { value: string }): void;
		getValue(id: string, fallback: { value: string }): { value: string };
	};
}
interface NativePdfRuntime {
	version: string;
	GlobalWorkerOptions: { workerSrc: string };
	getDocument(options: { data: Uint8Array; cspPolicyService: PdfCspPolicyService }): {
		promise: Promise<NativeDocument>;
		destroy(): Promise<void>;
	};
}
function blankPdf(): Uint8Array {
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Count 4 /Kids [3 0 R 4 0 R 5 0 R 6 0 R] >>',
		...Array.from({ length: 4 }, () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] >>'),
	];
	let text = '%PDF-1.7\n';
	const offsets = [0];
	for (const [index, object] of objects.entries()) {
		offsets.push(text.length);
		text += `${index + 1} 0 obj\n${object}\nendobj\n`;
	}
	const xref = text.length;
	text += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
	for (const offset of offsets.slice(1)) text += `${String(offset).padStart(10, '0')} 00000 n \n`;
	text += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return new TextEncoder().encode(text);
}

describe('PDF locale adapter', () => {
	let root: HTMLDivElement;
	beforeEach(() => {
		root = document.createElement('div');
		document.body.append(root);
	});
	afterEach(() => root.remove());
	it('fails safely for an unrecognized runtime without changing its document or controls', async () => {
		const initial = localization('en-us');
		const createL10n = jasmine.createSpy('createL10n');
		const app = { l10n: initial, externalServices: { createL10n }, page: 4 };
		expect(
			await new PdfLocaleAdapter().update(
				app,
				{ set: jasmine.createSpy('set') },
				'unknown',
				root,
				'fr',
			),
		).toEqual({
			applied: false,
			directionDeferred: false,
		});
		expect(initial.destroy).not.toHaveBeenCalled();
		expect(createL10n).not.toHaveBeenCalled();
		expect(app.page).toBe(4);
	});
	it('discards a stale catalog before altering the current viewer and applies the newest locale', async () => {
		const initial = localization('en-us');
		const first = localization('fr');
		const last = localization('ar');
		let ready!: () => void;
		first.get.and.returnValue(new Promise<string>((resolve) => (ready = () => resolve('Print'))));
		const factory = jasmine
			.createSpy('createL10n')
			.and.returnValues(Promise.resolve(first), Promise.resolve(last));
		const app = { l10n: initial, externalServices: { createL10n: factory } };
		const adapter = new PdfLocaleAdapter();
		const one = adapter.update(app, { set: jasmine.createSpy('set') }, '5.4.1105', root, 'fr');
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		const two = adapter.update(app, { set: jasmine.createSpy('set') }, '5.4.1105', root, 'ar');
		ready();
		expect((await one).applied).toBeFalse();
		expect(await two).toEqual({ applied: true, directionDeferred: true });
		expect(first.destroy).toHaveBeenCalledTimes(1);
		expect(first.translate).not.toHaveBeenCalled();
		expect(app.l10n).toBe(initial);
		expect(initial.getLanguage()).toBe('ar');
		expect(root.dir).toBe('ltr');
	});
	it('contains incompatible runtime methods without leaving an unhandled rejection', async () => {
		const initial = localization('en-us');
		initial.getDirection = () => {
			throw new Error('incompatible API');
		};
		const app = { l10n: initial, externalServices: { createL10n: async () => localization('fr') } };
		expect(
			await new PdfLocaleAdapter().update(
				app,
				{ set: jasmine.createSpy('set') },
				'5.4.1105',
				root,
				'fr',
			),
		).toEqual({ applied: false, directionDeferred: false });
		expect(initial.destroy).not.toHaveBeenCalled();
	});
	it('ignores work after the document boundary changes', async () => {
		const initial = localization('en-us');
		const createL10n = jasmine.createSpy('createL10n');
		const adapter = new PdfLocaleAdapter();
		const promise = adapter.update(
			{ l10n: initial, externalServices: { createL10n } },
			{ set: jasmine.createSpy('set') },
			'5.4.1105',
			root,
			'ro',
		);
		adapter.cancel();
		expect((await promise).applied).toBeFalse();
		expect(createL10n).not.toHaveBeenCalled();
	});
	it('keeps the prior localization if the replacement catalog cannot be loaded', async () => {
		const initial = localization('en-us');
		const next = localization('fr');
		next.get.and.rejectWith(new Error('network'));
		const app = { l10n: initial, externalServices: { createL10n: async () => next } };
		expect(
			(
				await new PdfLocaleAdapter().update(
					app,
					{ set: jasmine.createSpy('set') },
					'5.4.1105',
					root,
					'fr',
				)
			).applied,
		).toBeFalse();
		expect(initial.getLanguage()).toBe('en-us');
		expect(initial.destroy).not.toHaveBeenCalled();
		expect(next.destroy).toHaveBeenCalledTimes(1);
	});
	for (const [folder, version] of [
		['assets', '5.4.1105'],
		['bleeding-edge', '5.4.1106'],
	]) {
		it(`refreshes bundled PDF.js ${version} Fluent catalogs for all seven locales through retained references`, async () => {
			const previousFolder = pdfDefaultOptions.assetsFolder;
			pdfDefaultOptions.assetsFolder = new URL(
				`/base/node_modules/ngx-extended-pdf-viewer/${folder}`,
				location.origin,
			).href;
			// The loader snapshots the selected asset version in its constructor.
			const loader = TestBed.inject(PDFScriptLoaderService);
			const priorLinks = [
				...document.querySelectorAll<HTMLLinkElement>('link[type="application/l10n"]'),
			];
			for (const link of priorLinks) link.remove();
			const link = document.createElement('link');
			link.type = 'application/l10n';
			link.href = `${pdfDefaultOptions.assetsFolder}/locale/locale.json`;
			document.head.append(link);
			root.innerHTML =
				'<span data-l10n-id="pdfjs-print-button-label"></span><input value="Customer annotation">';
			let initial: ReturnType<typeof localization> | undefined;
			let task: ReturnType<NativePdfRuntime['getDocument']> | undefined;
			let runtime: NativePdfRuntime | undefined;
			let previousWorker: string | undefined;
			try {
				await loader.ensurePdfJsHasBeenLoaded(true, false, true);
				expect(loader.pdfjsVersion).toBe(version);
				const native = loader.PDFViewerApplication as unknown as {
					externalServices: { createL10n(): Promise<ReturnType<typeof localization>> };
				};
				const options = loader.PDFViewerApplicationOptions;
				options.set('localeProperties', { lang: 'en-US' });
				initial = await native.externalServices.createL10n();
				await initial.translate(root);
				runtime = (globalThis as unknown as { pdfjsLib: NativePdfRuntime }).pdfjsLib;
				expect(runtime.version).toBe(version);
				previousWorker = runtime.GlobalWorkerOptions.workerSrc;
				const workerSrc = pdfDefaultOptions.workerSrc;
				runtime.GlobalWorkerOptions.workerSrc =
					typeof workerSrc === 'function' ? workerSrc() : workerSrc;
				task = runtime.getDocument({
					data: blankPdf(),
					cspPolicyService: TestBed.inject(PdfCspPolicyService),
				});
				const pdfDocument = await task.promise;
				expect(pdfDocument.numPages).toBe(4);
				const annotationStorage = pdfDocument.annotationStorage;
				annotationStorage.setValue('note', { value: 'Customer annotation' });
				const app = {
					l10n: initial,
					externalServices: native.externalServices,
					page: 4,
					pdfDocument,
					zoom: 1.5,
				};
				const retained = app.l10n;
				const adapter = new PdfLocaleAdapter();
				for (const [locale, expected] of [
					['es', 'Imprimir'],
					['fr', 'Imprimer'],
					['ar', 'اطبع'],
					['ro', 'Listează'],
					['pt-PT', 'Imprimir'],
					['it', 'Stampa'],
					['en-US', 'Print'],
				]) {
					const result = await adapter.update(app, options, loader.pdfjsVersion, root, locale);
					expect(result).toEqual({ applied: true, directionDeferred: locale === 'ar' });
					expect(root.querySelector('span')?.textContent).toBe(expected);
					expect(await retained.get('pdfjs-print-button-label')).toBe(expected);
					expect(app.l10n).toBe(retained);
					expect(app.page).toBe(4);
					expect(app.zoom).toBe(1.5);
					expect(app.pdfDocument).toBe(pdfDocument);
					expect(app.pdfDocument.annotationStorage).toBe(annotationStorage);
					expect(annotationStorage.getValue('note', { value: '' }).value).toBe(
						'Customer annotation',
					);
					expect(root.querySelector('input')?.value).toBe('Customer annotation');
					expect(root.dir).toBe('ltr');
				}
			} finally {
				await initial?.destroy();
				await task?.destroy();
				if (runtime && previousWorker !== undefined)
					runtime.GlobalWorkerOptions.workerSrc = previousWorker;
				link.remove();
				for (const link of priorLinks) document.head.append(link);
				loader.ngOnDestroy();
				pdfDefaultOptions.assetsFolder = previousFolder;
			}
		}, 30_000);
	}
});
