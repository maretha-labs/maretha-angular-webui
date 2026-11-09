import { LocalizedUiError } from '@maretha/webui-sdk';
import { TestBed } from '@angular/core/testing';
import { WebUiMessages } from '@maretha/webui-sdk';
import { errorMessage, localizedMessage, localizedText, messageText } from './localized-message';

describe('localizedMessage', () => {
	it('retains typed failures across async catches and preserves server text literally', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', {
			'en-US': { failure: 'Cannot save {name}.' },
			fr: { failure: 'Impossible de sauvegarder {name}.' },
		});
		const state = TestBed.runInInjectionContext(() => localizedText(''));
		state.set(
			errorMessage(new LocalizedUiError('failure', 'Cannot save {name}.', { name: '<customer>' })),
		);
		messages.locale.set('fr');
		expect(state()).toBe('Impossible de sauvegarder <customer>.');
		state.set(errorMessage(new Error('failure')));
		expect(state()).toBe('failure');
	});
	it('preserves null and undefined states used by existing component contracts', () => {
		const nullable = TestBed.runInInjectionContext(() => localizedText(null));
		const optional = TestBed.runInInjectionContext(() => localizedText(undefined, true));
		expect(nullable()).toBeNull();
		expect(optional()).toBeUndefined();
		nullable.set(messageText('test.empty', 'Nothing to show.'));
		optional.set(messageText('test.empty', 'Nothing to show.'));
		expect(nullable()).toBe('Nothing to show.');
		expect(optional()).toBe('Nothing to show.');
		nullable.set(null);
		optional.set(undefined);
		expect(nullable()).toBeNull();
		expect(optional()).toBeUndefined();
	});
	it('keeps explicit message state reactive while literal setters and updates stay literal', () => {
		TestBed.configureTestingModule({});
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', {
			'en-US': { progress: '{count, number} saved for {name}.', Save: 'Changed' },
			fr: { progress: '{count, number} enregistrés pour {name}.', Save: 'Enregistrer' },
		});
		const status = TestBed.runInInjectionContext(() => localizedText(''));
		const values = { count: 12, name: '<b>Save</b> {count}' };
		status.set(messageText('progress', '{count, number} saved for {name}.', values));
		values.count = 99;
		expect(status()).toBe('12 saved for <b>Save</b> {count}.');
		messages.locale.set('fr');
		expect(status.asReadonly()()).toBe('12 enregistrés pour <b>Save</b> {count}.');
		status.set('Save');
		expect(status()).toBe('Save');
		status.update((value) => value + '!');
		messages.locale.set('ar');
		expect(status()).toBe('Save!');
		status.set('');
		expect(status()).toBe('');
	});
	it('updates visible errors with locale and preserves customer arguments literally', () => {
		TestBed.configureTestingModule({});
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', {
			'en-US': { failed: 'Could not save {name}.', Save: 'Changed' },
			fr: { failed: 'Impossible de sauvegarder {name}.', Save: 'Enregistrer' },
		});
		const error = TestBed.runInInjectionContext(localizedMessage);
		error.set('failed', 'Could not save {name}.', { name: 'Save' });
		expect(error.text()).toBe('Could not save Save.');
		messages.locale.set('fr');
		expect(error.text()).toBe('Impossible de sauvegarder Save.');
		error.clear();
		expect(error.text()).toBe('');
	});
});
