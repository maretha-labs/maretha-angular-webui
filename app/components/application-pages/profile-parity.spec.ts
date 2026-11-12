import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { AuthService } from 'app/helpers/auth.service';
import { PasswordDialogComponent } from './password-dialog.component';
import { ProfilePageComponent } from './profile-page.component';
import { ProfilePermissionsComponent } from './profile-permissions.component';
import { BsModalService } from 'ngx-bootstrap/modal';
import { signal } from '@angular/core';

describe('Independent account password dialog', () => {
	it('opens an animated dialog without focusing a password field before user interaction', fakeAsync(() => {
		const changePassword = jasmine.createSpy('changePassword');
		TestBed.configureTestingModule({
			imports: [PasswordDialogComponent],
			providers: [{ provide: AuthService, useValue: { changePassword } }],
		});
		const trigger = document.createElement('button');
		document.body.appendChild(trigger);
		trigger.focus();
		const passwordFocus: EventTarget[] = [];
		const recordFocus = (event: FocusEvent) => {
			if (event.target instanceof HTMLInputElement && event.target.type === 'password') {
				passwordFocus.push(event.target);
			}
		};
		document.addEventListener('focusin', recordFocus);
		const ref = TestBed.inject(BsModalService).show(PasswordDialogComponent, {
			animated: true,
			ariaLabelledBy: 'password-dialog-title',
		});
		try {
			const dialog = document.querySelector('modal-container')!;
			expect(dialog.classList.contains('show')).toBeFalse();
			tick(500);
			expect(dialog.classList.contains('show')).toBeTrue();
			expect(passwordFocus).toEqual([]);
			expect(document.activeElement).toBe(dialog.querySelector('#password-dialog-title'));
			const oldPassword = dialog.querySelector<HTMLInputElement>('#password-old')!;
			expect(oldPassword.autocomplete).toBe('current-password');
			expect(dialog.querySelector<HTMLInputElement>('#password-new')!.autocomplete).toBe(
				'new-password',
			);
			oldPassword.focus();
			expect(document.activeElement).toBe(oldPassword);
			expect(changePassword).not.toHaveBeenCalled();
		} finally {
			document.removeEventListener('focusin', recordFocus);
			ref.hide();
			tick(500);
			expect(document.activeElement).toBe(trigger);
			trigger.remove();
		}
	}));

	it('validates and changes only passwords, retains a failed draft, and cancels without profile writes', () => {
		const pending = new Subject<unknown>();
		const auth = {
			changePassword: jasmine.createSpy().and.returnValue(pending),
			updateUserInfo: jasmine.createSpy(),
		};
		const modal = { hide: jasmine.createSpy() };
		TestBed.configureTestingModule({
			imports: [PasswordDialogComponent],
			providers: [
				{ provide: AuthService, useValue: auth },
				{ provide: BsModalRef, useValue: modal },
			],
		});
		const fixture = TestBed.createComponent(PasswordDialogComponent);
		const component = fixture.componentInstance;
		component.form.setValue({
			oldPassword: 'old',
			newPassword: 'new',
			confirmPassword: 'different',
		});
		component.save();
		expect(auth.changePassword).not.toHaveBeenCalled();
		component.form.controls.confirmPassword.setValue('new');
		component.save();
		component.save();
		expect(auth.changePassword).toHaveBeenCalledOnceWith('old', 'new');
		expect(auth.updateUserInfo).not.toHaveBeenCalled();
		pending.error(new Error('Wrong old password'));
		expect(component.error).toBeTrue();
		expect(component.form.controls.oldPassword.value).toBe('old');
		component.close();
		expect(modal.hide).toHaveBeenCalledTimes(1);
		expect(auth.updateUserInfo).not.toHaveBeenCalled();
	});
});

describe('Read-only account permission tables', () => {
	it('keeps every local ACE, excludes inherited ACLs, links documents and pages the stock query', () => {
		TestBed.configureTestingModule({
			imports: [ProfilePermissionsComponent],
			providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
		});
		const fixture = TestBed.createComponent(ProfilePermissionsComponent);
		fixture.componentRef.setInput('entity', 'fixture-account');
		fixture.componentRef.setInput('heading', 'Local Permissions');
		fixture.detectChanges();
		const http = TestBed.inject(HttpTestingController);
		const request = http.expectOne((item) => item.url.endsWith('/automation/Repository.Query'));
		expect(request.request.body.params.page).toBe(0);
		expect(request.request.body.params.query).toContain('ecm:mixinType != "HiddenInNavigation"');
		expect(request.request.body.params.query).not.toContain('/maretha');
		request.flush({
			numberOfPages: 2,
			entries: [
				{
					uid: 'doc-1',
					title: 'Fixture document',
					path: '/default-domain/fixture',
					contextParameters: {
						acls: [
							{
								name: 'local',
								aces: [
									{ username: 'fixture-account', permission: 'Read' },
									{ username: 'fixture-account', permission: 'Write' },
								],
							},
							{
								name: 'inherited',
								aces: [{ username: 'fixture-account', permission: 'Everything' }],
							},
						],
					},
				},
			],
		});
		fixture.detectChanges();
		expect(fixture.componentInstance.rows.length).toBe(2);
		expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe(
			'/browse/default-domain/fixture',
		);
		fixture.componentInstance.load(1);
		const next = http.expectOne((item) => item.url.endsWith('/automation/Repository.Query'));
		expect(next.request.body.params.page).toBe(1);
		next.flush({ numberOfPages: 2, entries: [] });
		http.verify();
	});

	it('renders profile identity, group links, permission tables and restores focus after closing the password dialog', () => {
		const onHidden = new Subject<void>();
		const show = jasmine.createSpy('show').and.returnValue({ onHidden });
		const userInfo = signal({
			id: 'alice',
			firstName: 'Alice',
			lastName: 'Admin',
			email: 'alice@example.org',
			company: 'Maretha',
			groups: [{ id: 'administrators', name: 'Administrators' }],
		});
		TestBed.configureTestingModule({
			imports: [ProfilePageComponent],
			providers: [
				provideHttpClient(withXhr()),
				provideHttpClientTesting(),
				provideRouter([]),
				{ provide: AuthService, useValue: { userInfo } },
				{ provide: BsModalService, useValue: { show } },
			],
		});
		const fixture = TestBed.createComponent(ProfilePageComponent);
		fixture.componentRef.setInput('context', {
			user: { id: 'alice', displayName: 'Alice Admin', isAdministrator: true, groups: [] },
			locale: 'en',
			route: '/page/profile',
			document: null,
			navigate: () => Promise.resolve(true),
		});
		fixture.detectChanges();
		const http = TestBed.inject(HttpTestingController);
		const queries = http.match((item) => item.url.endsWith('/automation/Repository.Query'));
		expect(queries.length).toBe(2);
		for (const q of queries) q.flush({ numberOfPages: 1, entries: [] });
		expect(fixture.nativeElement.textContent).toContain('Alice Admin');
		expect(fixture.nativeElement.textContent).toContain('alice@example.org');
		expect(fixture.nativeElement.textContent).toContain('Maretha');
		expect(fixture.nativeElement.textContent).toContain('Administrators');
		const button = fixture.nativeElement.querySelector('.identity button') as HTMLButtonElement;
		const focusSpy = spyOn(button, 'focus');
		button.click();
		expect(show).toHaveBeenCalledWith(
			PasswordDialogComponent,
			jasmine.objectContaining({ ariaLabelledBy: 'password-dialog-title' }),
		);
		onHidden.next();
		expect(focusSpy).toHaveBeenCalledTimes(1);
		http.verify();
	});
});
