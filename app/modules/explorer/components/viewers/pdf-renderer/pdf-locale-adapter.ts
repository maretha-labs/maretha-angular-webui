/** Version-checked bridge for PDF.js's retained localization objects; never reopens a PDF. */
const supportedVersions = new Set(['5.4.1105', '5.4.1106']);
const methods = [
	'getLanguage',
	'getDirection',
	'get',
	'translate',
	'translateOnce',
	'destroy',
	'pause',
	'resume',
] as const;

interface PdfLocalization {
	getLanguage(): string;
	getDirection(): string;
	get(id: string): Promise<string>;
	translate(root: HTMLElement): Promise<void>;
	translateOnce(root: HTMLElement): Promise<void>;
	destroy(): Promise<void>;
	pause(): void;
	resume(): void;
}
interface PdfLocaleApplication {
	l10n: PdfLocalization;
	externalServices: { createL10n(): Promise<PdfLocalization> };
}
interface PdfLocaleOptions {
	set(name: string, value: { lang: string }): void;
}
export interface PdfLocaleResult {
	readonly applied: boolean;
	readonly directionDeferred: boolean;
}
function isLocalization(value: unknown): value is PdfLocalization {
	return !!value && methods.every((name) => typeof (value as PdfLocalization)[name] === 'function');
}
function normalized(locale: string): string {
	return locale.toLowerCase() === 'es' ? 'es-es' : locale.toLowerCase();
}

export class PdfLocaleAdapter {
	private serial = 0;
	private queue: Promise<unknown> = Promise.resolve();
	private target?: { l10n: PdfLocalization; root: HTMLElement; direction: string };

	cancel(): void {
		this.serial++;
	}

	update(
		application: unknown,
		options: unknown,
		version: string,
		root: HTMLElement,
		locale: string,
	): Promise<PdfLocaleResult> {
		const serial = ++this.serial;
		const result = this.queue
			.catch(() => undefined)
			.then(() => this.apply(application, options, version, root, locale, serial))
			.catch(() => ({ applied: false, directionDeferred: false }));
		this.queue = result;
		return result;
	}

	private async apply(
		value: unknown,
		rawOptions: unknown,
		version: string,
		root: HTMLElement,
		locale: string,
		serial: number,
	): Promise<PdfLocaleResult> {
		const application = value as Partial<PdfLocaleApplication> | undefined;
		const options = rawOptions as Partial<PdfLocaleOptions> | undefined;
		const original = application?.l10n;
		const unavailable = { applied: false, directionDeferred: false };
		if (
			serial !== this.serial ||
			!root.isConnected ||
			!supportedVersions.has(version) ||
			!isLocalization(original) ||
			typeof application?.externalServices?.createL10n !== 'function' ||
			typeof options?.set !== 'function'
		)
			return unavailable;
		if (this.target?.l10n !== original || this.target.root !== root)
			this.target = { l10n: original, root, direction: original.getDirection() };
		// PDFSidebar caches its resize direction in a private field at initialization. Keep that
		// geometry for this open viewer; the application and all translated text remain reactive.
		root.dir = this.target.direction;
		const directionDeferred = this.target.direction !== (locale === 'ar' ? 'rtl' : 'ltr');
		if (normalized(original.getLanguage()) === normalized(locale))
			return { applied: true, directionDeferred };
		if (
			!Object.isExtensible(original) ||
			methods.some((name) => {
				const property = Object.getOwnPropertyDescriptor(original, name);
				return property && (!property.writable || !property.configurable);
			})
		)
			return unavailable;
		let next: PdfLocalization | undefined;
		const current = () =>
			serial === this.serial && root.isConnected && application.l10n === original;
		try {
			options.set('localeProperties', { lang: locale });
			next = await application.externalServices.createL10n();
			if (!isLocalization(next) || next === original) return unavailable;
			// Resolve the real Fluent catalog before disconnecting the current observers.
			const label = await next.get('pdfjs-print-button-label');
			if (typeof label !== 'string' || !label.trim()) {
				await next.destroy();
				return unavailable;
			}
			if (!current()) {
				await next.destroy();
				return unavailable;
			}
			await original.destroy();
			if (!current()) {
				await next.destroy();
				return unavailable;
			}
			try {
				await next.translate(root);
			} catch (error) {
				await original.translate(root);
				throw error;
			}
			if (!current()) {
				await next.destroy();
				return unavailable;
			}
			// Existing toolbar, annotation and dialog instances retain this exact object. Forward
			// only localization methods; document, page, storage and transport are untouched.
			for (const name of methods)
				Object.defineProperty(original, name, {
					value: next[name].bind(next),
					writable: true,
					configurable: true,
				});
			return { applied: true, directionDeferred };
		} catch {
			await next?.destroy().catch(() => undefined);
			return unavailable;
		}
	}
}
