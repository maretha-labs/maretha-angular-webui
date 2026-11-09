import { computed, isSignal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WebUiMessages } from '../webui-messages';
import { LocalizedUiError, localizedState } from './localized-state';

describe('SDK localized state', () => {
	it('retains message arguments and updates an existing notice when the locale changes', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', { ro: { failed: 'Fișierul {name} nu a putut fi încărcat.' } });
		const state = TestBed.runInInjectionContext(() => localizedState(''));
		state.setMessage('failed', 'Could not upload {name}.', { name: '{customer-key}.pdf' });
		expect(state()).toBe('Could not upload {customer-key}.pdf.');
		messages.locale.set('ro');
		expect(state()).toBe('Fișierul {customer-key}.pdf nu a putut fi încărcat.');
		state.set('failed');
		expect(state()).toBe('failed');
		state.update((value) => value + '!');
		expect(state.asReadonly()()).toBe('failed!');
	});
	it('supports generic writable-signal consumers without exposing message descriptors', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', { fr: { notice: 'Bonjour {name}.' } });
		const state = TestBed.runInInjectionContext(() => localizedState(''));
		const writable: WritableSignal<string> = state;
		const readonly = writable.asReadonly();
		const length = computed(() => readonly().length);
		expect(isSignal(writable)).toBeTrue();
		expect(isSignal(readonly)).toBeTrue();
		expect('set' in readonly).toBeFalse();
		state.setMessage('notice', 'Hello {name}.', { name: 'Acme' });
		expect(length()).toBe('Hello Acme.'.length);
		messages.locale.set('fr');
		expect(readonly()).toBe('Bonjour Acme.');
		expect(length()).toBe('Bonjour Acme.'.length);
		writable.update((value) => value.toUpperCase());
		messages.locale.set('en-US');
		expect(writable()).toBe('BONJOUR ACME.');
		writable.set('notice');
		messages.locale.set('fr');
		expect(readonly()).toBe('notice');
	});
	it('retains nullable writable-signal assignments and null updates', () => {
		const state = TestBed.runInInjectionContext(() => localizedState(null));
		const writable: WritableSignal<string | null> = state;
		const replace = <T>(target: WritableSignal<T>, value: T) => target.set(value);
		replace(writable, 'Customer message');
		expect(writable()).toBe('Customer message');
		writable.update(() => null);
		expect(writable.asReadonly()()).toBeNull();
	});
	it('preserves literal customer errors and localizes only identified app errors', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', { fr: { error: 'Échec de {name}.', fallback: 'Échec.' } });
		const state = TestBed.runInInjectionContext(() => localizedState(null));
		expect(state()).toBeNull();
		const error = new LocalizedUiError('error', 'Failed {name}.', { name: 'Acme' });
		expect(error.message).toBe('Failed Acme.');
		state.setError(error, 'fallback', 'Failed.');
		messages.locale.set('fr');
		expect(state()).toBe('Échec de Acme.');
		state.setError(new Error('Customer message'), 'fallback', 'Failed.');
		expect(state()).toBe('Customer message');
		state.setError({}, 'fallback', 'Failed.');
		expect(state()).toBe('Échec.');
		state.set(null);
		expect(state()).toBeNull();
	});
});
