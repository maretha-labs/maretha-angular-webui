import { TestBed } from '@angular/core/testing';
import { LocalizedUiError, WebUiLocale, WebUiMessages } from '@maretha/webui-sdk';
import { ToolbarActionComponent } from './toolbar-action.component';

describe('ToolbarActionComponent error reporting', () => {
	function setup(reportMessage = true) {
		TestBed.configureTestingModule({ imports: [ToolbarActionComponent] });
		const fixture = TestBed.createComponent(ToolbarActionComponent);
		const context = {
			availableCommands: ['archive'],
			selectedDocuments: [],
			document: null,
			busy: false,
			execute: jasmine.createSpy('execute'),
			reportError: jasmine.createSpy('reportError'),
			...(reportMessage ? { reportMessage: jasmine.createSpy('reportMessage') } : {}),
		};
		fixture.componentRef.setInput('context', context);
		fixture.componentRef.setInput('command', 'archive');
		fixture.componentRef.setInput('label', 'Customer archive');
		fixture.detectChanges();
		return { fixture, context, action: fixture.componentInstance };
	}
	it('passes a message descriptor to the host without translating its customer parameters', async () => {
		const { action, context } = setup();
		context.execute.and.rejectWith(
			new LocalizedUiError('test.denied', 'Denied {name}', { name: 'Customer name' }),
		);
		await action.run();
		expect(context.reportMessage).toHaveBeenCalledWith('test.denied', 'Denied {name}', {
			name: 'Customer name',
		});
		expect(context.reportError).not.toHaveBeenCalled();
	});
	it('supports a legacy string-only host and leaves server errors literal', async () => {
		const { action, context } = setup(false);
		TestBed.inject(WebUiMessages).register('test', {
			fr: { 'test.denied': 'Refusé {name}', 'action.failed': 'Échec de l’action.' },
		});
		TestBed.inject(WebUiLocale).setLocale('fr');
		context.execute.and.rejectWith(
			new LocalizedUiError('test.denied', 'Denied {name}', { name: 'Customer name' }),
		);
		await action.run();
		expect(context.reportError).toHaveBeenCalledWith('Refusé Customer name');
		context.execute.and.rejectWith(new Error('Customer server message'));
		await action.run();
		expect(context.reportError).toHaveBeenCalledWith('Customer server message');
		context.execute.and.rejectWith(null);
		await action.run();
		expect(context.reportError).toHaveBeenCalledWith('Échec de l’action.');
	});
	it('uses a translated generic descriptor for unknown failures and prevents duplicate busy actions', async () => {
		const { action, context, fixture } = setup();
		context.execute.and.rejectWith(null);
		await action.run();
		expect(context.reportMessage).toHaveBeenCalledWith(
			'action.failed',
			'The action failed. Check permissions and retry.',
		);
		fixture.componentRef.setInput('context', { ...context, busy: true });
		await action.run();
		action.activate();
		expect(context.execute).toHaveBeenCalledTimes(1);
	});
});
