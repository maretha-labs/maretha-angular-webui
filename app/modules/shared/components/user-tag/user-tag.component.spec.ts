import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from 'app/helpers/auth.service';
import { PrincipalTags, principalLabel, UserTagComponent } from './user-tag.component';

describe('Shared user tags', () => {
	const user = signal<any>({ id: 'admin', isAdministrator: true });
	beforeEach(() => {
		user.set({ id: 'admin', isAdministrator: true });
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				provideRouter([]),
				{ provide: AuthService, useValue: { userInfo: user } },
			],
		});
	});
	it('uses resolved names, supported email fallbacks and plain unresolved identifiers', () => {
		expect(
			principalLabel({
				id: 'alice',
				properties: { firstName: 'Alice', lastName: 'Example', email: 'a@example.test' },
			}),
		).toBe('Alice Example');
		expect(principalLabel({ id: 'service', properties: { email: 'service@example.test' } })).toBe(
			'service@example.test',
		);
		expect(principalLabel('user:unresolved')).toBe('unresolved');
	});
	it('coalesces directory reads and clears its cache when the signed-in principal changes', () => {
		const directory = TestBed.inject(PrincipalTags),
			http = TestBed.inject(HttpTestingController);
		const labels: string[] = [];
		directory.resolve('alice').subscribe((entity) => labels.push(principalLabel(entity)));
		directory.resolve('alice').subscribe((entity) => labels.push(principalLabel(entity)));
		http
			.expectOne((request) => request.url.endsWith('/user/alice'))
			.flush({ id: 'alice', properties: { firstName: 'Alice' } });
		expect(labels).toEqual(['Alice', 'Alice']);
		user.set({ id: 'other' });
		directory.resolve('alice').subscribe((entity) => labels.push(principalLabel(entity)));
		http
			.expectOne((request) => request.url.endsWith('/user/alice'))
			.flush({}, { status: 403, statusText: 'Forbidden' });
		expect(labels.at(-1)).toBe('alice');
		http.verify();
	});
	it('shows an unresolved document principal as its id without a directory lookup', () => {
		const http = TestBed.inject(HttpTestingController);
		const fixture = TestBed.createComponent(UserTagComponent);
		fixture.componentRef.setInput('lookup', false);
		fixture.componentRef.setInput('user', 'thibaud');
		fixture.detectChanges();
		http.expectNone((request) => request.url.includes('/user/'));
		expect(fixture.nativeElement.textContent).toContain('thibaud');
	});
	it('preserves user navigation permissions and keeps a full accessible label on a truncated tag', () => {
		const fixture = TestBed.createComponent(UserTagComponent);
		fixture.componentRef.setInput('user', {
			id: 'alice',
			properties: { firstName: 'Alice', lastName: 'Longname' },
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe(
			'/page/user?id=alice',
		);
		expect(fixture.nativeElement.querySelector('.user-tag').title).toContain('Alice Longname');
		user.set({ id: 'viewer', isAdministrator: false, groups: [] });
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('a')).toBeNull();
	});

	it('derives stock avatar initials from names, else the username, keeping their case', () => {
		const fixture = TestBed.createComponent(UserTagComponent);
		const component = fixture.componentInstance;
		const entity = (id: string, properties: Record<string, string>) => ({
			'entity-type': 'user',
			id,
			properties,
		});
		expect(
			component.initials(
				entity('review-member', { firstName: 'Review', lastName: 'review-member' }),
			),
		).toBe('Rr');
		expect(component.initials(entity('jp', { firstName: 'Jean Paul', lastName: 'Sartre' }))).toBe(
			'JS',
		);
		// nuxeo-user-avatar `_name` skips the email: Administrator reads "A", not "D".
		expect(
			component.initials(
				entity('Administrator', { username: 'Administrator', email: 'devnull@example.com' }),
			),
		).toBe('A');
		expect(component.initials('user:gpt')).toBe('g');
		// Not an entity (no `entity-type`): stock reads its id, not its names.
		expect(component.initials({ id: 'jdoe', properties: { firstName: 'Jane' } })).toBe('j');
		fixture.componentRef.setInput(
			'user',
			entity('review-member', { firstName: 'Review', lastName: 'review-member' }),
		);
		fixture.detectChanges();
		const tag = fixture.nativeElement.querySelector('.user-tag') as HTMLElement;
		expect(tag.textContent!.trim()).toBe('Review review-member');
		expect(tag.querySelector('.avatar')!.getAttribute('data-initials')).toBe('Rr');
		expect(tag.querySelector('.avatar nx-webui-icon')).toBeNull();
	});
	it('names an entity like stock nuxeo-user-tag and draws the user icon for a non-alphanumeric name', () => {
		const http = TestBed.inject(HttpTestingController);
		const fixture = TestBed.createComponent(UserTagComponent);
		fixture.componentRef.setInput('lookup', false);
		fixture.componentRef.setInput('user', {
			'entity-type': 'user',
			id: 'Administrator',
			properties: { username: 'Administrator', email: 'devnull@example.com' },
		});
		fixture.detectChanges();
		const tag = () => fixture.nativeElement.querySelector('.user-tag') as HTMLElement;
		expect(tag().textContent!.trim()).toBe('devnull@example.com');
		expect(tag().querySelector('.avatar')!.getAttribute('data-initials')).toBe('A');
		fixture.componentRef.setInput('user', {
			'entity-type': 'user',
			id: 'emile',
			properties: { username: 'emile', firstName: 'Émile', lastName: 'Zola' },
		});
		fixture.detectChanges();
		expect(tag().textContent!.trim()).toBe('Émile Zola');
		expect(tag().querySelector('.avatar')!.getAttribute('data-initials')).toBe('');
		expect(tag().querySelector('.avatar nx-webui-icon')).not.toBeNull();
		fixture.componentRef.setInput('user', 'user:jdoe');
		fixture.detectChanges();
		expect(tag().textContent!.trim()).toBe('jdoe');
		expect(tag().querySelector('.avatar')!.getAttribute('data-initials')).toBe('j');
		http.expectNone((request) => request.url.includes('/user/'));
	});
});
