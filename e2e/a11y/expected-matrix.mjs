// Reviewed coverage contract. Additions must name an actual component state and
// a browser test; do not derive this list from the report being validated.
const componentScenarios = [
	['shell and actual user-menu keyboard focus', ['shell', 'user-menu']],
	[
		'rail labels support hover, keyboard dismissal and unclipped directional placement',
		['rail-tooltip-over-drawer'],
	],
	[
		'quick search traps focus, supports result arrows, navigates and restores focus on Escape',
		['quick-search-results'],
	],
	[
		'real confirmation modal preserves keyboard containment and returns focus',
		['confirmation-dialog'],
	],
	[
		'signed-out unauthorized boundary (Nuxeo login requires separate live suite)',
		['signed-out-boundary'],
	],
	['actions menu', ['actions-menu']],
	['tooltip', ['tooltip']],
	['content editors', ['content-editors']],
	['file upload', ['file-upload']],
];

const files = {
	'save.e2e.ts': [
		[
			'upload and save announcements preserve focus and retry draft',
			[
				'editor-uploading',
				'editor-upload-error',
				'editor-saving',
				'editor-save-error',
				'editor-saved',
			],
		],
		['success announcement survives immediate editor closure', ['editor-closed-success']],
	],
	'runtime-tree.e2e.ts': [['runtime document tree keyboard navigation', ['runtime-document-tree']]],
	'components.e2e.ts': componentScenarios,
	'navigation.e2e.ts': [
		['document tabs preserve drafts and recover focus', ['document-tabs']],
		['SDK tree navigates expands selects and recovers focus', ['sdk-tree']],
	],
	'preferences.e2e.ts': [
		['editor contrast and keyboard focus', ['editor-contrast-focus']],
		['text spacing and narrow enlarged layout', ['editor-spacing-reflow-enlargement']],
		['forced colors preserves close glyph focus and draft', ['editor-forced-colors']],
	],
};

export const expectedTests = ['en-US', 'ar'].flatMap((locale) =>
	['default', 'dark'].flatMap((theme) =>
		Object.entries(files).flatMap(([file, scenarios]) =>
			scenarios.map(([title, surfaces]) => ({
				file,
				group: `${locale} ${theme}`,
				title,
				locale,
				theme,
				surfaces,
			})),
		),
	),
);
