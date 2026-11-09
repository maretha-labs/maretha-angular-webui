import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Subject } from 'rxjs';
import {
	DEFAULT_SUGGESTION_CONFIG,
	provideSuggestionScope,
	SUGGESTION_OPTIONS,
	SuggestionLimits,
	suggestionLimits,
	SuggestionScope,
	SuggestionSettings,
	suggestionTerms,
} from './suggestion-settings';

describe('Suggestion settings', () => {
	// No test reads custom/suggestions.json: users edit it freely.
	it('starts from the stock values', () => {
		const settings = TestBed.inject(SuggestionSettings);
		expect(settings.resolve({ widget: 'user' })).toEqual({ minChars: 3, pauseMs: 300 });
		expect(settings.resolve({ widget: 'tag' })).toEqual({ minChars: 1, pauseMs: 300 });
		expect(settings.resolve({ widget: 'directory', field: 'dc:subjects' }).minChars).toBe(0);
		expect(settings.resolve({ widget: 'directory', field: 'my:region' }).minChars).toBe(3);
		expect(
			settings.resolve({ widget: 'document', layout: 'maretha.dialog.add-to-collection' }).minChars,
		).toBe(0);
		// An empty entry, as the shipped file has for every id, inherits the application levels.
		settings.apply({ ...DEFAULT_SUGGESTION_CONFIG, layouts: { 'maretha.admin.users': {} } });
		expect(settings.resolve({ widget: 'user', layout: 'maretha.admin.users' })).toEqual({
			minChars: 3,
			pauseMs: 300,
		});
	});

	it('looks up the layout field, widget and layout, then the same application levels', () => {
		const settings = TestBed.inject(SuggestionSettings);
		settings.apply({
			minChars: 4,
			pauseMs: 100,
			widgets: { user: { minChars: 5 } },
			fields: { 'dc:nature': { minChars: 6, pauseMs: 110 } },
			layouts: {
				'nuxeo.task38e': {
					pauseMs: 120,
					widgets: { user: { minChars: 7 } },
					fields: { participants: { minChars: 8 } },
				},
			},
		});
		const at = (target: Parameters<SuggestionSettings['resolve']>[0]) => settings.resolve(target);
		expect(at({ widget: 'user', layout: 'nuxeo.task38e', field: 'participants' })).toEqual({
			minChars: 8,
			pauseMs: 120,
		});
		expect(at({ widget: 'user', layout: 'nuxeo.task38e' })).toEqual({ minChars: 7, pauseMs: 120 });
		expect(at({ widget: 'tag', layout: 'nuxeo.task38e', field: 'dc:nature' })).toEqual({
			minChars: 6,
			pauseMs: 120,
		});
		expect(at({ widget: 'directory', field: 'dc:nature' })).toEqual({ minChars: 6, pauseMs: 110 });
		expect(at({ widget: 'user' })).toEqual({ minChars: 5, pauseMs: 100 });
		expect(at({ widget: 'document', layout: 'other' })).toEqual({ minChars: 4, pauseMs: 100 });
	});

	it('keeps only whole, in-range numbers and own keys', () => {
		const settings = TestBed.inject(SuggestionSettings);
		expect(settings.apply('not an object')).toBeFalse();
		expect(settings.apply([])).toBeFalse();
		expect(settings.resolve({ widget: 'tag' }).minChars).toBe(1);
		expect(
			settings.apply({
				minChars: -1,
				pauseMs: 99999,
				widgets: { user: { minChars: 2.5 }, unknown: { minChars: 9 }, tag: 'one' },
				fields: { constructor: { minChars: 9 } },
				layouts: { broken: 7 },
			}),
		).toBeTrue();
		expect(settings.resolve({ widget: 'user' })).toEqual({ minChars: 3, pauseMs: 300 });
		expect(settings.resolve({ widget: 'tag', field: 'toString' })).toEqual({
			minChars: 3,
			pauseMs: 300,
		});
		expect(settings.resolve({ widget: 'user', layout: 'broken' }).minChars).toBe(3);
	});

	it('starts from bootstrap options', () => {
		TestBed.configureTestingModule({
			providers: [{ provide: SUGGESTION_OPTIONS, useValue: { minChars: 2, pauseMs: 0 } }],
		});
		expect(TestBed.inject(SuggestionSettings).resolve({ widget: 'tag' })).toEqual({
			minChars: 2,
			pauseMs: 0,
		});
	});

	it('follows the nearest scope and configuration changes', () => {
		TestBed.configureTestingModule({ providers: [provideSuggestionScope('nuxeo.task38e')] });
		const limits = TestBed.runInInjectionContext(() => suggestionLimits('user'));
		expect(limits().minChars).toBe(3);
		TestBed.inject(SuggestionSettings).apply({ layouts: { 'nuxeo.task38e': { minChars: 1 } } });
		expect(limits().minChars).toBe(1);
		TestBed.inject(SuggestionScope).layout.set('other');
		expect(limits().minChars).toBe(3);
	});

	it('emits short terms at once as null and long terms after the pause', fakeAsync(() => {
		let limits: SuggestionLimits = { minChars: 3, pauseMs: 300 };
		const terms = new Subject<string>();
		const emitted: (string | null)[] = [];
		terms.pipe(suggestionTerms(() => limits)).subscribe((term) => emitted.push(term));
		terms.next('ab');
		expect(emitted).toEqual([null]);
		terms.next('abc');
		tick(299);
		terms.next(' ab ');
		expect(emitted).toEqual([null, null]);
		tick(300);
		terms.next('abcd');
		tick(300);
		expect(emitted).toEqual([null, null, 'abcd']);
		limits = { minChars: 0, pauseMs: 0 };
		terms.next('');
		expect(emitted).toEqual([null, null, 'abcd', '']);
	}));
});
