import { InjectionToken, Provider, Type } from '@angular/core';

export type WorkflowLayoutMode = 'process' | 'reassign' | 'delegate' | 'abandon';

export interface WorkflowTask {
	readonly id: string;
	readonly name: string;
	readonly variables?: Readonly<Record<string, unknown>>;
	readonly taskInfo?: {
		readonly taskActions?: readonly WorkflowTaskAction[];
		readonly allowTaskReassignment?: boolean;
		readonly layoutResource?: { readonly name?: string };
	};
}
export interface WorkflowTaskAction {
	readonly name: string;
	readonly label?: string;
	readonly validate?: boolean;
}
export interface WorkflowLayoutContext {
	readonly document: Readonly<Record<string, unknown>>;
	readonly task: WorkflowTask;
	readonly taskKey: string;
	readonly variables: Readonly<Record<string, unknown>>;
	readonly mode: WorkflowLayoutMode;
	readonly readOnly: boolean;
	readonly noEdit: boolean;
	readonly busy: boolean;
	readonly errors: Readonly<Record<string, string>>;
	readonly commit: (variables: Readonly<Record<string, unknown>>) => void;
}
export interface WorkflowLayout {
	readonly id: string;
	readonly taskKey: string;
	readonly component: Type<unknown>;
	readonly priority?: number;
}
export const WORKFLOW_LAYOUTS = new InjectionToken<readonly WorkflowLayout[]>('Workflow layouts');
export function provideWorkflowLayout(layout: WorkflowLayout): Provider {
	return { provide: WORKFLOW_LAYOUTS, multi: true, useValue: layout };
}
