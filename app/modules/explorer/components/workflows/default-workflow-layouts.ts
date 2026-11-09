import { WorkflowLayout } from '@maretha/webui-sdk';
import { DefaultWorkflowLayoutComponent } from './default-workflow-layout.component';

export const DEFAULT_WORKFLOW_LAYOUTS: readonly WorkflowLayout[] = Object.freeze(
	['task38e', 'task542', 'task6d8', 'task2556', 'task328d', 'task2169'].map((taskKey) => ({
		id: `nuxeo.${taskKey}`,
		taskKey,
		component: DefaultWorkflowLayoutComponent,
		priority: -100,
	})),
);
