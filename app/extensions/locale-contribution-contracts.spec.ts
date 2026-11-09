import { TestBed } from '@angular/core/testing';
import { WebUiMessages } from './webui-messages';
import { WebUiLocale } from './i18n/webui-locale';
import { localizedState } from './i18n/localized-state';
import { DrawerItemComponent, DrawerContext } from './drawer';
import { ThemeChoiceComponent, defineWebUiTheme } from './webui-themes';
import { DocumentActionContext } from './slots';
import { ResultsToolbarContext } from './toolbar';

describe('Localized contribution boundaries', () => {
	it('translates explicitly keyed theme labels and preserves customer labels and selection', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', {
			fr: { dark: 'Sombre', 'themes.current': 'Actuel', 'themes.apply': 'Appliquer' },
		});
		const theme = defineWebUiTheme({ id: 'dark', label: 'Dark', labelKey: 'dark', tokens: {} });
		expect(theme.inputs?.['labelKey']).toBe('dark');
		const fixture = TestBed.createComponent(ThemeChoiceComponent);
		const select = jasmine.createSpy('select');
		fixture.componentRef.setInput('context', { selected: 'dark', select });
		fixture.componentRef.setInput('themeId', 'dark');
		fixture.componentRef.setInput('tokens', {});
		fixture.componentRef.setInput('label', 'Dark');
		fixture.componentRef.setInput('labelKey', 'dark');
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Dark');
		messages.locale.set('fr');
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Sombre');
		expect(fixture.nativeElement.querySelector('button').getAttribute('aria-pressed')).toBe('true');
		fixture.componentRef.setInput('labelKey', undefined);
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('strong').textContent.trim()).toBe('Dark');
		const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
		expect(button.textContent?.trim()).toBe('Actuel');
		expect(button.disabled).toBeTrue();
		button.click();
		expect(select).not.toHaveBeenCalled();
		fixture.componentRef.setInput('context', { selected: 'other', select });
		fixture.detectChanges();
		expect(button.disabled).toBeFalse();
		expect(button.textContent?.trim()).toBe('Appliquer');
		button.click();
		expect(select).toHaveBeenCalledOnceWith('dark');
	});
	it('formats drawer counts in the selected locale while preserving the caller-owned label', () => {
		const fixture = TestBed.createComponent(DrawerItemComponent);
		const context: DrawerContext = {
			user: null,
			locale: 'en-US',
			route: '/',
			document: null,
			noEdit: false,
			activeKey: null,
			opened: false,
			open: () => undefined,
			close: () => undefined,
			navigate: () => undefined,
			recentDocuments: [],
			collections: [],
			clipboard: [],
			tasks: {},
			taskCount: 1234,
			clearHistory: () => undefined,
			clearClipboard: () => undefined,
		};
		fixture.componentRef.setInput('context', context);
		fixture.componentRef.setInput('pageId', 'tasks');
		fixture.componentRef.setInput('icon', 'test:tasks');
		fixture.componentRef.setInput('label', 'Customer tasks');
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('span').textContent.trim()).toBe('1,234');
		TestBed.inject(WebUiLocale).setLocale('ro');
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('span').textContent.trim()).toBe('1.234');
		expect(fixture.nativeElement.querySelector('button').getAttribute('aria-label')).toBe(
			'Customer tasks',
		);
	});
	it('lets toolbar hosts retain identified messages while legacy reportError remains literal', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', { fr: { failed: 'Échec de {name}.' } });
		const state = TestBed.runInInjectionContext(() => localizedState(''));
		const legacy: ResultsToolbarContext = {
			document: null,
			noEdit: false,
			selectedDocuments: [],
			busy: false,
			setBusy: () => undefined,
			refresh: async () => undefined,
			reportError: (message) => state.set(message),
			loadedCount: 0,
			totalCount: 0,
			allSelected: false,
			availableCommands: [],
			workflows: [],
			execute: async () => undefined,
		};
		expect(legacy.reportMessage).toBeUndefined();
		const current: ResultsToolbarContext = {
			...legacy,
			reportMessage: (key, fallback, values) => state.setMessage(key, fallback, values),
		};
		const action: DocumentActionContext = current;
		action.reportMessage?.('failed', 'Failed {name}.', { name: 'Customer file' });
		messages.locale.set('fr');
		expect(state()).toBe('Échec de Customer file.');
		legacy.reportError('failed');
		expect(state()).toBe('failed');
	});
});
