import { Component, ErrorHandler, input, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ResultsProjectionComponent } from './results-projection.component';
import { ResultsProjectionContext } from './results-projection';
import { ResultsProjectionRegistry } from './results-projection-registry';

@Component({
	selector: 'nx-test-search-card',
	template: `<article class="search-card">
		{{ context().searchId }}: {{ context().row.title }}
		<button class="select" (click)="context().toggleSelection()">Select</button>
		<button class="open" (click)="context().activateRow()">Open</button>
	</article>`,
})
class SearchCardComponent {
	readonly context = input.required<ResultsProjectionContext>();
}

@Component({
	selector: 'nx-test-search-cell',
	template: '<span class="search-cell">{{ context().column?.id }}: {{ context().value }}</span>',
})
class SearchCellComponent {
	readonly context = input.required<ResultsProjectionContext>();
}

@Component({
	selector: 'nx-test-registered-cell',
	template: '<span class="addon-cell">Add-on</span>',
})
class RegisteredCellComponent {
	readonly context = input.required<ResultsProjectionContext>();
}

describe('compiled result components', () => {
	const row = { uid: 'one', title: 'First', type: 'File' };
	function create(mode: 'grid' | 'table' = 'grid') {
		const fixture = TestBed.createComponent(ResultsProjectionComponent);
		fixture.componentRef.setInput('mode', mode);
		fixture.componentRef.setInput('hostId', 'repository-search');
		fixture.componentRef.setInput('searchId', 'example');
		fixture.componentRef.setInput('rows', [row]);
		fixture.componentRef.setInput('rowActivation', true);
		return fixture;
	}
	async function settle(fixture: ComponentFixture<ResultsProjectionComponent>) {
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
	}

	it('loads the active card once and passes guarded selection and activation callbacks', async () => {
		const fixture = create();
		const load = jasmine.createSpy('load').and.resolveTo(SearchCardComponent);
		const selected = jasmine.createSpy('selected');
		const activated = jasmine.createSpy('activated');
		fixture.componentInstance.selectionChange.subscribe(selected);
		fixture.componentInstance.rowActivated.subscribe(activated);
		fixture.componentRef.setInput('components', { item: load });
		await settle(fixture);
		expect(load).toHaveBeenCalledTimes(1);
		expect(fixture.nativeElement.querySelector('.search-card').textContent).toContain(
			'example: First',
		);
		fixture.nativeElement.querySelector('.select').click();
		fixture.nativeElement.querySelector('.open').click();
		expect(selected).toHaveBeenCalledOnceWith(['one']);
		expect(activated).toHaveBeenCalledOnceWith(row);
		fixture.componentRef.setInput('components', {});
		fixture.componentRef.setInput('mode', 'list');
		await settle(fixture);
		expect(fixture.nativeElement.querySelector('.search-card')).toBeNull();
		fixture.componentRef.setInput('components', { item: load });
		fixture.componentRef.setInput('mode', 'grid');
		await settle(fixture);
		expect(load).toHaveBeenCalledTimes(1);
		fixture.componentRef.setInput('loading', true);
		await settle(fixture);
		fixture.nativeElement.querySelector('.select').click();
		fixture.nativeElement.querySelector('.open').click();
		expect(selected).toHaveBeenCalledTimes(1);
		expect(activated).toHaveBeenCalledTimes(1);
	});

	it('ignores a previous view completing after the current view and releases its pending task', async () => {
		const fixture = create();
		let resolveOld!: (component: Type<unknown>) => void;
		const old = new Promise<Type<unknown>>((resolve) => (resolveOld = resolve));
		fixture.componentRef.setInput('components', { item: () => old });
		fixture.detectChanges();
		await Promise.resolve();
		fixture.componentRef.setInput('components', {
			item: () => Promise.resolve(RegisteredCellComponent),
		});
		await settle(fixture);
		expect(fixture.nativeElement.querySelector('.addon-cell')).not.toBeNull();
		resolveOld(SearchCardComponent);
		await settle(fixture);
		expect(fixture.nativeElement.querySelector('.addon-cell')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.search-card')).toBeNull();
	});

	it('reports failed imports and retains the stock renderer', async () => {
		const handler = spyOn(TestBed.inject(ErrorHandler), 'handleError');
		const fixture = create();
		const error = new Error('Cannot import compiled card');
		fixture.componentRef.setInput('components', { item: () => Promise.reject(error) });
		await settle(fixture);
		expect(handler).toHaveBeenCalledOnceWith(error);
		expect(fixture.nativeElement.querySelector('article').textContent).toContain('First');
	});

	it('overrides a table column while keeping other cells and registered add-ons in precedence', async () => {
		const fixture = create('table');
		fixture.nativeElement.style.cssText = 'width:800px;height:600px';
		document.body.append(fixture.nativeElement);
		fixture.componentRef.setInput('columns', [
			{ id: 'title', label: 'Title' },
			{ id: 'type', label: 'Type' },
		]);
		fixture.componentRef.setInput('components', {
			'cell:title': () => Promise.resolve(SearchCellComponent),
		});
		await settle(fixture);
		expect(fixture.nativeElement.querySelector('.search-cell').textContent).toBe('title: First');
		expect(
			fixture.nativeElement.querySelector('[role="gridcell"][col-id="type"]').textContent,
		).toContain('File');
		TestBed.inject(ResultsProjectionRegistry).register({
			id: 'addon.cells',
			projection: 'cell',
			searchId: 'example',
			component: RegisteredCellComponent,
		});
		await settle(fixture);
		expect(fixture.nativeElement.querySelector('.search-cell')).toBeNull();
		expect(fixture.nativeElement.querySelectorAll('.addon-cell').length).toBe(2);
		fixture.destroy();
	});

	it('scopes add-ons to one search even when searches share a host ID', async () => {
		TestBed.inject(ResultsProjectionRegistry).register({
			id: 'addon.example',
			hostId: 'repository-search',
			searchId: 'example',
			projection: 'item',
			component: RegisteredCellComponent,
			when: (context) => (context as ResultsProjectionContext).searchId === 'example',
		});
		const example = create();
		const other = create();
		other.componentRef.setInput('searchId', 'other');
		await settle(example);
		await settle(other);
		expect(example.nativeElement.querySelector('.addon-cell')).not.toBeNull();
		expect(other.nativeElement.querySelector('.addon-cell')).toBeNull();
		expect(example.componentInstance.hostContext().searchId).toBe('example');
		expect(other.componentInstance.hostContext().searchId).toBe('other');
	});

	it('invalidates retained callbacks when the search identity changes', async () => {
		const fixture = create();
		await settle(fixture);
		const selected = jasmine.createSpy('selected');
		const activated = jasmine.createSpy('activated');
		fixture.componentInstance.selectionChange.subscribe(selected);
		fixture.componentInstance.rowActivated.subscribe(activated);
		const context = fixture.componentInstance.rowContext(row, 0);
		const host = fixture.componentInstance.hostContext();
		fixture.componentRef.setInput('searchId', 'other');
		context.toggleSelection();
		context.activateRow();
		host.toggleAll();
		expect(selected).not.toHaveBeenCalled();
		expect(activated).not.toHaveBeenCalled();
	});
});
