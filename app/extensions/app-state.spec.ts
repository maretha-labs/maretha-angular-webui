import { Component, input, Signal, signal, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { defineContribution } from './contribution';
import { WebUiAppState, withSharedSlotModel } from './app-state';
import { defineDocumentView, DocumentViewContext } from './document-view';
import { DocumentViewsComponent } from './document-views.component';
import { nuxeoFilter } from './nuxeo-filter';
import { provideWebUiExtensions } from './provide-webui-extensions';
import { DOCUMENT_ACTIONS_SLOT, DocumentActionContext } from './slots';
import type { ApplicationUser } from './user-menu';
import { WebUiSlotComponent } from './webui-slot.component';

const member: ApplicationUser = {
	id: 'jdoe',
	displayName: 'John Doe',
	isAdministrator: false,
	groups: ['members'],
};

@Component({
	standalone: true,
	changeDetection: ChangeDetectionStrategy.Eager,
	template: 'Members {{context().user?.id}}',
})
class MembersAction {
	readonly context = input.required<DocumentActionContext>();
}

@Component({
	standalone: true,
	changeDetection: ChangeDetectionStrategy.Eager,
	template: 'Members page {{context().user?.id}}',
})
class MembersPage {
	readonly context = input.required<DocumentViewContext>();
}

function appState(user: Signal<ApplicationUser | null>): WebUiAppState {
	return {
		user,
		locale: signal('en-US'),
		route: signal(''),
		query: signal({}),
		clipboard: signal([]),
		taskCount: signal(0),
		currentTask: signal(null),
		userWorkspace: signal(null),
		nuxeoUrl: '',
	};
}

describe('WebUiAppState', () => {
	it('is empty until the application provides it', () => {
		const state = TestBed.inject(WebUiAppState);
		expect(state.user()).toBeNull();
		expect(state.locale()).toBe('en-US');
		expect([state.route(), state.query(), state.clipboard(), state.taskCount()]).toEqual([
			'',
			{},
			[],
			0,
		]);
		expect([state.currentTask(), state.userWorkspace(), state.nuxeoUrl]).toEqual([null, null, '']);
	});
});

describe('withSharedSlotModel', () => {
	it('adds the user to plain contexts and keeps a host-supplied user', () => {
		const host = { id: 'host', displayName: 'Host', isAdministrator: true, groups: [] };
		expect(withSharedSlotModel({ noEdit: false }, member)).toEqual({ noEdit: false, user: member });
		expect(withSharedSlotModel({ user: host }, member)).toEqual({ user: host });
		expect(withSharedSlotModel({ user: null }, member)).toEqual({ user: null });
		expect(withSharedSlotModel({ noEdit: false }, null)).toEqual({ noEdit: false, user: null });
	});

	it('leaves missing and non-plain contexts unchanged', () => {
		class Model {
			readonly noEdit = false;
		}
		const model = new Model();
		expect(withSharedSlotModel(null, member)).toBeNull();
		expect(withSharedSlotModel(model, member)).toBe(model);
	});
});

describe('Shared slot user', () => {
	const user = signal<ApplicationUser | null>(member);
	beforeEach(() => {
		user.set(member);
		TestBed.configureTestingModule({
			providers: [
				{ provide: WebUiAppState, useValue: appState(user.asReadonly()) },
				provideWebUiExtensions({
					id: 'client',
					contributions: [
						defineContribution(DOCUMENT_ACTIONS_SLOT, {
							id: 'client.members',
							component: MembersAction,
							when: nuxeoFilter({ group: 'members' }),
						}),
						...defineDocumentView({
							id: 'client.members-view',
							viewId: 'members',
							label: 'Members',
							component: MembersPage,
							when: nuxeoFilter({ group: 'members' }),
						}),
					],
				}),
			],
		});
	});

	it('lets nuxeoFilter({ group }) match in a slot host that sets no user', async () => {
		const fixture = TestBed.createComponent(WebUiSlotComponent);
		fixture.componentRef.setInput('name', 'DOCUMENT_ACTIONS');
		fixture.componentRef.setInput('context', { document: { uid: 'doc' }, noEdit: false });
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Members jdoe');

		user.set({ ...member, groups: [] });
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).not.toContain('Members');
	});

	it('passes the user to paired document views and their pages', async () => {
		const fixture = TestBed.createComponent(DocumentViewsComponent);
		fixture.componentRef.setInput('context', { document: { uid: 'doc' }, noEdit: false });
		fixture.detectChanges();
		await fixture.whenStable();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Members page jdoe');
	});
});
