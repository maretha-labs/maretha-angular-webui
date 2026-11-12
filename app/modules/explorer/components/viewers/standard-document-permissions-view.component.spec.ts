import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WebUiLocale, WebUiMessages } from '@maretha/webui-sdk';
import {
	StandardDocumentPermissionsViewComponent,
	externalPermissionsFromBootstrap,
	standardPermissionAces,
} from './standard-document-permissions-view.component';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

describe('Standard document permissions', () => {
	const document = (uid = 'fixture') => ({
		uid,
		repository: 'default',
		type: 'Note',
		contextParameters: {
			permissions: ['WriteSecurity'],
			userVisiblePermissions: ['Read', 'ReadWrite'],
			acls: [],
		},
	});
	const read = (request: { url: string }) => request.url.endsWith('/repo/default/id/fixture');
	beforeEach(() =>
		TestBed.configureTestingModule({
			imports: [StandardDocumentPermissionsViewComponent],
			providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
		}).overrideComponent(StandardDocumentPermissionsViewComponent, { set: { template: '' } }),
	);
	afterEach(() => TestBed.inject(HttpTestingController).verify());
	async function setup() {
		const fixture = TestBed.createComponent(StandardDocumentPermissionsViewComponent);
		fixture.componentRef.setInput('context', { document: document(), noEdit: false });
		fixture.detectChanges();
		const http = TestBed.inject(HttpTestingController);
		http
			.expectOne((request) => request.url.endsWith('/ui/config.jsp'))
			.flush('Nuxeo.UI.config = {"permissions":{"externalUsers":"true"}};');
		http.expectOne(read).flush(document());
		await fixture.whenStable();
		return { fixture, http, component: fixture.componentInstance };
	}
	it('relocalizes the retained notification success message without sending another email', async () => {
		const { fixture, component, http } = await setup();
		const ace = {
			id: 'guest-ace',
			aclName: 'local',
			permission: 'Read',
			username: 'guest@example.com',
			externalUser: true,
			granted: true,
			status: 'effective',
		};
		const current = {
			...document(),
			contextParameters: {
				...document().contextParameters,
				acls: [{ name: 'local', aces: [ace] }],
			},
		};
		component.document.set(current);
		const sending = component.notifyExternal(ace);
		http.expectOne(read).flush(current);
		await Promise.resolve();
		const operation = http.expectOne((request) =>
			request.url.endsWith('/Document.SendNotificationEmailForPermission'),
		);
		expect(operation.request.body.params).toEqual({ id: 'guest-ace', acl: 'local' });
		operation.flush({});
		await Promise.resolve();
		http.expectOne(read).flush(current);
		await sending;
		expect(component.message()).toBe('Notification sent.');
		TestBed.inject(WebUiMessages).register('notification-locale', {
			fr: { 'documentPermissions.permissionNotificationSent': 'Notification envoyée.' },
		});
		TestBed.inject(WebUiLocale).setLocale('fr');
		fixture.detectChanges();
		expect(component.message()).toBe('Notification envoyée.');
		expect(component.document().contextParameters.acls[0].aces[0].username).toBe(
			'guest@example.com',
		);
		http.expectNone((request) => request.method === 'POST');
	});
	it('keeps permission loading failures translated and denies management until a retry succeeds', async () => {
		const { fixture, component, http } = await setup();
		component.reload();
		http.expectOne(read).flush({}, { status: 503, statusText: 'Offline' });
		await fixture.whenStable();
		expect(component.error()).toBe('Permissions could not be loaded.');
		TestBed.inject(WebUiMessages).register('test', {
			fr: {
				'app.state.permissions-could-not-be-loaded-de0c27': 'Permissions indisponibles.',
			},
		});
		TestBed.inject(WebUiLocale).setLocale('fr');
		expect(component.error()).toBe('Permissions indisponibles.');
		expect(component.canManage()).toBeFalse();
		component.reload();
		http.expectOne(read).flush(document());
		await fixture.whenStable();
		expect(component.error()).toBe('');
		expect(component.canManage()).toBeTrue();
	});
	it('includes non-inherited ACLs while excluding expired and denied ACEs', () => {
		expect(
			externalPermissionsFromBootstrap(
				'Nuxeo.UI.config = {"permissions":{"externalUsers":"true"}};',
			),
		).toBeTrue();
		expect(externalPermissionsFromBootstrap('not JSON')).toBeNull();
		const ace = {
			id: 'a',
			granted: true,
			status: 'effective',
			permission: 'Read',
			username: 'member',
		};
		const rows = standardPermissionAces({
			contextParameters: {
				acls: [
					{
						name: 'local',
						aces: [
							ace,
							{ ...ace, id: 'expired', status: 'archived' },
							{ ...ace, id: 'denied', granted: false },
						],
					},
					{ name: 'workflow', aces: [{ ...ace, id: 'workflow', status: 'pending' }] },
					{ name: 'inherited', aces: [{ ...ace, id: 'inherited' }] },
				],
			},
		});
		expect(rows.map((row) => [row.id, row.aclName])).toEqual([
			['a', 'local'],
			['workflow', 'workflow'],
			['inherited', 'inherited'],
		]);
	});
	it('sends the selected internal principals and a string permission without an external email', async () => {
		const { fixture, component, http } = await setup();
		component.edit(null, false);
		component.users = ['members'];
		component.permission = 'Read';
		component.notify = false;
		const save = component.save();
		http.expectOne(read).flush(document());
		await Promise.resolve();
		const operation = http.expectOne((request) => request.url.endsWith('/Document.AddPermission'));
		expect(operation.request.body.input).toBe('fixture');
		expect(operation.request.body.params.users).toEqual(['members']);
		expect(operation.request.body.params.permission).toBe('Read');
		expect(operation.request.body.params.email).toBeNull();
		expect(operation.request.body.params.notify).toBeFalse();
		expect(operation.request.headers.get('X-NXRepository')).toBe('default');
		operation.flush({});
		await Promise.resolve();
		http.expectOne(read).flush(document());
		await save;
		await fixture.whenStable();
		expect(component.editorOpen()).toBeFalse();
		expect(component.busy()).toBeFalse();
	});
	it('keeps the editor open with an error if fresh WriteSecurity has been revoked', async () => {
		const { component, http } = await setup();
		component.edit(null, false);
		component.users = ['members'];
		component.permission = 'Read';
		component.notify = false;
		const save = component.save();
		const fresh = document();
		fresh.contextParameters.permissions = [];
		http.expectOne(read).flush(fresh);
		await save;
		http.expectNone((request) => request.method === 'POST');
		expect(component.editorOpen()).toBeTrue();
		expect(component.editorError()).toContain('manage access');
		expect(component.busy()).toBeFalse();
	});
	it('offers the source inheritance operation on Root after a fresh permission check', async () => {
		const { component, http } = await setup();
		const root = { ...document(), type: 'Root' };
		component.document.set(root);
		const result = component.toggleInheritance();
		http.expectOne(read).flush(root);
		await Promise.resolve();
		const request = http.expectOne((req) =>
			req.url.endsWith('/Document.UnblockPermissionInheritance'),
		);
		expect(request.request.body.input).toBe('fixture');
		request.flush({});
		await Promise.resolve();
		http.expectOne(read).flush(root);
		await result;
		expect(component.busy()).toBeFalse();
	});
	it('edits local calendar dates and preserves the existing principal and ACL in replacement', async () => {
		const { component, http } = await setup();
		const begin = new Date(2031, 5, 7, 0, 0, 0, 0).toISOString();
		const end = new Date(2031, 5, 7, 23, 59, 59, 999).toISOString();
		const ace = {
			id: 'dated',
			granted: true,
			status: 'effective',
			permission: 'Read',
			username: { 'entity-type': 'group', id: 'group-record', groupname: 'members' },
			begin,
			end,
		};
		const current = {
			...document(),
			contextParameters: {
				...document().contextParameters,
				acls: [{ name: 'custom', aces: [ace] }],
			},
		};
		component.document.set(current);
		component.edit(standardPermissionAces(current)[0], false);
		expect(component.begin).toBe('2031-06-07');
		expect(component.end).toBe('2031-06-07');
		component.permission = 'ReadWrite';
		const save = component.save();
		http.expectOne(read).flush(current);
		await Promise.resolve();
		const operation = http.expectOne((request) =>
			request.url.endsWith('/Document.ReplacePermission'),
		);
		expect(operation.request.body.params).toEqual(
			jasmine.objectContaining({
				id: 'dated',
				acl: 'custom',
				username: 'members',
				permission: 'ReadWrite',
				begin,
				end,
			}),
		);
		operation.flush({});
		await Promise.resolve();
		http.expectOne(read).flush(current);
		await save;
		component.edit(standardPermissionAces(current)[0], false);
		component.setTimeFrame(true);
		component.setTimeFrame(false);
		expect(component.begin).toBe('');
		expect(component.end).toBe('');
	});
	it('requires a real external expiry date and resets the external editor after create-and-add', async () => {
		const { component, http } = await setup();
		component.edit(null, true);
		component.email = 'guest@example.com';
		await component.save();
		expect(component.editorError()).toContain('time frame');
		component.end = '2031-02-31';
		await component.save();
		http.expectNone((request) => request.method === 'POST' || request.url.endsWith('/id/fixture'));
		component.end = '2031-06-07';
		const save = component.save(true);
		http.expectOne(read).flush(document());
		await Promise.resolve();
		const operation = http.expectOne((request) => request.url.endsWith('/Document.AddPermission'));
		expect(operation.request.body.params).toEqual(
			jasmine.objectContaining({
				email: 'guest@example.com',
				username: null,
				begin: null,
				end: new Date(2031, 5, 7, 23, 59, 59, 999).toISOString(),
				notify: true,
			}),
		);
		operation.flush({});
		await Promise.resolve();
		http.expectOne(read).flush(document());
		await save;
		expect(component.editorOpen()).toBeTrue();
		expect(component.external).toBeTrue();
		expect(component.email).toBe('');
		expect(component.end).toBe('');
		expect(component.permanent).toBeFalse();
	});
	it('does not post an old document permission after a repository switch before the scope effect runs', async () => {
		const { fixture, component, http } = await setup();
		component.edit(null, false);
		component.users = ['members'];
		const save = component.save();
		const fresh = http.expectOne(read);
		const next = { ...document(), repository: 'other' };
		fixture.componentRef.setInput('context', { document: next, noEdit: false });
		fresh.flush(document());
		await save;
		http.expectNone((request) => request.method === 'POST');
		fixture.detectChanges();
		http.expectOne((request) => request.url.endsWith('/repo/other/id/fixture')).flush(next);
		await fixture.whenStable();
		expect(component.document().repository).toBe('other');
		expect(component.editorOpen()).toBeFalse();
		expect(component.busy()).toBeFalse();
	});
	it('deletes a local permission only after the in-app confirmation', async () => {
		const { component, http } = await setup();
		const current = {
			...document(),
			contextParameters: {
				...document().contextParameters,
				acls: [
					{
						name: 'local',
						aces: [
							{
								id: 'local-ace',
								username: 'bob',
								permission: 'Read',
								granted: true,
								status: 'effective',
							},
						],
					},
				],
			},
		};
		component.document.set(current);
		const ace = standardPermissionAces(current)[0];
		const confirm = spyOn(TestBed.inject(ConfirmDialogService), 'confirm').and.resolveTo(false);
		await component.remove(ace);
		expect(confirm).toHaveBeenCalledWith(
			jasmine.objectContaining({
				messageKey: 'app.notices.delete-the-value-permission-for-value-ca37da',
				destructive: true,
			}),
		);
		http.expectNone((request) => request.method === 'POST');
		confirm.and.resolveTo(true);
		const pending = component.remove(ace);
		await Promise.resolve();
		http.match(read).forEach((request) => request.flush(current));
		await Promise.resolve();
		const operation = http.expectOne((request) =>
			request.url.endsWith('/Document.RemovePermission'),
		);
		expect(operation.request.body.params).toEqual(
			jasmine.objectContaining({ id: 'local-ace', acl: 'local' }),
		);
		operation.flush({});
		await Promise.resolve();
		http.match(read).forEach((request) => request.flush(document()));
		await pending;
	});
	it('uses current inherited ACEs and does not repeat an inheritance change already completed elsewhere', async () => {
		const { component, http } = await setup();
		component.document.set({
			...document(),
			contextParameters: {
				...document().contextParameters,
				acls: [
					{
						name: 'inherited',
						aces: [
							{
								id: 'inherited',
								username: 'members',
								permission: 'Read',
								granted: true,
								status: 'effective',
							},
						],
					},
				],
			},
		});
		expect(component.inheritanceBlocked()).toBeFalse();
		const block = component.toggleInheritance();
		http.expectOne(read).flush(document());
		await block;
		http.expectNone((request) => request.method === 'POST');
		expect(component.inheritanceBlocked()).toBeTrue();
		const unblock = component.toggleInheritance();
		http.expectOne(read).flush(document());
		await Promise.resolve();
		const operation = http.expectOne((request) =>
			request.url.endsWith('/Document.UnblockPermissionInheritance'),
		);
		expect(operation.request.body.input).toBe('fixture');
		operation.flush({});
		await Promise.resolve();
		http.expectOne(read).flush(document());
		await unblock;
		expect(component.busy()).toBeFalse();
	});
	it('orders timed permissions after permanent ones and tolerates a malformed bootstrap config', () => {
		expect(externalPermissionsFromBootstrap('Nuxeo.UI.config = {not json};')).toBeNull();
		expect(externalPermissionsFromBootstrap('Nuxeo.UI.config = {"permissions":{}};')).toBeFalse();
		const ace = { granted: true, status: 'effective', permission: 'Read', username: 'member' };
		const rows = standardPermissionAces({
			contextParameters: {
				acls: [
					{
						name: 'local',
						aces: [
							{ ...ace, id: 'later', begin: '2031-01-01T00:00:00Z' },
							{ ...ace, id: 'forever' },
							{ ...ace, id: 'soon', begin: '2030-01-01T00:00:00Z' },
							{ ...ace, id: 'always' },
						],
					},
				],
			},
		});
		expect(rows.map((row) => row.id)).toEqual(['forever', 'always', 'soon', 'later']);
	});
	it('groups local, inherited and external permissions into the stock sections', async () => {
		const { fixture, component } = await setup();
		const ace = { granted: true, status: 'effective', permission: 'Read', username: 'bob' };
		component.document.set({
			...document(),
			contextParameters: {
				...document().contextParameters,
				acls: [
					{
						name: 'local',
						aces: [
							{ ...ace, id: 'local' },
							{ ...ace, id: 'external', username: 'guest@example.test', externalUser: true },
						],
					},
					{ name: 'inherited', aces: [{ ...ace, id: 'inherited' }] },
				],
			},
		});
		expect(component.showExternal()).toBeTrue();
		const sections = component.sections();
		expect(sections.map((section) => [section.id, section.rows.map((row) => row.id)])).toEqual([
			['local', ['local']],
			['inherited', ['inherited']],
			['external', ['external']],
		]);
		expect(sections[0].title).toBe('Permissions defined locally');
		expect(sections[1].empty).toBe('No permissions are inherited.');
		expect(sections[2].title).toBe('Permissions Assigned to External Users');
		fixture.componentRef.setInput('externalUsersEnabled', false);
		expect(component.showExternal()).toBeFalse();
		expect(component.sections().map((section) => section.id)).toEqual(['local', 'inherited']);
		expect(component.sections()[0].empty).toBe('There are no local permissions.');
	});
	it('prefers the bootstrapped window flag over the fetched one and survives a config fetch failure', async () => {
		(window as any).Nuxeo = { UI: { config: { permissions: { externalUsers: 'false' } } } };
		try {
			const fixture = TestBed.createComponent(StandardDocumentPermissionsViewComponent);
			fixture.componentRef.setInput('context', { document: document(), noEdit: false });
			fixture.detectChanges();
			const http = TestBed.inject(HttpTestingController);
			http
				.expectOne((request) => request.url.endsWith('/ui/config.jsp'))
				.flush('Nuxeo.UI.config = {"permissions":{"externalUsers":"true"}};');
			http.expectOne(read).flush(document());
			await fixture.whenStable();
			expect(fixture.componentInstance.showExternal()).toBeFalse();
			fixture.componentInstance.edit(null, true);
			expect(fixture.componentInstance.editorOpen()).toBeFalse();
		} finally {
			delete (window as any).Nuxeo;
		}
		TestBed.resetTestingModule();
		TestBed.configureTestingModule({
			imports: [StandardDocumentPermissionsViewComponent],
			providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
		}).overrideComponent(StandardDocumentPermissionsViewComponent, { set: { template: '' } });
		const fixture = TestBed.createComponent(StandardDocumentPermissionsViewComponent);
		fixture.componentRef.setInput('context', { document: document(), noEdit: false });
		fixture.detectChanges();
		const http = TestBed.inject(HttpTestingController);
		http
			.expectOne((request) => request.url.endsWith('/ui/config.jsp'))
			.flush('', { status: 404, statusText: 'Not Found' });
		http.expectOne(read).flush(document());
		await fixture.whenStable();
		expect(fixture.componentInstance.showExternal()).toBeFalse();
		expect(fixture.componentInstance.canManage()).toBeTrue();
	});
	it('formats principals, permissions and time frames as the stock ACL table does', async () => {
		const { component } = await setup();
		expect(component.principalId({ 'entity-type': 'group', groupname: 'members' })).toBe('members');
		expect(component.principalId({ 'entity-type': 'group', id: 'g1' })).toBe('g1');
		expect(component.principalId('bob')).toBe('bob');
		expect(component.principalId({ id: 'alice' })).toBe('alice');
		expect(component.principalId(null)).toBe('');
		expect(component.principalLabel({ grouplabel: 'Members' })).toBe('Members');
		expect(component.principalLabel({ properties: { firstName: ' Ann ', lastName: 'Lee' } })).toBe(
			'Ann Lee',
		);
		expect(component.principalLabel({ properties: { lastName: 'Lee' } })).toBe('Lee');
		expect(component.principalLabel({ properties: { username: 'ann' } })).toBe('ann');
		expect(component.principalLabel('raw')).toBe('raw');
		expect(component.permissionLabel('')).toBe('');
		expect(component.permissionLabel('ReadWrite')).toBe('Edit');
		expect(component.permissionLabel('Everything')).toBe('Manage everything');
		expect(component.permissionLabel('Browse')).toBe('Browse');
		const past = new Date(2020, 0, 5).toISOString();
		const future = new Date(2099, 11, 25).toISOString();
		expect(component.timeFrame({})).toBe('Permanent');
		expect(component.timeFrame({ begin: past })).toBe('Since 5 Jan 2020');
		expect(component.timeFrame({ begin: future })).toBe('From 25 Dec 2099');
		expect(component.timeFrame({ end: future })).toBe('Until 25 Dec 2099');
		expect(component.timeFrame({ begin: past, end: future })).toBe(
			'Since 5 Jan 2020 until 25 Dec 2099',
		);
		expect(component.timeFrame({ begin: 'garbage' })).toBe('From garbage');
	});
	it('guards the editor against inherited rows, busy state and invalid input', async () => {
		const { component, http } = await setup();
		const local = {
			id: 'local',
			aclName: 'local',
			permission: 'Read',
			username: 'members',
			granted: true,
			status: 'effective',
		};
		component.edit({ ...local, aclName: 'inherited' }, false);
		expect(component.editorOpen()).toBeFalse();
		component.edit(null, true);
		expect(component.editorOpen()).toBeTrue();
		expect(component.permanent).toBeFalse();
		component.setTimeFrame(true);
		expect(component.permanent).toBeFalse();
		component.closeEditor();
		expect(component.editorOpen()).toBeFalse();
		const end = new Date(2031, 1, 3).toISOString();
		component.edit({ ...local, begin: 'not-a-date', end, notify: true, comment: 'why' }, false);
		expect(component.begin).toBe('');
		expect(component.end).toBe('2031-02-03');
		expect(component.permanent).toBeFalse();
		expect(component.comment).toBe('why');
		component.setTimeFrame(true);
		expect([component.permanent, component.begin, component.end]).toEqual([true, '', '']);
		const confirm = spyOn(window, 'confirm').and.returnValue(false);
		component.closeEditor();
		expect(component.editorOpen()).toBeTrue();
		expect(component.canDeactivate()).toBeFalse();
		confirm.and.returnValue(true);
		expect(component.canDeactivate()).toBeTrue();
		component.closeEditor();
		expect(component.editorOpen()).toBeFalse();
		expect(confirm).toHaveBeenCalledTimes(4);
		component.edit(null, false);
		expect(component.permission).toBe('Read');
		component.users = ['', '  '];
		await component.save();
		expect(component.editorError()).toContain('Select a user or group');
		component.users = ['bob'];
		component.permission = 'Nope';
		await component.save();
		expect(component.editorError()).toContain('Select a permission');
		component.permission = 'Read';
		component.setTimeFrame(false);
		component.begin = '2031-13-45';
		await component.save();
		expect(component.editorError()).toContain('valid permission time frame');
		component.begin = '2031-02-03';
		component.end = '2031-02-01';
		await component.save();
		expect(component.editorError()).toContain('valid permission time frame');
		http.expectNone((request) => request.method === 'POST');
		expect(component.editorOpen()).toBeTrue();
		component.busy.set(true);
		component.closeEditor();
		component.setTimeFrame(true);
		expect(component.editorOpen()).toBeTrue();
		expect(component.permanent).toBeFalse();
		await component.remove(local);
		await component.toggleInheritance();
		await component.notifyExternal({ ...local, externalUser: true });
		await component.save();
		component.busy.set(false);
		await component.notifyExternal(local);
		http.expectNone(read);
	});
	it('refuses a mutation for a document other than the loaded one and clears without a document', async () => {
		const { fixture, component, http } = await setup();
		component.document.set(document('someone-else'));
		await component.toggleInheritance();
		http.expectNone(read);
		expect(component.busy()).toBeFalse();
		fixture.componentRef.setInput('context', {
			document: { repository: 'default' },
			noEdit: false,
		});
		fixture.detectChanges();
		await fixture.whenStable();
		expect(component.document()).toBeNull();
		expect(component.loading()).toBeFalse();
		expect(component.canManage()).toBeFalse();
		http.expectNone((request) => request.method === 'GET');
	});
});
