import { TestBed } from '@angular/core/testing';
import { WebUiLocale } from '@maretha/webui-sdk';
import { TranslateService } from '@ngx-translate/core';
import { FileSizePipe } from './file-size.pipe';

describe('FileSizePipe', () => {
	let pipe: FileSizePipe;
	let translate: jasmine.SpyObj<TranslateService>;

	beforeEach(() => {
		translate = jasmine.createSpyObj<TranslateService>('TranslateService', ['instant']);
		translate.instant.and.returnValue('KB');
		pipe = TestBed.runInInjectionContext(() => new FileSizePipe(translate));
	});

	it('formats an empty size', () => {
		translate.instant.and.returnValue('Bytes');
		expect(pipe.transform(0)).toBe('0 Bytes');
		expect(translate.instant).toHaveBeenCalledWith('general.fileSize.bytes', { size: 0 });
	});

	it('uses binary size units and requests their translated label', () => {
		expect(pipe.transform(2048)).toBe('2 KB');
		expect(translate.instant).toHaveBeenCalledWith('general.fileSize.kb', { size: 2 });
	});

	it('preserves the requested decimal precision', () => {
		expect(pipe.transform(1536, 1)).toBe('1.5 KB');
		expect(translate.instant).toHaveBeenCalledWith('general.fileSize.kb', { size: 1.5 });
	});

	it('updates numbers when the app language changes and handles invalid sizes', () => {
		TestBed.inject(WebUiLocale).setLocale('fr');
		expect(pipe.transform(1536, 1)).toBe('1,5 KB');
		TestBed.inject(WebUiLocale).setLocale('ar');
		expect(pipe.transform(1536, 1)).toBe(new Intl.NumberFormat('ar').format(1.5) + ' KB');
		expect(pipe.transform(-1)).toBe(new Intl.NumberFormat('ar').format(0) + ' KB');
		expect(pipe.transform(Infinity)).toBe(new Intl.NumberFormat('ar').format(0) + ' KB');
	});

	it('treats a negative precision as zero decimal places', () => {
		expect(pipe.transform(1536, -1)).toBe('2 KB');
	});
});
