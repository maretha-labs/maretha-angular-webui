import { WebUiMessages } from './webui-messages';
import { ComponentFixture, TestBed, fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { SchemaFieldComponent } from './schema-field.component';
import { SuggestionScope, SuggestionSettings } from './suggestion-settings';
import { WidgetProps } from './document-layout';

describe('SchemaFieldComponent', () => {
	let fixture: ComponentFixture<SchemaFieldComponent>;
	let commits: unknown[];
	function props(
		value: unknown,
		field: Partial<WidgetProps['field']> = {},
		overrides: Partial<WidgetProps> = {},
	): WidgetProps {
		return {
			field: { property: 'value', label: 'Value', type: 'string', multiple: false, ...field },
			value,
			disabled: false,
			mode: 'edit',
			identity: 'document:value',
			error: null,
			commit: (next) => commits.push(next),
			...overrides,
		};
	}
	beforeEach(() => {
		commits = [];
		TestBed.configureTestingModule({ imports: [SchemaFieldComponent] });
		fixture = TestBed.createComponent(SchemaFieldComponent);
	});
	it('localizes compound field actions without interpreting customer labels as keys', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', {
			ro: { 'sdk.field.add': 'Adaugă {label}', Customer: 'Do not translate' },
		});
		fixture.componentRef.setInput('props', props([], { multiple: true, label: 'Customer' }));
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Add Customer');
		messages.locale.set('ro');
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Adaugă Customer');
		expect(fixture.nativeElement.textContent).not.toContain('Do not translate');
	});
	it('updates a retained reference failure in the current locale without reissuing the lookup', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', { fr: { 'sdk.field.noSearch': 'Recherche indisponible.' } });
		fixture.componentRef.setInput('props', props('', { type: 'reference' }));
		fixture.detectChanges();
		const input = fixture.nativeElement.querySelector('input');
		input.value = 'Acme';
		input.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		expect(fixture.componentInstance.lookupError()).toBe(
			'This application has no reference search.',
		);
		messages.locale.set('fr');
		fixture.detectChanges();
		expect(fixture.componentInstance.lookupError()).toBe('Recherche indisponible.');
		expect(input.value).toBe('Acme');
		expect(commits).toEqual([]);
	});
	it('opens vocabulary choices on focus and commits a selected id rather than typed text', fakeAsync(() => {
		const search = jasmine
			.createSpy('search')
			.and.resolveTo([{ id: 'report', label: 'Annual report' }]);
		const field = {
			property: 'dc:nature',
			type: 'directory' as const,
			directoryName: 'nature',
			label: 'Nature',
		};
		fixture.componentRef.setInput('props', props(null, field, { search }));
		fixture.detectChanges();
		const input = fixture.nativeElement.querySelector('[role=combobox]') as HTMLInputElement;
		input.dispatchEvent(new FocusEvent('focus'));
		flushMicrotasks();
		fixture.detectChanges();
		expect(search).toHaveBeenCalledOnceWith(
			jasmine.objectContaining({ directoryName: 'nature' }),
			'',
		);
		expect(input.getAttribute('aria-expanded')).toBe('true');
		expect(commits).toEqual([]);
		(fixture.nativeElement.querySelector('[role=option]') as HTMLButtonElement).click();
		expect(commits).toEqual(['report']);
		fixture.componentRef.setInput('props', props('report', field, { search }));
		fixture.detectChanges();
		expect(input.value).toBe('Annual report');
		expect(input.getAttribute('aria-expanded')).toBe('false');
	}));
	it('uses one searchable multi-value vocabulary selector instead of generic list editors', fakeAsync(() => {
		const search = jasmine.createSpy('search').and.resolveTo([
			{ id: 'business', label: 'Business' },
			{ id: 'business/economy', label: 'Business / Economy' },
		]);
		const field = {
			type: 'directory' as const,
			property: 'dc:subjects',
			multiple: true,
			directoryName: 'l10nsubjects',
			label: 'Subjects',
		};
		fixture.componentRef.setInput('props', props(['business'], field, { search }));
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelectorAll('[role=combobox]').length).toBe(1);
		expect(fixture.nativeElement.textContent).not.toContain('Add Subjects');
		fixture.componentInstance.openDirectory();
		flushMicrotasks();
		fixture.detectChanges();
		const options = fixture.nativeElement.querySelectorAll(
			'[role=option]',
		) as NodeListOf<HTMLButtonElement>;
		expect(options[0].getAttribute('aria-selected')).toBe('true');
		options[1].click();
		expect(commits).toEqual([['business', 'business/economy']]);
		fixture.componentRef.setInput(
			'props',
			props(['business', 'business/economy'], field, { search }),
		);
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelectorAll('.directory-value').length).toBe(2);
		expect(fixture.nativeElement.textContent).toContain('Business / Economy');
		(
			fixture.nativeElement.querySelectorAll('.directory-value button')[1] as HTMLButtonElement
		).click();
		expect(commits[1]).toEqual(['business']);
	}));
	it('rejects vocabulary results from an old document and keeps disabled selectors inert', fakeAsync(() => {
		let resolve!: (value: { id: string; label: string }[]) => void;
		const search = jasmine
			.createSpy('search')
			.and.callFake(() => new Promise((done) => (resolve = done)));
		const field = {
			property: 'dc:coverage',
			type: 'directory' as const,
			directoryName: 'l10ncoverage',
		};
		fixture.componentRef.setInput('props', props(null, field, { search }));
		fixture.detectChanges();
		fixture.componentInstance.openDirectory();
		fixture.componentRef.setInput(
			'props',
			props(null, field, { search, identity: 'other-document:coverage', disabled: true }),
		);
		fixture.detectChanges();
		resolve([{ id: 'stale', label: 'Old scope' }]);
		flushMicrotasks();
		fixture.detectChanges();
		fixture.componentInstance.openDirectory();
		fixture.componentInstance.choose('stale');
		expect(fixture.componentInstance.options()).toEqual([]);
		expect(fixture.componentInstance.directoryOpen()).toBeFalse();
		expect(search).toHaveBeenCalledTimes(1);
		expect(commits).toEqual([]);
	}));
	it('refreshes open directory matches and rejects a stale locale response without committing input', fakeAsync(() => {
		const messages = TestBed.inject(WebUiMessages);
		const pending: ((value: { id: string; label: string }[]) => void)[] = [];
		const search = jasmine
			.createSpy('search')
			.and.callFake(() => new Promise((resolve) => pending.push(resolve)));
		fixture.componentRef.setInput('props', props('saved-id', { type: 'directory' }, { search }));
		fixture.detectChanges();
		const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
		input.value = 'query';
		input.dispatchEvent(new Event('input'));
		tick(300);
		messages.locale.set('fr');
		fixture.detectChanges();
		expect(search).toHaveBeenCalledTimes(2);
		pending[1]([{ id: 'same-id', label: 'Français' }]);
		flushMicrotasks();
		fixture.detectChanges();
		pending[0]([{ id: 'same-id', label: 'Stale English' }]);
		flushMicrotasks();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Français');
		expect(fixture.nativeElement.textContent).not.toContain('Stale English');
		expect(input.value).toBe('query');
		expect(commits).toEqual([]);
		expect(fixture.componentInstance.props().value).toBe('saved-id');
	}));
	it('asks for 3 characters before searching other vocabularies and references, then pauses', fakeAsync(() => {
		const search = jasmine.createSpy('search').and.resolveTo([{ id: 'north', label: 'North' }]);
		const field = { property: 'my:region', type: 'directory' as const, directoryName: 'region' };
		fixture.componentRef.setInput('props', props(null, field, { search }));
		fixture.detectChanges();
		fixture.componentInstance.openDirectory();
		fixture.detectChanges();
		expect(search).not.toHaveBeenCalled();
		expect(fixture.nativeElement.textContent).toContain('Please enter 3 or more characters');
		const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
		input.value = 'no';
		input.dispatchEvent(new Event('input'));
		tick(300);
		expect(search).not.toHaveBeenCalled();
		input.value = 'nor';
		input.dispatchEvent(new Event('input'));
		tick(299);
		expect(search).not.toHaveBeenCalled();
		tick(1);
		expect(search).toHaveBeenCalledOnceWith(
			jasmine.objectContaining({ property: 'my:region' }),
			'nor',
		);
		flushMicrotasks();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).not.toContain('Please enter');
		expect(fixture.nativeElement.textContent).toContain('North');
	}));
	it('takes reference limits from the layout scope', fakeAsync(() => {
		TestBed.resetTestingModule();
		const scope = new SuggestionScope();
		scope.layout.set('custom.layout');
		TestBed.configureTestingModule({
			imports: [SchemaFieldComponent],
			providers: [{ provide: SuggestionScope, useValue: scope }],
		});
		TestBed.inject(SuggestionSettings).apply({
			layouts: { 'custom.layout': { widgets: { document: { minChars: 1, pauseMs: 50 } } } },
		});
		fixture = TestBed.createComponent(SchemaFieldComponent);
		const search = jasmine.createSpy('search').and.resolveTo([]);
		fixture.componentRef.setInput(
			'props',
			props(null, { property: 'my:reference', type: 'reference' }, { search }),
		);
		fixture.detectChanges();
		const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
		input.value = 'a';
		input.dispatchEvent(new Event('input'));
		tick(50);
		expect(search).toHaveBeenCalledOnceWith(
			jasmine.objectContaining({ property: 'my:reference' }),
			'a',
		);
		flushMicrotasks();
	}));
	it('edits nested complex number and date controls through the supplied immutable callback', () => {
		fixture.componentRef.setInput(
			'props',
			props(
				{ count: 1, when: '2026-09-16T00:00:00.000Z' },
				{ type: 'complex', fields: { count: 'integer', when: 'date' } },
			),
		);
		fixture.detectChanges();
		const inputs = fixture.nativeElement.querySelectorAll('input');
		expect(inputs.length).toBe(2);
		inputs[0].value = '2';
		inputs[0].dispatchEvent(new Event('input'));
		expect(commits).toEqual([{ count: '2', when: '2026-09-16T00:00:00.000Z' }]);
	});
	it('adds, reorders and removes list values', () => {
		fixture.componentRef.setInput(
			'props',
			props(['a', 'b'], { type: 'string', itemType: 'string', multiple: true }),
		);
		fixture.detectChanges();
		const buttons = fixture.nativeElement.querySelectorAll('button');
		buttons[1].click();
		expect(commits[0]).toEqual(['b', 'a']);
		buttons[2].click();
		expect(commits[1]).toEqual(['b']);
	});
	it('renders boolean and blob list item controls recursively', () => {
		fixture.componentRef.setInput(
			'props',
			props([true, false], { type: 'boolean', itemType: 'boolean', multiple: true }),
		);
		fixture.detectChanges();
		const checkboxes = fixture.nativeElement.querySelectorAll('input[type="checkbox"]');
		expect(checkboxes.length).toBe(2);
		checkboxes[1].checked = true;
		checkboxes[1].dispatchEvent(new Event('input'));
		expect(commits.pop()).toEqual([true, true]);

		fixture.componentRef.setInput(
			'props',
			props([{ name: 'one.pdf' }], { type: 'blob', itemType: 'blob', multiple: true }),
		);
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelectorAll('input[type="file"]').length).toBe(1);
		expect(fixture.nativeElement.textContent).toContain('one.pdf');
	});
	it('retains the edited list input, focus and caret through change detection', () => {
		fixture.componentRef.setInput(
			'props',
			props(['first', 'second'], { type: 'string', itemType: 'string', multiple: true }),
		);
		fixture.detectChanges();
		const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
		input.focus();
		input.value = 'first!';
		input.setSelectionRange(6, 6);
		input.dispatchEvent(new Event('input'));
		fixture.componentRef.setInput(
			'props',
			props(commits.at(-1), { type: 'string', itemType: 'string', multiple: true }),
		);
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('input')).toBe(input);
		expect(document.activeElement).toBe(input);
		expect(input.selectionStart).toBe(6);
		input.value = 'first!?';
		input.dispatchEvent(new Event('input'));
		expect(commits.at(-1)).toEqual(['first!?', 'second']);
	});
	it('keeps a pending item upload with its reordered value', async () => {
		let finishUpload!: (value: { name: string }) => void;
		fixture.componentRef.setInput(
			'props',
			props(
				[null, null],
				{ type: 'blob', itemType: 'blob', multiple: true },
				{ upload: () => new Promise<{ name: string }>((resolve) => (finishUpload = resolve)) },
			),
		);
		fixture.detectChanges();
		const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
		Object.defineProperty(input, 'files', { value: [new File(['x'], 'moved.pdf')] });
		input.dispatchEvent(new Event('change'));
		const moveDown = Array.from(
			fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
		).find((button) => button.textContent?.trim() === 'Move down') as HTMLButtonElement;
		moveDown.click();
		fixture.componentRef.setInput(
			'props',
			props(
				commits.at(-1),
				{ type: 'blob', itemType: 'blob', multiple: true },
				{
					upload: () => new Promise<{ name: string }>((resolve) => (finishUpload = resolve)),
				},
			),
		);
		fixture.detectChanges();
		finishUpload({ name: 'moved.pdf' });
		await Promise.resolve();
		expect(commits.at(-1)).toEqual([null, { name: 'moved.pdf' }]);
	});
	it('ignores a pending item upload after its item is removed or its scope changes', async () => {
		let finishUpload!: (value: { name: string }) => void;
		const upload = () => new Promise<{ name: string }>((resolve) => (finishUpload = resolve));
		fixture.componentRef.setInput(
			'props',
			props([null], { type: 'blob', itemType: 'blob', multiple: true }, { upload }),
		);
		fixture.detectChanges();
		const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
		Object.defineProperty(input, 'files', { value: [new File(['x'], 'removed.pdf')] });
		input.dispatchEvent(new Event('change'));
		const remove = Array.from(
			fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
		).find((button) => button.textContent?.trim() === 'Remove') as HTMLButtonElement;
		remove.click();
		fixture.componentRef.setInput(
			'props',
			props([], { type: 'blob', itemType: 'blob', multiple: true }, { upload }),
		);
		fixture.detectChanges();
		finishUpload({ name: 'removed.pdf' });
		await Promise.resolve();
		expect(commits).toEqual([[]]);

		fixture.componentRef.setInput(
			'props',
			props(
				[null],
				{ type: 'blob', itemType: 'blob', multiple: true },
				{ upload, identity: 'other:value' },
			),
		);
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelectorAll('input[type="file"]').length).toBe(1);
	});
});
