import {
	defineContribution,
	provideWebUiExtensions,
	TRASH_RESULTS_SELECTION_ACTIONS_SLOT,
} from '@maretha/webui-sdk';
import { canChangeTrash, TrashSelectionActionComponent } from './trash-selection-action.component';
export function provideDefaultTrashActions() {
	return provideWebUiExtensions({
		id: 'maretha.core.trash-actions',
		contributions: (['restore', 'purge'] as const).map((action, index) =>
			defineContribution(TRASH_RESULTS_SELECTION_ACTIONS_SLOT, {
				id: `maretha.trash.${action}`,
				order: (index + 1) * 10,
				component: TrashSelectionActionComponent,
				inputs: { action },
				when: (context) => canChangeTrash(context, action),
			}),
		),
	});
}
