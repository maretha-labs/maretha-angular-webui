import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { SuggestionSettings } from '@maretha/webui-sdk';
import { of, Subject } from 'rxjs';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { DocumentTagsPanelComponent } from './document-tags-panel.component';
describe('DocumentTagsPanelComponent', () => {
	let fixture: ComponentFixture<DocumentTagsPanelComponent>;
	let documents: jasmine.SpyObj<DocumentsManagerService>;
	beforeEach(async () => {
		documents = jasmine.createSpyObj('DocumentsManagerService', [
			'addTag',
			'removeTag',
			'suggestTag',
		]);
		documents.addTag.and.returnValue(of({}));
		documents.removeTag.and.returnValue(of({}));
		await TestBed.configureTestingModule({
			imports: [DocumentTagsPanelComponent],
			providers: [{ provide: DocumentsManagerService, useValue: documents }],
		}).compileComponents();
		fixture = TestBed.createComponent(DocumentTagsPanelComponent);
	});
	it('uses native tag operations only for a writable taggable document', () => {
		fixture.componentRef.setInput('document', {
			uid: 'doc',
			facets: ['NXTag'],
			contextParameters: { permissions: ['WriteProperties'], tags: [{ label: 'one' }] },
		});
		fixture.detectChanges();
		fixture.componentInstance.newTag = 'two';
		fixture.componentInstance.add();
		fixture.componentInstance.remove('one');
		expect(documents.addTag).toHaveBeenCalledWith('doc', ['two']);
		expect(documents.removeTag).toHaveBeenCalledWith('doc', 'one');
	});
	it('does not render or mutate without the tag capability', () => {
		fixture.componentRef.setInput('document', {
			uid: 'doc',
			facets: [],
			contextParameters: { permissions: [], tags: [] },
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent.trim()).toBe('');
		fixture.componentInstance.add();
		expect(documents.addTag).not.toHaveBeenCalled();
	});
	it('keeps the tag chip from the successful operation response when its surrounding document has not refreshed', () => {
		const document = {
			uid: 'doc',
			facets: ['NXTag'],
			contextParameters: { permissions: ['WriteProperties'], tags: [] },
		};
		fixture.componentRef.setInput('document', document);
		fixture.detectChanges();
		documents.addTag.and.returnValue(
			of({
				...document,
				contextParameters: { ...document.contextParameters, tags: [{ label: 'docs-parity' }] },
			}),
		);
		fixture.componentInstance.newTag = 'docs-parity';
		fixture.componentInstance.add();
		fixture.detectChanges();
		expect(fixture.componentInstance.tags).toEqual(['docs-parity']);
		expect(fixture.nativeElement.querySelector('.tag-chip')?.textContent).toContain('docs-parity');
	});
	describe('Enter in the tag picker (stock persists the typed tag at once)', () => {
		const type = (term: string) => {
			const input = fixture.nativeElement.querySelector('ng-select input') as HTMLInputElement;
			input.value = term;
			input.dispatchEvent(new Event('input'));
			fixture.detectChanges();
			return input;
		};
		const press = (input: HTMLInputElement, key: string) => {
			input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
			fixture.detectChanges();
		};
		beforeEach(() => {
			fixture.componentRef.setInput('document', {
				uid: 'doc',
				facets: ['NXTag'],
				contextParameters: { permissions: ['WriteProperties'], tags: [] },
			});
			fixture.detectChanges();
		});
		it('waits for the configured characters and pause before suggesting', fakeAsync(() => {
			TestBed.inject(SuggestionSettings).apply({ widgets: { tag: { minChars: 3, pauseMs: 100 } } });
			documents.suggestTag.and.returnValue(of([]));
			type('au');
			tick(300);
			expect(documents.suggestTag).not.toHaveBeenCalled();
			expect(fixture.nativeElement.querySelector('.tag-status')?.textContent).toContain(
				'Please enter 3 or more characters',
			);
			type('aud');
			tick(99);
			expect(documents.suggestTag).not.toHaveBeenCalled();
			tick(1);
			expect(documents.suggestTag).toHaveBeenCalledOnceWith('aud');
		}));
		it('attaches the typed tag while suggestions are still pending, without asking for them', fakeAsync(() => {
			documents.suggestTag.and.returnValue(of([{ id: 'audit', displayLabel: 'audit' }]));
			const input = type('audit');
			press(input, 'Enter');
			tick(300);
			expect(documents.addTag).toHaveBeenCalledOnceWith('doc', ['audit']);
			expect(documents.suggestTag).not.toHaveBeenCalled();
			expect(input.value).toBe('');
		}));
		it('attaches once and cancels an in-flight suggestion lookup when Enter commits the text', fakeAsync(() => {
			const lookup = new Subject<{ id: string; displayLabel: string }[]>();
			documents.suggestTag.and.returnValue(lookup);
			const input = type('audit');
			tick(300);
			fixture.detectChanges();
			expect(lookup.observed).toBeTrue();
			expect(fixture.componentInstance.searching).toBeTrue();
			press(input, 'Enter');
			expect(documents.addTag).toHaveBeenCalledOnceWith('doc', ['audit']);
			expect(lookup.observed).toBeFalse();
			lookup.next([{ id: 'audit-other', displayLabel: 'audit-other' }]);
			tick();
			fixture.detectChanges();
			expect(documents.addTag).toHaveBeenCalledTimes(1);
			expect(input.value).toBe('');
		}));
		it('attaches an existing tag named exactly by the text once suggestions arrived', fakeAsync(() => {
			documents.suggestTag.and.returnValue(of([{ id: 'audit', displayLabel: 'Audit' }]));
			const input = type('audit');
			tick(300);
			fixture.detectChanges();
			expect(documents.suggestTag).toHaveBeenCalledOnceWith('audit');
			press(input, 'Enter');
			expect(documents.addTag).toHaveBeenCalledOnceWith('doc', ['audit']);
		}));
		for (const suggested of [undefined, { id: 'audit-id', displayLabel: 'Audit' }]) {
			it(`keeps the ${suggested ? 'suggested' : 'typed'} tag visible after a failed write and allows retry`, fakeAsync(() => {
				const firstWrite = new Subject<unknown>();
				const retryWrite = new Subject<unknown>();
				documents.addTag.and.returnValues(firstWrite, retryWrite);
				documents.suggestTag.and.returnValue(of(suggested ? [suggested] : []));
				const expectedId = suggested?.id ?? 'audit';
				const expectedLabel = suggested?.displayLabel ?? 'audit';
				const input = type('audit');
				tick(300);
				fixture.detectChanges();
				press(input, 'Enter');
				tick();
				fixture.detectChanges();
				expect(documents.addTag).toHaveBeenCalledOnceWith('doc', [expectedId]);
				firstWrite.error(new Error('offline'));
				tick();
				fixture.detectChanges();
				expect(fixture.componentInstance.error).toContain('Tags could not be updated');
				expect(fixture.nativeElement.querySelector('ng-select .ng-value-label')?.textContent).toBe(
					expectedLabel,
				);
				type('audit');
				tick(300);
				fixture.detectChanges();
				press(input, 'Enter');
				expect(documents.addTag.calls.allArgs()).toEqual([
					['doc', [expectedId]],
					['doc', [expectedId]],
				]);
				expect(fixture.componentInstance.busy).toBeTrue();
				expect(fixture.componentInstance.error).toBeNull();
				retryWrite.next({
					uid: 'doc',
					facets: ['NXTag'],
					contextParameters: { permissions: ['WriteProperties'], tags: [expectedLabel] },
				});
				retryWrite.complete();
				tick();
				fixture.detectChanges();
				expect(fixture.componentInstance.busy).toBeFalse();
				expect(fixture.componentInstance.tags).toEqual([expectedLabel]);
				expect(input.value).toBe('');
			}));
		}
		it('keeps a suggestion highlighted with the arrow keys as the Enter choice', fakeAsync(() => {
			documents.suggestTag.and.returnValue(of([{ id: 'audit-2026', displayLabel: 'audit-2026' }]));
			const input = type('aud');
			tick(300);
			fixture.detectChanges();
			press(input, 'ArrowDown');
			press(input, 'Enter');
			expect(documents.addTag).toHaveBeenCalledOnceWith('doc', ['audit-2026']);
		}));
	});
});
