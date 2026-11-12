import { Component, DestroyRef, inject, input, Type, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { defineContribution } from './contribution';
import { ContributionOutletComponent } from './contribution-outlet.component';
import { ExtensionRegistry } from './extension-registry.service';
import { provideWebUiExtensions } from './provide-webui-extensions';
import { DOCUMENT_ACTIONS_SLOT, DocumentActionContext } from './slots';
import { WebUiSlotComponent } from './webui-slot.component';

let created = 0;
let destroyed = 0;
@Component({
	standalone: true,
	changeDetection: ChangeDetectionStrategy.Eager,
	template: '<button>{{label()}}:{{context().document?.["uid"]}}</button>',
})
class TestAction {
	readonly context = input.required<DocumentActionContext>();
	readonly label = input('Info');
	readonly instance = ++created;
	constructor() {
		inject(DestroyRef).onDestroy(() => {
			destroyed++;
		});
	}
}
@Component({
	standalone: true,
	changeDetection: ChangeDetectionStrategy.Eager,
	template: 'Invalid',
})
class MissingContextAction {}
@Component({
	standalone: true,
	changeDetection: ChangeDetectionStrategy.Eager,
	template: '{{fail()}}',
})
class BrokenTemplateAction {
	readonly context = input.required<DocumentActionContext>();
	fail(): never {
		throw new Error('private template data');
	}
}
@Component({
	standalone: true,
	changeDetection: ChangeDetectionStrategy.Eager,
	template: '{{extra()}}',
})
class RequiredInputAction {
	readonly context = input.required<DocumentActionContext>();
	readonly extra = input.required<string>();
}
@Component({
	standalone: true,
	changeDetection: ChangeDetectionStrategy.Eager,
	template: 'Client action',
})
class BrokenDestroyAction {
	readonly context = input.required<DocumentActionContext>();
	constructor() {
		inject(DestroyRef).onDestroy(() => {
			throw new Error('private teardown data');
		});
	}
}

describe('WebUiSlotComponent', () => {
	let registry: ExtensionRegistry;
	let fixture: ComponentFixture<WebUiSlotComponent>;
	const context = (uid: string): DocumentActionContext => ({ document: { uid }, noEdit: false });
	const contribution = (id = 'client.info') =>
		defineContribution(DOCUMENT_ACTIONS_SLOT, { id, component: TestAction });
	async function settle(target = fixture): Promise<void> {
		target.detectChanges();
		await target.whenStable();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		target.detectChanges();
	}
	async function activatePending(target = fixture): Promise<void> {
		target.detectChanges();
		await Promise.resolve();
		target.detectChanges();
	}
	function create(uid = 'first'): ComponentFixture<WebUiSlotComponent> {
		const target = TestBed.createComponent(WebUiSlotComponent);
		target.componentRef.setInput('name', 'DOCUMENT_ACTIONS');
		target.componentRef.setInput('context', context(uid));
		return target;
	}
	beforeEach(() => {
		created = 0;
		destroyed = 0;
		TestBed.configureTestingModule({
			imports: [WebUiSlotComponent],
			providers: [provideWebUiExtensions({ id: 'defaults', contributions: [contribution()] })],
		});
		registry = TestBed.inject(ExtensionRegistry);
		fixture = create();
	});

	it('renders a provider contribution and updates its context without remounting', async () => {
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Info:first');
		fixture.componentRef.setInput('context', context('second'));
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Info:second');
		expect(created).toBe(1);
		expect(destroyed).toBe(0);
	});

	it('stacks full-width contribution rows in configured order', async () => {
		registry.register({
			id: 'stack-items',
			contributions: [
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: 'client.first',
					component: TestAction,
					order: -10,
					inputs: { label: 'First' },
				}),
			],
		});
		fixture.componentRef.setInput('layout', 'stack');
		fixture.nativeElement.style.width = '260px';
		await settle();
		const rows = Array.from(
			fixture.nativeElement.querySelectorAll('nx-contribution-outlet'),
		) as HTMLElement[];
		expect(rows.map((row) => row.textContent?.trim())).toEqual(['First:first', 'Info:first']);
		for (const row of rows) expect(row.getBoundingClientRect().width).toBeCloseTo(260, 0);
		expect(rows[1].getBoundingClientRect().top).toBeGreaterThanOrEqual(
			rows[0].getBoundingClientRect().bottom,
		);
		expect(created).toBe(2);
	});

	it('updates context and ordering in a stack without remounting contributions', async () => {
		registry.register({ id: 'stack-items', contributions: [contribution('client.other')] });
		fixture.componentRef.setInput('layout', 'stack');
		await settle();
		const firstInstance = fixture.debugElement.query(By.directive(TestAction)).componentInstance;
		fixture.componentRef.setInput('context', context('next'));
		registry.register({
			id: 'stack-order',
			overrides: [{ slot: 'DOCUMENT_ACTIONS', id: 'client.other', order: -10 }],
		});
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Info:next');
		expect(fixture.componentInstance.resolution().items[0].id).toBe('client.other');
		expect(fixture.debugElement.queryAll(By.directive(TestAction))[1].componentInstance).toBe(
			firstInstance,
		);
		expect(created).toBe(2);
		expect(destroyed).toBe(0);
	});

	it('preserves inline action layout and component state when switching layout modes', async () => {
		await settle();
		const action = fixture.debugElement.query(By.directive(TestAction)).componentInstance;
		expect(getComputedStyle(fixture.nativeElement).display).toBe('inline-flex');
		fixture.componentRef.setInput('layout', 'stack');
		await settle();
		expect(getComputedStyle(fixture.nativeElement).display).toBe('flex');
		expect(getComputedStyle(fixture.nativeElement).flexDirection).toBe('column');
		fixture.componentRef.setInput('layout', 'inline');
		await settle();
		expect(getComputedStyle(fixture.nativeElement).display).toBe('inline-flex');
		expect(fixture.nativeElement.querySelector('.stack')).toBeNull();
		expect(fixture.debugElement.query(By.directive(TestAction)).componentInstance).toBe(action);
		expect(created).toBe(1);
		expect(destroyed).toBe(0);
	});

	it('gives concurrent hosts independent document contexts and component lifetimes', async () => {
		const second = create('other');
		await settle();
		await settle(second);
		expect(fixture.nativeElement.textContent).toContain('Info:first');
		expect(second.nativeElement.textContent).toContain('Info:other');
		expect(created).toBe(2);
		second.destroy();
		expect(destroyed).toBe(1);
	});

	it('removes disabled actions and restores the default when the override is disposed', async () => {
		await settle();
		const dispose = registry.register({
			id: 'client',
			overrides: [{ slot: 'DOCUMENT_ACTIONS', id: 'client.info', disabled: true }],
		});
		await settle();
		expect(fixture.nativeElement.querySelector('button')).toBeNull();
		expect(destroyed).toBe(1);
		dispose();
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Info:first');
	});

	it('loads replacement components with declared configuration inputs', async () => {
		registry.register({
			id: 'client',
			contributions: [
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: 'client.info',
					component: TestAction,
					inputs: { label: 'Custom' },
				}),
			],
		});
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Custom:first');
	});

	it('keeps existing component state when an unrelated extension is registered', async () => {
		await settle();
		registry.register({ id: 'unrelated', contributions: [contribution('client.other')] });
		await settle();
		expect(created).toBe(2);
		expect(destroyed).toBe(0);
	});

	it('uses current context when a lazy component finishes loading', async () => {
		let complete!: (value: Type<unknown>) => void;
		const pending = new Promise<Type<unknown>>((resolve) => {
			complete = resolve;
		});
		registry.register({
			id: 'client',
			contributions: [
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: 'client.info',
					loadComponent: () => pending,
				}),
			],
		});
		await activatePending();
		fixture.componentRef.setInput('context', context('latest'));
		await activatePending();
		complete(TestAction);
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Info:latest');
		expect(created).toBe(1);
	});

	it('reorders an existing action without destroying its local state', async () => {
		registry.register({ id: 'client', contributions: [contribution('client.other')] });
		await settle();
		registry.register({
			id: 'ordering',
			overrides: [{ slot: 'DOCUMENT_ACTIONS', id: 'client.other', order: -10 }],
		});
		await settle();
		expect(created).toBe(2);
		expect(destroyed).toBe(0);
		expect(fixture.componentInstance.resolution().items[0].id).toBe('client.other');
	});

	it('ignores a late loader result after that contribution has been replaced', async () => {
		let complete!: (value: Type<unknown>) => void;
		const pending = new Promise<Type<unknown>>((resolve) => {
			complete = resolve;
		});
		registry.register({
			id: 'client',
			contributions: [
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: 'client.info',
					loadComponent: () => pending,
				}),
			],
		});
		await activatePending();
		registry.register({
			id: 'client',
			contributions: [
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: 'client.info',
					component: TestAction,
					inputs: { label: 'New' },
				}),
			],
		});
		// Replacing the outlet releases the stale loader's PendingTasks entry,
		// so stable work can continue before that loader ever resolves.
		await settle();
		complete(TestAction);
		await settle();
		expect(fixture.nativeElement.textContent).toContain('New:first');
		expect(created).toBe(1);
	});

	it('contains loader failures and keeps neighboring actions usable', async () => {
		registry.register({
			id: 'client',
			contributions: [
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: 'broken',
					loadComponent: () => Promise.reject(new Error('private URL')),
				}),
			],
		});
		await settle();
		expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
			'Extension unavailable',
		);
		expect(fixture.nativeElement.textContent).toContain('Info:first');
		expect(fixture.nativeElement.textContent).not.toContain('private URL');
	});

	it('reports incompatible component inputs without creating the component', async () => {
		registry.register({
			id: 'client',
			contributions: [
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: 'client.info',
					component: MissingContextAction,
				}),
			],
		});
		await settle();
		const outlet = fixture.debugElement.query(By.directive(ContributionOutletComponent))
			.componentInstance as ContributionOutletComponent;
		expect(outlet.diagnostic()?.code).toBe('render-failed');
		expect(fixture.nativeElement.textContent).not.toContain('Invalid');
	});

	it('rejects undeclared configuration inputs', async () => {
		registry.register({
			id: 'client',
			contributions: [
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: 'client.info',
					component: TestAction,
					inputs: { typo: true },
				}),
			],
		});
		await settle();
		expect(fixture.nativeElement.querySelector('button')).toBeNull();
		expect(created).toBe(0);
	});

	it('contains initial template errors and exposes sanitized host diagnostics', async () => {
		registry.register({
			id: 'client',
			contributions: [
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: 'broken',
					component: BrokenTemplateAction,
				}),
			],
		});
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Info:first');
		expect(fixture.nativeElement.textContent).toContain('Extension unavailable');
		expect(fixture.componentInstance.diagnostics()[0].code).toBe('render-failed');
		expect(JSON.stringify(fixture.componentInstance.diagnostics())).not.toContain(
			'private template data',
		);
	});

	it('contains missing required component inputs during initial rendering', async () => {
		registry.register({
			id: 'client',
			contributions: [
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: 'client.info',
					component: RequiredInputAction,
				}),
			],
		});
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Extension unavailable');
	});

	it('contains contribution teardown errors while switching back to the default', async () => {
		const dispose = registry.register({
			id: 'client',
			contributions: [
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: 'client.info',
					component: BrokenDestroyAction,
				}),
			],
		});
		await settle();
		dispose();
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Info:first');
	});

	it('destroys its rendered contribution when the host is destroyed', async () => {
		await settle();
		fixture.destroy();
		expect(destroyed).toBe(1);
	});
});
