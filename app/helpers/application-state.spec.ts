import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { WebUiAppState } from '@maretha/webui-sdk';
import { DocumentClipboardService } from 'app/modules/explorer/helpers/document-clipboard.service';
import { environment } from 'environments/environment';
import { provideApplicationState } from './application-state';
import { AuthService } from './auth.service';
import { PersonalWorkspaceService } from './personal-workspace.service';
import { WorkflowInboxService } from './workflow-inbox.service';

@Component({ template: '' })
class Blank {}

describe('provideApplicationState', () => {
	it('backs WebUiAppState with the shell services', async () => {
		const clipboard = signal<any[]>([{ uid: 'doc' }]);
		const workspace = signal<{ path: string } | null>({ path: '/users/alice' });
		TestBed.configureTestingModule({
			providers: [
				provideRouter([{ path: '**', component: Blank }]),
				provideApplicationState(),
				{
					provide: AuthService,
					useValue: {
						userInfo: signal({
							id: 'alice',
							firstName: 'Alice',
							lastName: 'Liddell',
							isAdministrator: false,
							groups: [{ id: 'members' }],
						}),
					},
				},
				{ provide: DocumentClipboardService, useValue: { documentClipboard: clipboard } },
				{
					provide: WorkflowInboxService,
					useValue: { count: signal(3), current: signal({ id: 'task', name: 'review' }) },
				},
				{ provide: PersonalWorkspaceService, useValue: { workspace } },
			],
		});
		const state = TestBed.inject(WebUiAppState);
		expect(state.user()).toEqual({
			id: 'alice',
			displayName: 'Alice Liddell',
			isAdministrator: false,
			groups: ['members'],
		});
		expect(state.locale()).toBe('en-US');
		expect(state.clipboard()).toBe(clipboard());
		expect([state.taskCount(), state.currentTask()?.id, state.userWorkspace()]).toEqual([
			3,
			'task',
			'/users/alice',
		]);
		expect(state.nuxeoUrl).toBe(environment.nuxeoUrl.replace(/\/+$/, ''));
		expect(state.nuxeoUrl.endsWith('/')).toBeFalse();

		await TestBed.inject(Router).navigateByUrl('/settings?admin=users&id=a&id=b');
		expect(state.route()).toBe('/settings?admin=users&id=a&id=b');
		expect(state.query()).toEqual({ admin: 'users', id: 'a' });
		workspace.set(null);
		expect(state.userWorkspace()).toBeNull();
	});
});
