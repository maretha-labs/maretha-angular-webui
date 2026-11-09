import { canRunDocumentCommand, DocumentCommand } from './document-command-policy';

/**
 * Stock `nuxeo-*-button._isAvailable` parity per document state and role, as observed on
 * the stock Web UI.
 */
describe('Document command policy', () => {
	const file = (
		overrides: Record<string, unknown> = {},
		permissions = ['Read', 'Write', 'WriteProperties', 'WriteVersion', 'Remove'],
	) => ({
		uid: 'doc',
		type: 'File',
		path: '/default-domain/workspaces/audit/file',
		facets: ['Versionable', 'Publishable', 'Commentable'],
		properties: { 'file:content': { data: 'https://demo/nuxeo/nxfile/default/doc' } },
		ng: { exportUrlForPdf: 'pdf', exportUrlForXml: 'xml', exportUrlForZip: 'zip' },
		contextParameters: { permissions },
		...overrides,
	});
	const commands = (document: unknown, noEdit = false): DocumentCommand[] =>
		(
			[
				'edit',
				'clipboard',
				'pdf',
				'trash',
				'restore',
				'purge',
				'collect',
				'favorite',
				'notifications',
				'lock',
				'download',
				'publish',
			] as DocumentCommand[]
		).filter((command) => canRunDocumentCommand({ document: document as any, noEdit }, command));

	it('offers the full stock set to a ReadWrite member on a live document', () => {
		expect(commands(file())).toEqual([
			'edit',
			'clipboard',
			'pdf',
			'trash',
			'collect',
			'favorite',
			'notifications',
			'lock',
			'download',
			'publish',
		]);
	});
	it('hides write actions for a reader but keeps navigation, sharing and notifications', () => {
		expect(commands(file({}, ['Read']))).toEqual([
			'clipboard',
			'pdf',
			'collect',
			'favorite',
			'notifications',
			'download',
		]);
	});
	it('shows Unlock to a reader while another user holds the lock (NXP-27822); the server decides', () => {
		expect(commands(file({ lockOwner: 'gpt' }, ['Read']))).toContain('lock');
		expect(commands(file({ lockOwner: 'gpt' }))).toContain('lock');
	});
	it('lets a proxy be deleted, subscribed to and copied, but not edited, published or locked', () => {
		const proxy = file({ isProxy: true, facets: ['Immutable', 'Publishable'] });
		expect(commands(proxy)).toEqual([
			'clipboard',
			'pdf',
			'trash',
			'favorite',
			'notifications',
			'download',
		]);
	});
	it('keeps only Untrash and Delete permanently on a trashed document', () => {
		expect(commands(file({ isTrashed: true }))).toEqual(['restore', 'purge']);
		expect(commands(file({ isTrashed: true }, ['Read']))).toEqual([]);
	});
	it('hides clipboard, trash, edit, lock and notifications on a version but keeps export and download', () => {
		const version = file({ isVersion: true, facets: ['Immutable', 'Publishable'] });
		expect(commands(version)).toEqual(['pdf', 'download', 'publish']);
	});
	it('never grants a write affordance in a no-edit surface and never on the repository root', () => {
		expect(commands(file(), true)).toEqual(['clipboard', 'pdf', 'download']);
		expect(commands(file({ path: '/', type: 'Root' }))).not.toContain('edit');
		expect(commands(file({ path: '/', type: 'Root' }))).not.toContain('trash');
	});
	it('treats Everything as every permission', () => {
		expect(commands(file({}, ['Everything']))).toContain('edit');
		expect(commands(file({}, ['Everything']))).toContain('trash');
	});
	it('excludes the version from clipboard in the standard header too', () => {
		const version = file({ isVersion: true, facets: ['Immutable', 'Publishable'] });
		expect(
			canRunDocumentCommand(
				{ document: version as any, noEdit: false, standardHeaderActions: true },
				'clipboard',
			),
		).toBeFalse();
		expect(
			canRunDocumentCommand(
				{ document: file() as any, noEdit: false, standardHeaderActions: true },
				'clipboard',
			),
		).toBeTrue();
	});
});
