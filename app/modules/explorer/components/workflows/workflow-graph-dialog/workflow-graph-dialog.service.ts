import { inject, Injectable } from '@angular/core';
import { WebUiMessages } from '@maretha/webui-sdk';
import { BsModalService } from 'ngx-bootstrap/modal';
import { ToastService } from 'app/helpers/toast.service';
import { firstValueFrom } from 'rxjs';
import { WorkflowsService } from 'app/helpers/workflows.service';
import {
	WorkflowGraphDialogComponent,
	workflowGraphDialogOptions,
} from './workflow-graph-dialog.component';

/** Stock nuxeo-workflow-graph show(): fetch the graph, then open it; notify when that fails. */
@Injectable({ providedIn: 'root' })
export class WorkflowGraphDialogService {
	private readonly workflows = inject(WorkflowsService);
	private readonly modal = inject(BsModalService);
	private readonly toastr = inject(ToastService);
	private readonly messages = inject(WebUiMessages);

	async show(workflowInstanceId: string): Promise<void> {
		if (!workflowInstanceId) return;
		try {
			const graph = await firstValueFrom(this.workflows.getWorkflowGraph(workflowInstanceId));
			const options = workflowGraphDialogOptions(graph ?? {});
			this.modal.show(WorkflowGraphDialogComponent, options);
		} catch {
			this.toastr.error(
				this.messages.text(
					'documentPage.route.view.graph.error',
					"An error occurred while drawing the workflow's graph",
				),
			);
		}
	}
}
