import { TestBed } from '@angular/core/testing';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { ToastService } from 'app/helpers/toast.service';
import { of, throwError } from 'rxjs';
import { WorkflowsService } from 'app/helpers/workflows.service';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { WorkflowGraphDialogComponent } from './workflow-graph-dialog.component';
import { WorkflowGraphDialogService } from './workflow-graph-dialog.service';

describe('WorkflowGraphDialogComponent', () => {
	beforeEach(() =>
		TestBed.configureTestingModule({
			imports: [WorkflowGraphDialogComponent],
			providers: [...legacyTestProviders()],
		}).compileComponents(),
	);

	it('draws stock nodes at their coordinates, connects them, and closes', async () => {
		const fixture = TestBed.createComponent(WorkflowGraphDialogComponent);
		fixture.componentInstance.graph = {
			nodes: [
				{ id: 'start', title: 'Start', x: 440, y: 0, isStartNode: true },
				{ id: 'task', title: 'Choose Participants', x: 420, y: 100, state: 'suspended' },
			],
			transitions: [{ nodeSourceId: 'start', nodeTargetId: 'task', label: 'start' }],
		};
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		const nodes = [...fixture.nativeElement.querySelectorAll('.workflow_node')] as HTMLElement[];
		const classes = (node: HTMLElement) => [...node.classList].sort();
		expect(nodes.map((node) => [classes(node), node.style.left, node.style.top])).toEqual([
			[['workflow_node', 'workflow_start_node'], '440px', '0px'],
			[['workflow_node', 'workflow_node_suspended', 'workflow_simple_task'], '420px', '100px'],
		]);
		expect(
			fixture.nativeElement.querySelector('.nx-workflow-graph__connector')?.getAttribute('d'),
		).toBe('M460,40 L460,70 L460,100');
		expect(
			fixture.nativeElement.querySelector('.workflow_connection_label')?.textContent?.trim(),
		).toBe('start');
		const hide = spyOn(TestBed.inject(BsModalRef), 'hide');
		(fixture.nativeElement.querySelector('.nx-workflow-graph__close') as HTMLButtonElement).click();
		expect(hide).toHaveBeenCalled();
	});
});

describe('WorkflowGraphDialogService', () => {
	it('opens the fetched graph and notifies like stock when it cannot be read', async () => {
		const graph = { nodes: [], transitions: [] };
		const workflows = { getWorkflowGraph: jasmine.createSpy('graph').and.returnValue(of(graph)) };
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders(), { provide: WorkflowsService, useValue: workflows }],
		});
		const show = spyOn(TestBed.inject(BsModalService), 'show').and.returnValue({} as BsModalRef);
		const error = spyOn(TestBed.inject(ToastService), 'error');
		const service = TestBed.inject(WorkflowGraphDialogService);
		await service.show('wf-1');
		expect(workflows.getWorkflowGraph).toHaveBeenCalledOnceWith('wf-1');
		expect(show).toHaveBeenCalledOnceWith(
			WorkflowGraphDialogComponent,
			jasmine.objectContaining({
				class: 'nx-workflow-graph-dialog',
				initialState: jasmine.objectContaining({ graph }),
			}),
		);
		workflows.getWorkflowGraph.and.returnValue(throwError(() => new Error('unavailable')));
		await service.show('wf-2');
		expect(show).toHaveBeenCalledTimes(1);
		expect(error).toHaveBeenCalledOnceWith("An error occurred while drawing the workflow's graph");
	});
});
