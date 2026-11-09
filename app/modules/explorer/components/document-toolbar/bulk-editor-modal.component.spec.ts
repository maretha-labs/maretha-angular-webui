import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
	BulkLayoutContext,
	BulkValidationError,
	LocalizedUiError,
	WebUiMessages,
	ViewNavigation,
} from '@maretha/webui-sdk';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { DocumentLayoutGatewayService } from '../../helpers/document-layout-gateway.service';
import { BulkEditorModalComponent } from './bulk-editor-modal.component';
import { BulkEditorService } from './bulk-editor.service';

@Component({
	selector: 'nx-client-bulk-layout',
	standalone: true,
	template: '<p>Client bulk layout</p>',
})
class ClientBulkLayoutComponent {
	@Input({ required: true }) context!: BulkLayoutContext;
}

describe('BulkEditorModalComponent', () => {
	let fixture: ComponentFixture<BulkEditorModalComponent>;
	let service: jasmine.SpyObj<BulkEditorService>;
	const createFixture = async (
		documents = [{ uid: 'one', repository: 'default', properties: {} }],
	) => {
		fixture = TestBed.createComponent(BulkEditorModalComponent);
		fixture.componentRef.setInput('documents', documents);
		fixture.detectChanges();
		await fixture.whenStable();
		await fixture.componentInstance.loadDirectories();
		fixture.detectChanges();
	};
	beforeEach(async () => {
		service = jasmine.createSpyObj<BulkEditorService>('bulk', ['save']);
		service.save.and.callFake(async (_ids, _changes, _current, status) => {
			status?.({ uid: 'one', state: 'saved' });
			return [{ uid: 'one', state: 'saved' }];
		});
		await TestBed.configureTestingModule({
			imports: [BulkEditorModalComponent],
			providers: [
				{ provide: BulkEditorService, useValue: service },
				{ provide: BsModalRef, useValue: { hide: jasmine.createSpy('hide') } },
				{ provide: ViewNavigation, useValue: { register: () => () => undefined } },
				{ provide: Router, useValue: { events: new Subject() } },
				{
					provide: DocumentLayoutGatewayService,
					useValue: {
						bulkDirectoryChoices: async (directoryName: string) =>
							directoryName === 'nature'
								? [{ id: 'article', label: 'Article' }]
								: directoryName === 'l10nsubjects'
									? [{ id: 'art/architecture', label: 'Art / Architecture' }]
									: [{ id: 'europe', label: 'Europe' }],
					},
				},
			],
		}).compileComponents();
		await createFixture();
	});
	it('relocalizes failed statuses and plural summaries while retaining customer errors and changes', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', {
			ro: {
				'sdk.bulk.validation.clear-required': 'Nu se poate goli {property}.',
				'bulk.state.failed': 'eșuat',
				'app.gateway.changeToken': 'Token de modificare necesar.',
				'bulk.summary': '{failed, number} eșuate',
				'bulk.selection':
					'{count, plural, one {# document afișat.} few {# documente afișate.} other {# de documente afișate.}}',
			},
		});
		const error = new BulkValidationError('clear-required', { property: 'customer:{name}' });
		fixture.componentInstance.statuses = [
			{ uid: 'one', state: 'failed', error: error.message, validationError: error },
			{ uid: 'two', state: 'failed', error: 'Customer error' },
			{
				uid: 'three',
				state: 'failed',
				error: 'A change token is required to save safely.',
				localizedError: new LocalizedUiError(
					'app.gateway.changeToken',
					'A change token is required to save safely.',
				),
			},
		];
		fixture.componentInstance.changes = [{ property: 'dc:title', mode: 'replace', value: 'Draft' }];
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Cannot clear required property');
		messages.locale.set('ro');
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Nu se poate goli customer:{name}.');
		expect(fixture.nativeElement.textContent).toContain('Customer error');
		expect(fixture.nativeElement.textContent).toContain('3 eșuate');
		expect(fixture.nativeElement.textContent).toContain('Token de modificare necesar.');
		expect(fixture.componentInstance.changes[0].value).toBe('Draft');
		expect(service.save).not.toHaveBeenCalled();
	});
	it('refreshes server-localized choices without resetting selected IDs or the mounted form', fakeAsync(() => {
		const gateway = TestBed.inject(DocumentLayoutGatewayService);
		const messages = TestBed.inject(WebUiMessages);
		const calls = spyOn(gateway, 'bulkDirectoryChoices').and.callFake(async () => [
			{ id: 'stable-id', label: 'Français' },
		]);
		const component = fixture.componentInstance;
		const form = fixture.nativeElement.querySelector('nx-default-bulk-layout');
		const context = component.layoutContext;
		component.changes = [{ property: 'dc:subjects', mode: 'replace', value: ['stable-id'] }];
		messages.locale.set('fr');
		fixture.detectChanges();
		flushMicrotasks();
		fixture.detectChanges();
		expect(calls).toHaveBeenCalledTimes(3);
		expect(component.options['dc:subjects']).toEqual([{ id: 'stable-id', label: 'Français' }]);
		expect(component.changes[0].value).toEqual(['stable-id']);
		expect(component.layoutContext).toBe(context);
		expect(fixture.nativeElement.querySelector('nx-default-bulk-layout')).toBe(form);
		expect(service.save).not.toHaveBeenCalled();
	}));

	it('mounts the default source form and submits its projected change payload', async () => {
		const mode = fixture.nativeElement.querySelector('nx-bulk-widget select') as HTMLSelectElement;
		mode.value = 'replace';
		mode.dispatchEvent(new Event('change'));
		fixture.detectChanges();
		const value = fixture.nativeElement.querySelector('[name="dc:nature"]') as HTMLSelectElement;
		expect(value).not.toBeNull();
		const nature = [...value.options].find((option) => option.text === 'Article')!;
		nature.selected = true;
		value.dispatchEvent(new Event('change'));
		fixture.detectChanges();
		await fixture.componentInstance.save();
		expect(service.save).toHaveBeenCalledWith(
			['one'],
			jasmine.arrayContaining([
				jasmine.objectContaining({ property: 'dc:nature', mode: 'replace', value: 'article' }),
			]),
			jasmine.any(Function),
			jasmine.any(Function),
		);
		expect(fixture.componentInstance.completed).toBeTrue();
	});
	it('renders localized labels with the Nuxeo hierarchy value in native selects', () => {
		const nature = fixture.nativeElement.querySelector('[name="dc:nature"]') as HTMLSelectElement;
		const subjects = fixture.nativeElement.querySelector(
			'[name="dc:subjects"]',
		) as HTMLSelectElement;
		const natureOption = [...nature.options].find((option) => option.text === 'Article')!;
		const subjectOption = [...subjects.options].find(
			(option) => option.text === 'Art / Architecture',
		)!;
		expect(natureOption.value).toContain('article');
		expect(subjectOption.value).toContain('art/architecture');
	});
	it('blocks empty replace values while allowing the field to show its validation error', async () => {
		const mode = fixture.nativeElement.querySelector('nx-bulk-widget select') as HTMLSelectElement;
		mode.value = 'replace';
		mode.dispatchEvent(new Event('change'));
		fixture.detectChanges();
		await fixture.componentInstance.save();
		expect(service.save).not.toHaveBeenCalled();
		expect(fixture.nativeElement.textContent).toContain(
			'Choose a value before applying this change.',
		);
	});
	it('mounts a client override with the frozen selected-document context', () => {
		fixture.componentRef.setInput('layoutComponent', ClientBulkLayoutComponent);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Client bulk layout');
		expect(Object.isFrozen(fixture.componentInstance.layoutContext.documents)).toBeTrue();
	});
	it('never resends unknown outcomes and retries only the known failed document with the original draft', async () => {
		fixture.destroy();
		await createFixture([
			{ uid: 'saved', repository: 'default', properties: {} },
			{ uid: 'failed', repository: 'default', properties: {} },
			{ uid: 'unknown', repository: 'default', properties: {} },
		]);
		fixture.componentInstance.layoutContext.commit([
			{ property: 'dc:nature', mode: 'replace', value: 'nature' },
		]);
		service.save.calls.reset();
		service.save.and.callFake(async (ids, _changes, _current, status) => {
			const outcomes = ids.map((uid) => ({
				uid,
				state:
					uid === 'saved'
						? ('saved' as const)
						: uid === 'failed'
							? ('failed' as const)
							: ('unknown' as const),
			}));
			for (const outcome of outcomes) status?.(outcome);
			return outcomes;
		});
		await fixture.componentInstance.save();
		expect(service.save.calls.argsFor(0)[0]).toEqual(['saved', 'failed', 'unknown']);
		fixture.componentInstance.layoutContext.commit([
			{ property: 'dc:nature', mode: 'replace', value: 'other' },
		]);
		expect(fixture.componentInstance.changes).toEqual([
			{ property: 'dc:nature', mode: 'replace', value: 'nature' },
		]);
		await fixture.componentInstance.save();
		expect(service.save).toHaveBeenCalledTimes(1);
		await fixture.componentInstance.retryFailed();
		expect(service.save.calls.argsFor(1)[0]).toEqual(['failed']);
		expect(service.save.calls.argsFor(1)[1]).toEqual([
			{ property: 'dc:nature', mode: 'replace', value: 'nature' },
		]);
	});
});
