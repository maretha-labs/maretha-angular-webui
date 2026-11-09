import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	Injector,
	input,
} from '@angular/core';
import { Router } from '@angular/router';
import {
	WebUiDatePipe,
	WebUiIconComponent,
	WebUiAppState,
	WebUiMessagePipe,
	WebUiMessages,
} from '@maretha/webui-sdk';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { firstValueFrom } from 'rxjs';
import { taskUrl } from 'app/helpers/task-route';
import { WorkflowsService } from 'app/helpers/workflows.service';
import { UserTagComponent } from 'app/modules/shared/components/user-tag/user-tag.component';
import { WorkflowGraphDialogService } from '../workflow-graph-dialog/workflow-graph-dialog.service';

/** Never resolvable through /user (stock WEBUI-2309): shown as the raw name. */
const INTERNAL_PRINCIPALS = new Set(['system']);

/**
 * Stock nuxeo-document-info-bar workflow and task bars: one bar per running workflow and one per
 * pending task of the current user, at the top of the document's View tab.
 */
@Component({
	selector: 'nx-workflow-info',
	templateUrl: './workflow-info.component.html',
	styleUrls: ['./workflow-info.component.scss'],
	imports: [
		WebUiIconComponent,
		WebUiMessagePipe,
		WebUiDatePipe,
		TooltipDirective,
		UserTagComponent,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowInfoComponent {
	readonly document = input.required<any>();
	readonly workflows = computed<any[]>(
		() => this.document()?.contextParameters?.runningWorkflows ?? [],
	);
	readonly tasks = computed<any[]>(() => this.document()?.contextParameters?.pendingTasks ?? []);
	private readonly router = inject(Router);
	private readonly messages = inject(WebUiMessages);
	private readonly injector = inject(Injector);
	private readonly user = inject(WebUiAppState).user;

	label(value: unknown): string {
		const text = typeof value === 'string' ? value : '';
		return text ? this.messages.text(text, text) : '';
	}

	isCurrentUser(userId: unknown): boolean {
		return !!userId && this.user()?.id === userId;
	}

	lookup(userId: unknown): boolean {
		return typeof userId === 'string' && !INTERNAL_PRINCIPALS.has(userId);
	}

	canAbandon(workflow: any): boolean {
		return this.isCurrentUser(workflow?.initiator) || this.user()?.isAdministrator === true;
	}

	viewGraph(workflow: any): void {
		if (workflow?.id) void this.injector.get(WorkflowGraphDialogService).show(workflow.id);
	}

	async abandon(workflow: any): Promise<void> {
		const question = this.messages.text(
			'documentPage.abandon.workflow.confirm',
			'Abandon the process?',
		);
		if (!workflow?.id || !window.confirm(question)) return;
		try {
			const workflows = this.injector.get(WorkflowsService);
			await firstValueFrom(workflows.abandonWorkflow(this.document(), workflow.id));
		} catch {
			// Stock leaves the bar in place when the request fails.
		}
	}

	process(task: any): void {
		if (task?.id) void this.router.navigateByUrl(taskUrl(task.id));
	}
}
