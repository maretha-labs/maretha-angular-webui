import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { BsModalRef } from 'ngx-bootstrap/modal';

import { UserAndGroupEditorComponent } from './user-and-group-editor.component';
import { AuthService } from 'app/helpers/auth.service';
import { ToastService } from 'app/helpers/toast.service';

describe('UserAndGroupEditorComponent', () => {
	let component: UserAndGroupEditorComponent;
	let fixture: ComponentFixture<UserAndGroupEditorComponent>;
	let http: HttpTestingController;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				{
					provide: AuthService,
					useValue: {
						userInfo: jasmine
							.createSpy()
							.and.returnValue({ id: 'Administrator', isAdministrator: true }),
					},
				},
			],
			imports: [UserAndGroupEditorComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(UserAndGroupEditorComponent);
		component = fixture.componentInstance;
		http = TestBed.inject(HttpTestingController);
		fixture.detectChanges();
	});

	afterEach(() => http.verify());

	it('should create', () => {
		expect(component).toBeTruthy();
	});
	it('defaults to User.Invite with the source user entity and never sends a hidden password', () => {
		expect(component.invitationMode).toBeTrue();
		component.editorForm!.patchValue({
			id: 'invited-user',
			email: 'invited@example.com',
			firstName: 'Invited',
			groups: ['members'],
			password: { changePassword: false, newPassword: 'not-sent' },
		});
		let saved: any;
		component.save$.subscribe((value) => (saved = value));
		const success = spyOn(TestBed.inject(ToastService), 'success');
		component.saveChanges();
		const request = http.expectOne((value) => value.url.endsWith('/automation/User.Invite'));
		expect(request.request.method).toBe('POST');
		expect(request.request.body).toEqual({
			input: {
				'entity-type': 'user',
				id: '',
				properties: {
					username: 'invited-user',
					email: 'invited@example.com',
					firstName: 'Invited',
					lastName: null,
					company: null,
					groups: ['members'],
				},
			},
			params: {},
			context: {},
		});
		http.expectNone((value) => value.url.endsWith('/user'));
		request.flush(null);
		expect(saved).toEqual(
			jasmine.objectContaining({
				id: 'invited-user',
				firstName: 'Invited',
				email: 'invited@example.com',
				invited: true,
			}),
		);
		expect(success).toHaveBeenCalledWith('Invitation queued for invited@example.com.', undefined, {
			enableHtml: false,
		});
	});
	it('creates the selected memberships and password in one request, blocking invalid and duplicate saves', () => {
		const hide = spyOn(TestBed.inject(BsModalRef), 'hide');
		component.editorForm!.patchValue({ email: 'new@example.com' });
		component.saveChanges();
		http.expectNone((request) => request.method === 'POST');
		component.editorForm!.patchValue({
			id: 'new-user',
			groups: ['members'],
			password: {
				changePassword: true,
				newPassword: 'fixture-password',
				newPasswordConfirmation: 'fixture-password',
			},
		});
		let saved: any;
		component.save$.subscribe((value) => (saved = value));
		component.saveChanges();
		component.saveChanges();
		component.close();
		expect(hide).not.toHaveBeenCalled();
		const request = http.expectOne(
			(value) => value.url.endsWith('/user') && value.method === 'POST',
		);
		expect(request.request.body.properties.groups).toEqual(['members']);
		expect(request.request.body.properties.password).toBe('fixture-password');
		request.flush({
			id: 'new-user',
			properties: { username: 'new-user', email: 'new@example.com', groups: ['members'] },
		});
		expect(saved.groups.map((group: any) => group.id)).toEqual(['members']);
		expect(component.saving).toBeFalse();
		expect(hide).toHaveBeenCalledTimes(1);
		component.saveChanges();
		http.expectNone((value) => value.method === 'POST');
	});
	it('retains the draft and exposes a failed save for retry', () => {
		component.editorForm!.patchValue({ id: 'new-user', email: 'new@example.com' });
		component.saveChanges();
		http
			.expectOne((value) => value.url.endsWith('/automation/User.Invite'))
			.flush({}, { status: 409, statusText: 'Conflict' });
		expect(component.saving).toBeFalse();
		expect(component.editorForm!.get('id')!.value).toBe('new-user');
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain(
			'Unable to send the invitation',
		);
		component.saveChanges();
		expect(component.error).toBe('');
		http
			.expectOne((value) => value.url.endsWith('/automation/User.Invite'))
			.flush({ id: 'new-user', properties: { email: 'new@example.com' } });
	});
	it('creates another user, resets passwords and memberships, then returns to invitation mode', () => {
		const hide = spyOn(TestBed.inject(BsModalRef), 'hide');
		const saved: any[] = [];
		component.save$.subscribe((value) => saved.push(value));
		component.editorForm!.patchValue({
			id: 'created-user',
			email: 'created@example.com',
			groups: ['members'],
			password: { changePassword: true, newPassword: 'one', newPasswordConfirmation: 'different' },
		});
		component.saveChanges(true);
		http.expectNone((request) => request.method === 'POST');
		component.editorForm!.get(['password', 'newPasswordConfirmation'])!.setValue('one');
		component.saveChanges(true);
		http
			.expectOne((request) => request.url.endsWith('/user') && request.method === 'POST')
			.flush({
				id: 'created-user',
				properties: { email: 'created@example.com', groups: ['members'] },
			});
		expect(hide).not.toHaveBeenCalled();
		expect(component.editorForm!.pristine).toBeTrue();
		expect(component.editorForm!.get('id')!.value).toBeFalsy();
		expect(component.editorForm!.get('groups')!.value).toEqual([]);
		expect(component.editorForm!.get(['password', 'newPassword'])!.value).toBeFalsy();
		expect(component.invitationMode).toBeTrue();
		expect(component.status).toBe('User created-user created.');
		component.editorForm!.patchValue({ id: 'next-user', email: 'next@example.com' });
		component.saveChanges();
		http.expectOne((request) => request.url.endsWith('/automation/User.Invite')).flush(null);
		expect(saved.map((value) => [value.id, !!value.invited])).toEqual([
			['created-user', false],
			['next-user', true],
		]);
		expect(hide).toHaveBeenCalledTimes(1);
	});
	it('rejects administrators-group escalation and surfaces invitation errors without discarding the draft', () => {
		(TestBed.inject(AuthService).userInfo as unknown as jasmine.Spy).and.returnValue({
			id: 'manager',
			isAdministrator: false,
		});
		component.editorForm!.patchValue({
			id: 'new-user',
			email: 'new@example.com',
			groups: ['administrators'],
		});
		component.saveChanges();
		http.expectNone((request) => request.method === 'POST');
		expect(component.error).toContain('Only an administrator');
		component.editorForm!.get('groups')!.setValue(['members']);
		component.saveChanges();
		http
			.expectOne((request) => request.url.endsWith('/automation/User.Invite'))
			.flush({ message: 'This account already exists.' }, { status: 409, statusText: 'Conflict' });
		expect(component.error).toBe('This account already exists.');
		expect(component.editorForm!.get('id')!.value).toBe('new-user');
		expect(component.editorForm!.enabled).toBeTrue();
	});
	it('loads direct memberships before editing and protects the account identifier during password changes', () => {
		fixture.destroy();
		fixture = TestBed.createComponent(UserAndGroupEditorComponent);
		fixture.componentRef.setInput('add', false);
		fixture.componentRef.setInput('userOrGroup', { id: 'team/user', groups: [] });
		component = fixture.componentInstance;
		fixture.detectChanges();
		expect(component.loading).toBeTrue();
		http
			.expectOne((value) => value.url.endsWith('/user/team%2Fuser'))
			.flush({
				id: 'team/user',
				properties: { email: 'old@example.com', groups: ['direct'] },
				extendedGroups: [{ name: 'direct' }, { name: 'inherited' }],
			});
		expect(component.editorForm!.get('groups')!.value).toEqual(['direct']);
		component.editorForm!.patchValue({
			id: 'renamed-account',
			email: 'new@example.com',
			password: {
				changePassword: true,
				newPassword: 'replacement',
				newPasswordConfirmation: 'replacement',
			},
		});
		expect(component.editorForm!.valid).toBeTrue();
		component.saveChanges();
		const request = http.expectOne(
			(value) => value.url.endsWith('/user/team%2Fuser') && value.method === 'PUT',
		);
		expect(request.request.body.properties).toEqual(
			jasmine.objectContaining({
				groups: ['direct'],
				password: 'replacement',
				email: 'new@example.com',
			}),
		);
		request.flush({
			id: 'team/user',
			properties: { email: 'new@example.com', groups: ['direct'] },
		});
	});
	it('creates a group using its identifier separately from the display label and normalizes picker members', () => {
		fixture.destroy();
		fixture = TestBed.createComponent(UserAndGroupEditorComponent);
		fixture.componentRef.setInput('isUserGroup', true);
		component = fixture.componentInstance;
		fixture.detectChanges();
		component.editorForm!.patchValue({
			id: 'review-team',
			name: 'Review Team',
			users: ['bob', { id: 'alice' }, 'bob'],
		});
		component.saveChanges();
		const request = http.expectOne(
			(value) => value.url.endsWith('/group') && value.method === 'POST',
		);
		expect(request.request.body.groupname).toBe('review-team');
		expect(request.request.body.grouplabel).toBe('Review Team');
		expect(request.request.body.memberUsers).toEqual(['bob', 'alice']);
		request.flush({
			id: 'review-team',
			groupname: 'review-team',
			grouplabel: 'Review Team',
			memberUsers: ['bob', 'alice'],
			properties: {},
		});
	});
	it('preserves user members while editing nested groups and rejects direct self-membership', () => {
		fixture.destroy();
		fixture = TestBed.createComponent(UserAndGroupEditorComponent);
		fixture.componentRef.setInput('isUserGroup', true);
		fixture.componentRef.setInput('add', false);
		fixture.componentRef.setInput('userOrGroup', { id: 'parent', name: 'Parent', users: [] });
		component = fixture.componentInstance;
		fixture.detectChanges();
		http
			.expectOne((request) => request.url.endsWith('/group/parent'))
			.flush({
				groupname: 'parent',
				grouplabel: 'Parent',
				memberUsers: ['bob'],
				memberGroups: ['old-child'],
			});
		expect(component.editorForm!.get('memberGroups')!.value).toEqual(['old-child']);
		component.editorForm!.get('memberGroups')!.setValue(['parent']);
		component.saveChanges();
		expect(component.editorForm!.hasError('selfMembership')).toBeTrue();
		http.expectNone((request) => request.method === 'PUT');
		component.editorForm!.get('memberGroups')!.setValue(['new-child']);
		component.saveChanges();
		const update = http.expectOne(
			(request) => request.method === 'PUT' && request.url.endsWith('/group/parent'),
		);
		expect(update.request.body.memberGroups).toEqual(['new-child']);
		expect(update.request.body.memberUsers).toEqual(['bob']);
		let saved: any;
		component.save$.subscribe((entity) => (saved = entity));
		update.flush(null);
		expect(saved.memberGroups).toEqual(['new-child']);
		expect(saved.users.map((user: any) => user.id)).toEqual(['bob']);
	});
	it('creates another group by resetting the draft after success and emits each created result', () => {
		fixture.destroy();
		fixture = TestBed.createComponent(UserAndGroupEditorComponent);
		fixture.componentRef.setInput('isUserGroup', true);
		component = fixture.componentInstance;
		fixture.detectChanges();
		const hide = spyOn(TestBed.inject(BsModalRef), 'hide');
		const ids: string[] = [];
		component.save$.subscribe((entity) => {
			ids.push(entity.id);
			component.saveChanges(true);
		});
		component.editorForm!.patchValue({ id: 'first', name: 'First', memberGroups: ['child'] });
		component.saveChanges(true);
		http
			.expectOne((request) => request.method === 'POST' && request.url.endsWith('/group'))
			.flush({ groupname: 'first', grouplabel: 'First', memberUsers: [], memberGroups: ['child'] });
		expect(hide).not.toHaveBeenCalled();
		expect(component.editorForm!.get('id')!.value).toBeFalsy();
		expect(component.editorForm!.get('memberGroups')!.value).toEqual([]);
		expect(component.editorForm!.pristine).toBeTrue();
		component.editorForm!.patchValue({ id: 'second', name: 'Second' });
		component.saveChanges();
		http
			.expectOne((request) => request.method === 'POST' && request.url.endsWith('/group'))
			.flush({ groupname: 'second', grouplabel: 'Second', memberUsers: [], memberGroups: [] });
		expect(ids).toEqual(['first', 'second']);
		expect(hide).toHaveBeenCalledTimes(1);
	});
});
