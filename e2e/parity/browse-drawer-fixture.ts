import { makeEnvironmentProviders } from '@angular/core';
import { delay, of, throwError } from 'rxjs';
import { DocumentBrowserService } from 'app/modules/explorer/helpers/document-browser.service';

// Synthetic local identities only. These must never be sent to a hosted Nuxeo API.
const folder = (uid: string, title: string, path: string, folderish = true) => ({
	uid,
	title,
	path,
	repository: 'default',
	facets: folderish ? ['Folderish'] : [],
});
const root = folder('browse-root', 'Root', '/');
const interactionResults = folder(
	'browse-interaction-results',
	'InteractionResults',
	'/interaction-results',
	false,
);
const domain = folder('browse-domain', 'Domain', '/domain');
const workflows = folder('browse-workflows', 'Workflows', '/workflows');
const workspaces = folder('browse-workspaces', 'Workspaces', '/domain/workspaces');
const workspace = folder('browse-workspace', 'Demo workspace', '/domain/workspaces/demo');
const nested = folder('browse-nested', 'Nested folder', '/domain/workspaces/demo/nested');
const longNested = folder(
	'browse-long-nested',
	'Long nested folder name that must wrap safely without covering its independent expand action',
	'/domain/workspaces/demo/nested/long',
);
const children: Readonly<Record<string, readonly ReturnType<typeof folder>[]>> = {
	'browse-root': [interactionResults, domain, workflows],
	'browse-domain': [workspaces],
	'browse-workspaces': [workspace],
	'browse-workspace': [nested],
	'browse-nested': [longNested],
	'browse-long-nested': [],
	'browse-workflows': [],
};

/** Only the browse-drawer fixture surface installs this root-level read-only provider. */
export function provideBrowseDrawerFixture() {
	return makeEnvironmentProviders([
		{
			provide: DocumentBrowserService,
			useValue: {
				getTreeNode: (path: string, repository: string) =>
					path === '/' && repository === 'default'
						? of(root).pipe(delay(20))
						: throwError(() => new Error('Unexpected local Browse fixture root.')),
				getTreeChildren: (uid: string, page: number, repository: string) =>
					repository === 'default' && page === 0 && Object.hasOwn(children, uid)
						? of({ entries: children[uid], isNextPageAvailable: false }).pipe(delay(20))
						: throwError(() => new Error('Unexpected local Browse fixture page.')),
			},
		},
	]);
}
