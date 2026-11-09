import { TestBed } from '@angular/core/testing';
import { WebUiLocale } from './i18n/webui-locale';
import { WebUiMessagePipe, WebUiMessages } from './webui-messages';

describe('WebUI complete messages', () => {
	let messages: WebUiMessages;
	beforeEach(() => {
		TestBed.configureTestingModule({});
		messages = TestBed.inject(WebUiMessages);
	});
	it('uses the same validated locale signal and preserves literal customer labels', () => {
		expect(messages.locale).toBe(TestBed.inject(WebUiLocale).locale);
		messages.locale.set('fr-FR');
		expect(messages.locale()).toBe('fr');
		expect(messages.text(undefined, 'Customer {literal} <b>label</b>')).toBe(
			'Customer {literal} <b>label</b>',
		);
	});
	it('formats named ICU plural/select messages and locale-sensitive numeric values', () => {
		messages.register('core', {
			'en-US': {
				count:
					'{kind, select, file {{count, plural, one {# file} other {# files}}} other {Unknown}}',
			},
			fr: { size: '{value, number}' },
		});
		expect(messages.format('count', { kind: 'file', count: 1 })).toBe('1 file');
		expect(messages.format('count', { kind: 'file', count: 2 })).toBe('2 files');
		messages.locale.set('fr');
		expect(messages.format('size', { value: 1234.5 })).toBe(
			new Intl.NumberFormat('fr').format(1234.5),
		);
	});
	it('supports every Arabic plural category', () => {
		messages.register('core', {
			ar: {
				count: '{n, plural, zero {zero} one {one} two {two} few {few} many {many} other {other}}',
			},
		});
		messages.locale.set('ar');
		for (const [n, expected] of [
			[0, 'zero'],
			[1, 'one'],
			[2, 'two'],
			[3, 'few'],
			[11, 'many'],
			[100, 'other'],
		] as const)
			expect(messages.format('count', { n })).toBe(expected);
	});
	it('falls back to fixed English for missing or malformed translated messages', () => {
		messages.register('core', {
			'en-US': { ok: 'Hello {name}', missing: 'English' },
			ar: { ok: '{broken' },
		});
		messages.locale.set('ar');
		expect(messages.format('ok', { name: 'Ada' })).toBe('Hello Ada');
		expect(messages.format('missing')).toBe('English');
		expect(messages.format('unknown', {}, 'Caller fallback')).toBe('Caller fallback');
		expect(messages.format('ok', {}, 'Fallback')).toBe('Fallback');
	});
	it('keeps client overrides above asynchronously loaded core messages and restores replacements', () => {
		const restoreOld = messages.register('client', { 'en-US': { key: 'Old' } });
		const restore = messages.register('client', { 'en-US': { key: 'Client' } });
		messages.register('core', { 'en-US': { key: 'Core' } }, -100);
		restoreOld();
		expect(messages.text('key', '')).toBe('Client');
		restore();
		expect(messages.text('key', '')).toBe('Core');
		expect(() => messages.register('invalid', {}, NaN)).toThrow();
	});
	it('supports named pipe values without parsing interpolated HTML or ICU as markup', () => {
		messages.register('core', {
			'en-US': {
				hello: '<b>Hello {name}</b>',
				positional: 'Created {0}; missing {1}',
				plural: '{0, plural, one {# item} other {# items}}',
			},
		});
		const pipe = TestBed.runInInjectionContext(() => new WebUiMessagePipe());
		expect(pipe.transform('hello', '', { name: '<script>{n,plural,other{bad}}</script>' })).toBe(
			'<b>Hello <script>{n,plural,other{bad}}</script></b>',
		);
		expect(pipe.transform('positional', '', '<b>A</b>')).toBe('Created <b>A</b>; missing {1}');
		expect(pipe.transform('plural', '', 2)).toBe('2 items');
	});
});
