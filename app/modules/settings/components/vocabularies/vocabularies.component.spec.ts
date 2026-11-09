import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { DirectoryLayoutContext, provideDirectoryLayouts } from '@maretha/webui-sdk';
import { DirectoryService } from '../../helpers/directory.service';
import { VocabulariesComponent } from './vocabularies.component';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

@Component({
	standalone: true,
	template: `<section data-testid="custom-directory-layout">
		Custom directory editor <button (click)="commit()">Commit custom entry</button>
	</section>`,
})
class CustomVocabularyLayoutComponent {
	@Input({ required: true }) context!: DirectoryLayoutContext;

	commit(): void {
		this.context.commit({
			...this.context.draft,
			properties: { ...this.context.draft.properties, id: 'custom-entry', label: 'Custom label' },
		});
	}
}

describe('VocabulariesComponent', () => {
	let fixture: ComponentFixture<VocabulariesComponent>;
	let component: VocabulariesComponent;
	let create: jasmine.Spy;
	let update: jasmine.Spy;
	beforeEach(async () => {
		const entries$ = new Subject<any>();
		create = jasmine.createSpy('create').and.returnValue(of({}));
		update = jasmine.createSpy('update').and.returnValue(of({}));
		await TestBed.configureTestingModule({
			imports: [VocabulariesComponent],
			providers: [
				provideDirectoryLayouts({
					schema: 'vocabulary',
					component: CustomVocabularyLayoutComponent,
				}),
				{
					provide: DirectoryService,
					useValue: {
						listDirectories: () =>
							of({
								entries: [
									{ name: 'basic', schema: 'vocabulary' },
									{ name: 'cross', schema: 'xvocabulary', parent: 'basic' },
									{ name: 'localized', schema: 'l10nvocabulary' },
									{ name: 'localized-cross', schema: 'l10nxvocabulary', parent: 'basic' },
									{ name: 'users', schema: 'userDirectory' },
								],
							}),
						listEntries: () => entries$,
						create,
						update,
						delete: () => of(undefined),
					},
				},
			],
		}).compileComponents();
		fixture = TestBed.createComponent(VocabulariesComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});
	it('filters metadata and exposes the four pinned schema shapes', () => {
		expect(component.directories.map((item) => item.name)).toEqual([
			'basic',
			'cross',
			'localized',
			'localized-cross',
		]);
		component.selectDirectory('localized-cross');
		component.create();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('French label');
		expect(fixture.nativeElement.textContent).toContain('Parent');
	});
	it('allows retrying a failed catalog load before any vocabulary is selected', () => {
		fixture.destroy();
		spyOn(TestBed.inject(DirectoryService), 'listDirectories').and.returnValues(
			throwError(() => new Error('Unavailable')),
			of({ entries: [{ name: 'basic', schema: 'vocabulary' }] }),
		);
		fixture = TestBed.createComponent(VocabulariesComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
		expect(component.error).toContain('Directories could not be loaded');
		expect(fixture.nativeElement.querySelector('header button').disabled).toBeFalse();
		component.refresh();
		expect(component.directories.map((directory) => directory.name)).toEqual(['basic']);
		expect(component.error).toBe('');
		expect(component.catalogLoading).toBeFalse();
	});
	it('discards the old editor and cancels entry reads when switching or clearing a directory', () => {
		const first = new Subject<any>();
		const second = new Subject<any>();
		spyOn(TestBed.inject(DirectoryService), 'listEntries').and.returnValues(first, second);
		spyOn(window, 'confirm').and.returnValue(true);
		component.selectDirectory('basic');
		component.create();
		component.markDirty();
		component.selectDirectory('cross');
		expect(component.dirty).toBeFalse();
		expect(component.editing).toBeNull();
		first.next({ entries: [{ id: 'stale' }], isNextPageAvailable: true });
		expect(component.entries).toEqual([]);
		component.selectDirectory('');
		second.next({ entries: [{ id: 'also-stale' }], isNextPageAvailable: true });
		expect(component.entries).toEqual([]);
		expect(component.loading).toBeFalse();
		expect(component.hasNextPage).toBeFalse();
		expect(component.page).toBe(0);
		expect(component.hasPendingChanges()).toBeFalse();
	});
	it('resets stale paging controls on failure and returns from an empty last page', () => {
		const entry = {
			id: 'first',
			directoryName: 'basic',
			properties: { id: 'first', label: 'First' },
		};
		const list = spyOn(TestBed.inject(DirectoryService), 'listEntries').and.returnValues(
			of({ entries: [entry], isNextPageAvailable: true }),
			throwError(() => new Error('Unavailable')),
			of({ entries: [], isNextPageAvailable: false }),
			of({ entries: [entry], isNextPageAvailable: false }),
		);
		component.selectDirectory('basic');
		component.next();
		expect(component.page).toBe(1);
		expect(component.error).toContain('Directory entries could not be loaded');
		expect(component.hasNextPage).toBeFalse();
		component.next();
		expect(list).toHaveBeenCalledTimes(2);
		component.refresh();
		expect(component.page).toBe(0);
		expect(component.entries).toEqual([entry]);
		expect(component.error).toBe('');
	});
	it('shows parent and localized columns and loads the complete source parent choices', () => {
		const entry = {
			id: 'child',
			directoryName: 'localized-cross',
			properties: {
				id: 'child',
				label_en: 'English',
				label_fr: 'French',
				parent: 'root',
				obsolete: '0',
				ordering: 2,
			},
		};
		const list = spyOn(TestBed.inject(DirectoryService), 'listEntries').and.returnValue(
			of({ entries: [entry] }),
		);
		component.selectDirectory('localized-cross');
		fixture.detectChanges();
		expect(component.columns()).toEqual([
			'parent',
			'id',
			'label_en',
			'label_fr',
			'obsolete',
			'ordering',
		]);
		const cells = Array.from(
			fixture.nativeElement.querySelectorAll('tbody td') as NodeListOf<HTMLElement>,
		).map((cell) => cell.textContent?.trim());
		expect(cells.slice(0, 6)).toEqual(['root', 'child', 'English', 'French', 'No', '2']);
		component.create();
		expect(list).toHaveBeenCalledWith('localized-cross', 0, 0);
	});
	it('allows localized hierarchy roots and prevents choosing the entry or its descendants as parent', () => {
		const rows = [
			{
				id: 'root',
				directoryName: 'hierarchy',
				properties: { id: 'root', parent: '', obsolete: '0' },
			},
			{ id: 'child', directoryName: 'hierarchy', properties: { id: 'child', parent: 'root' } },
			{
				id: 'grandchild',
				directoryName: 'hierarchy',
				properties: { id: 'grandchild', parent: 'child' },
			},
			{ id: 'other', directoryName: 'hierarchy', properties: { id: 'other', parent: '' } },
		];
		spyOn(TestBed.inject(DirectoryService), 'listEntries').and.returnValue(of({ entries: rows }));
		component.directories.push({ name: 'hierarchy', schema: 'l10nxvocabulary' });
		component.selectDirectory('hierarchy');
		component.create();
		expect(component.parentRequired()).toBeFalse();
		expect(component.parentOptions().length).toBe(4);
		component.editing!.properties['id'] = 'new-root';
		component.save();
		expect(create).toHaveBeenCalled();
		component.edit(rows[0]);
		expect(component.parentOptions().map((entry) => entry.id)).toEqual(['other']);
		component.editing!.properties['parent'] = 'grandchild';
		component.save();
		expect(update).not.toHaveBeenCalled();
		component.editing!.properties['parent'] = '';
		component.save();
		expect(update.calls.mostRecent().args[2].properties['obsolete']).toBe(0);
	});
	it('refuses dirty departure', () => {
		spyOn(window, 'confirm').and.returnValue(false);
		component.selectDirectory('basic');
		component.create();
		component.markDirty();
		expect(component.canDeactivate({ reason: 'navigation', nextViewId: null })).toBeFalse();
	});

	it('keeps the stock Obsolete switch bound to the draft and blocks a second pending save', async () => {
		const pending = new Subject<any>();
		create.and.returnValue(pending);
		component.selectDirectory('localized');
		component.create();
		fixture.detectChanges();
		const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
		expect(dialog.querySelector('h2')?.textContent).toContain('Add Vocabulary Entry');
		const id = dialog.querySelector<HTMLInputElement>('input[name="id"]')!;
		expect(id.required).toBeTrue();
		id.value = 'new-localized';
		id.dispatchEvent(new Event('input', { bubbles: true }));
		const obsolete = dialog.querySelector<HTMLInputElement>('input[role="switch"]')!;
		obsolete.click();
		await fixture.whenStable();
		expect(component.editing!.properties['obsolete']).toBe(1);
		expect(component.dirty).toBeTrue();
		expect(create).not.toHaveBeenCalled();
		const save = dialog.querySelector<HTMLButtonElement>('[data-testid="directory-save"]')!;
		save.click();
		fixture.detectChanges();
		expect(create).toHaveBeenCalledTimes(1);
		expect(create.calls.mostRecent().args[1].properties.obsolete).toBe(1);
		expect(save.disabled).toBeTrue();
		expect(obsolete.matches(':disabled')).toBeTrue();
		save.click();
		expect(create).toHaveBeenCalledTimes(1);
		pending.next({});
		pending.complete();
		expect(component.editing).toBeNull();
	});

	it('uses a guarded modal editor that closes with Escape only when it is not busy', async () => {
		spyOn(window, 'confirm').and.returnValue(true);
		const dialogConfirm = spyOn(TestBed.inject(ConfirmDialogService), 'confirm').and.resolveTo(
			true,
		);
		component.selectDirectory('basic');
		component.create();
		fixture.detectChanges();
		const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
		expect(dialog.getAttribute('aria-modal')).toBe('true');
		dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await fixture.whenStable();
		expect(component.editing).toBeNull();
		// A dirty entry asks in-app; declining keeps the editor open, confirming closes it.
		component.create();
		component.markDirty();
		dialogConfirm.and.resolveTo(false);
		component.cancel();
		await fixture.whenStable();
		expect(component.editing).not.toBeNull();
		dialogConfirm.and.resolveTo(true);
		component.cancel();
		await fixture.whenStable();
		expect(component.editing).toBeNull();

		component.create();
		component.busy = true;
		fixture.detectChanges();
		fixture.nativeElement
			.querySelector('[role="dialog"]')
			.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(component.editing).not.toBeNull();
	});

	it('mounts a registered schema layout, accepts its draft, then saves only on the host action', () => {
		component.selectDirectory('basic');
		component.create();
		fixture.detectChanges();
		expect(
			fixture.nativeElement.querySelector('[data-testid="custom-directory-layout"]'),
		).not.toBeNull();
		fixture.nativeElement.querySelector('[data-testid="custom-directory-layout"] button').click();
		expect(create).not.toHaveBeenCalled();
		expect(component.dirty).toBeTrue();
		fixture.nativeElement.querySelector('[data-testid="directory-save"]').click();
		expect(create).toHaveBeenCalledWith(
			'basic',
			jasmine.objectContaining({
				properties: jasmine.objectContaining({ id: 'custom-entry', label: 'Custom label' }),
			}),
		);
		expect(component.editing).toBeNull();
	});

	it('rejects a stale custom callback and blocks departure while the explicit save is pending', () => {
		const create$ = new Subject<any>();
		create.and.returnValue(create$);
		component.selectDirectory('basic');
		component.create();
		const stale = component.layoutContext()!;
		expect(
			stale.commit({
				...stale.draft,
				properties: { ...stale.draft.properties, id: 'custom-entry' },
			}),
		).toBeTrue();
		expect(component.busy).toBeFalse();
		expect(component.hasPendingChanges()).toBeTrue();
		fixture.detectChanges();
		fixture.nativeElement.querySelector('[data-testid="directory-save"]').click();
		expect(component.busy).toBeTrue();
		expect(component.canDeactivate({ reason: 'navigation', nextViewId: null })).toBeFalse();
		component.cancel();
		expect(component.editing).not.toBeNull();
		create$.next({});
		create$.complete();
		expect(component.editing).toBeNull();
		expect(stale.commit(stale.draft)).toBeFalse();
		expect(create).toHaveBeenCalledTimes(1);
	});

	it('does not mount an editor or mutate a server read-only directory', () => {
		component.directories.find((directory) => directory.name === 'basic')!.readOnly = true;
		component.selectDirectory('basic');
		component.create();
		fixture.detectChanges();
		expect(component.editing).toBeNull();
		expect(
			fixture.nativeElement.querySelector('[data-testid="custom-directory-layout"]'),
		).toBeNull();
		expect(create).not.toHaveBeenCalled();
	});

	it('keeps an existing entry ID immutable and writes its captured ID after a custom draft', () => {
		component.selectDirectory('basic');
		component.edit({
			id: 'server-id',
			directoryName: 'basic',
			properties: { id: 'server-id', label: 'Before', obsolete: 0 },
		});
		const context = component.layoutContext()!;
		expect(
			context.commit({
				...context.draft,
				properties: { ...context.draft.properties, id: 'redirected-id' },
			}),
		).toBeFalse();
		expect(
			context.commit({
				...context.draft,
				properties: { ...context.draft.properties, label: 'After' },
			}),
		).toBeTrue();
		component.save();
		expect(update).toHaveBeenCalledWith('basic', 'server-id', jasmine.any(Object));
	});
	for (const scenario of [
		['basic', 'vocabulary', ['label']],
		['cross', 'xvocabulary', ['label', 'parent']],
		['localized', 'l10nvocabulary', ['label_en', 'label_fr']],
		['localized-cross', 'l10nxvocabulary', ['label_en', 'label_fr', 'parent']],
	] as const) {
		it(`creates the ${scenario[1]} source shape with its default payload`, () => {
			component.selectDirectory(scenario[0]);
			component.create();
			fixture.detectChanges();
			if (scenario[0] !== 'basic')
				for (const field of scenario[2])
					expect(fixture.nativeElement.querySelector(`[name="${field}"]`)).toBeTruthy();
			component.editing!.properties['id'] = `new-${scenario[1]}`;
			if (scenario[1].includes('xvocabulary'))
				component.editing!.properties['parent'] = 'parent-id';
			component.save();
			expect(create).toHaveBeenCalledWith(
				scenario[0],
				jasmine.objectContaining({
					properties: jasmine.objectContaining({
						id: `new-${scenario[1]}`,
						obsolete: 0,
						ordering: '',
					}),
				}),
			);
		});
	}
});
