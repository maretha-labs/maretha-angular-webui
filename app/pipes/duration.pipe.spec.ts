import { TestBed } from '@angular/core/testing';
import { WebUiLocale } from '@maretha/webui-sdk';
import { DurationPipe } from './duration.pipe';

describe('DurationPipe', () => {
	let pipe: DurationPipe;
	beforeEach(() => {
		pipe = TestBed.runInInjectionContext(() => new DurationPipe());
	});
	it('keeps the compact media duration representation', () => {
		expect(pipe.transform(3661)).toBe('01:01:01s');
		expect(pipe.transform(60)).toBe('01');
		expect(pipe.transform('12')).toBe('12s');
	});
	it('reformats a retained value after language changes', () => {
		TestBed.inject(WebUiLocale).setLocale('ar');
		const one = new Intl.NumberFormat('ar', { minimumIntegerDigits: 2 }).format(1);
		expect(pipe.transform(3661)).toBe(`${one}:${one}:${one}s`);
		TestBed.inject(WebUiLocale).setLocale('pt-PT');
		expect(pipe.transform(3661)).toBe('01:01:01s');
	});
	it('does not show invalid or negative duration quantities', () => {
		for (const input of [0, -1, NaN, Infinity, 'unknown']) expect(pipe.transform(input)).toBe('');
	});
});
