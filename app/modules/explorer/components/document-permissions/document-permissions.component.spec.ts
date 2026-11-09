import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, Input } from '@angular/core';
import { DocumentProjectionRegistry } from '@maretha/webui-sdk';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import {
	faEnvelope,
	faExclamationTriangle,
	faPencil,
	faTimes,
	faUser,
	faUserClock,
	faUsers,
} from '@fortawesome/free-solid-svg-icons';
import { TranslateModule } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { DocumentPermissionsComponent } from './document-permissions.component';

@Component({
	standalone: true,
	template: '<output>acl extension {{ projectionContext?.document?.uid }}</output>',
})
class AclProjection {
	@Input() projectionContext: any;
}

describe('DocumentPermissionsComponent', () => {
	let fixture: ComponentFixture<DocumentPermissionsComponent>;
	let http: HttpTestingController;
	const response = (permissions: string[] = ['ReadSecurity'], aces: unknown[] = []) => ({
		contextParameters: { permissions, userVisiblePermissions: [], acls: [{ name: 'local', aces }] },
	});
	const request = () => http.expectOne((req) => req.method === 'GET' && req.url.includes('/id/'));
	beforeEach(() => {
		TestBed.configureTestingModule({
			imports: [DocumentPermissionsComponent, TranslateModule.forRoot()],
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: ToastrService, useValue: { info: jasmine.createSpy() } },
			],
		});
		TestBed.inject(FaIconLibrary).addIcons(
			faEnvelope,
			faExclamationTriangle,
			faPencil,
			faTimes,
			faUser,
			faUserClock,
			faUsers,
		);
		http = TestBed.inject(HttpTestingController);
		fixture = TestBed.createComponent(DocumentPermissionsComponent);
		fixture.componentRef.setInput('document', { uid: 'one', type: 'File' });
		fixture.detectChanges();
	});
	afterEach(() => http.verify());
	it('normalizes principals without mutating the response and hides management controls for readers', () => {
		const original = response(
			['ReadSecurity'],
			[{ id: 'ace', username: 'Alice', permission: 'Read', granted: true }],
		);
		request().flush(original);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Alice');
		expect(fixture.nativeElement.textContent).not.toContain('Add a new permission');
		expect(original.contextParameters.acls[0].aces[0]).toEqual({
			id: 'ace',
			username: 'Alice',
			permission: 'Read',
			granted: true,
		});
		fixture.componentInstance.removePermission('ace');
		http.expectNone((req) => req.method === 'POST');
	});
	it('requires fresh WriteSecurity permission and respects noEdit', () => {
		request().flush(response(['WriteSecurity']));
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Add a new permission');
		fixture.componentRef.setInput('noEdit', true);
		fixture.detectChanges();
		expect(fixture.componentInstance.canManagePermissions).toBeFalse();
		request().flush(response(['WriteSecurity']));
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).not.toContain('Add a new permission');
	});
	it('mounts and disposes a client ACL empty-result projection at the real permissions host', () => {
		const dispose = TestBed.inject(DocumentProjectionRegistry).register({
			id: 'client.empty',
			name: 'acl.emptyResult',
			component: AclProjection,
			priority: 10,
		});
		request().flush(response(['ReadSecurity'], []));
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('acl extension one');
		dispose();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain(
			'There are no permissions to display here.',
		);
	});
	it('hides the ACL empty fallback when a client disables the slot', () => {
		const dispose = TestBed.inject(DocumentProjectionRegistry).register({
			id: 'client.hide-empty',
			name: 'acl.emptyResult',
			disabled: true,
		});
		request().flush(response(['ReadSecurity'], []));
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).not.toContain(
			'There are no permissions to display here.',
		);
		dispose();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain(
			'There are no permissions to display here.',
		);
	});
	it('uses the inheritance blocker rather than the number of inherited entries', () => {
		request().flush(
			response(
				['WriteSecurity'],
				[{ id: 'block', username: 'Everyone', permission: 'Everything', granted: false }],
			),
		);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Enable permission inheritance');
		fixture.componentInstance.togglePermissionInhertance();
		const mutation = http.expectOne((req) =>
			req.url.endsWith('/automation/Document.UnblockPermissionInheritance'),
		);
		expect(mutation.request.body.input).toBe('one');
		mutation.flush({});
		request().flush(response(['WriteSecurity']));
	});
	it('cancels stale document reads and surfaces failures with retry', () => {
		const old = request();
		fixture.componentRef.setInput('document', { uid: 'two', type: 'File' });
		fixture.detectChanges();
		expect(old.cancelled).toBeTrue();
		request().flush({}, { status: 403, statusText: 'Forbidden' });
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
			'could not be loaded',
		);
		fixture.componentInstance.getPermissions();
		request().flush(response());
		expect(fixture.componentInstance.error).toBeNull();
	});
});
