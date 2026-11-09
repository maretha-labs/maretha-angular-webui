import { AsyncPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	Injectable,
	input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { WebUiIconComponent } from '@maretha/webui-sdk';
import { AuthService } from 'app/helpers/auth.service';
import { environment } from 'environments/environment';
import { catchError, Observable, of, shareReplay } from 'rxjs';

export function principalId(user: any): string {
	return String(
		typeof user === 'string'
			? user.replace(/^user:/, '')
			: (user?.id ?? user?.uid ?? user?.properties?.username ?? ''),
	);
}
export function principalLabel(user: any): string {
	if (!user || typeof user === 'string') return principalId(user);
	const p = user.properties ?? user;
	return String(
		user.displayName ??
			p.displayName ??
			([p.firstName ?? p['user:firstName'], p.lastName ?? p['user:lastName']]
				.filter(Boolean)
				.join(' ')
				.trim() ||
				p.email ||
				p['user:email'] ||
				principalId(user)),
	);
}
/** Stock `_isEntity` (nuxeo-user-tag, nuxeo-user-avatar). */
function isUserEntity(user: any): boolean {
	return !!(
		user &&
		user['entity-type'] &&
		(user['entity-type'] === 'user' ||
			(user['entity-type'] === 'document' && user.type === 'user')) &&
		user.properties
	);
}
/** Stock `_id`: the username of an entity, else the id, else the string without `user:`. */
function stockUserId(user: any): string {
	if (!user) return '';
	const id = user.properties?.username || user.properties?.['user:username'] || user.id || user.uid;
	return String(id || (typeof user === 'string' ? user.replace('user:', '') : ''));
}
function stockFullName(user: any): string {
	const p = user.properties;
	return [p.firstName || p['user:firstName'], p.lastName || p['user:lastName']].join(' ').trim();
}
/** Stock nuxeo-user-tag `_name`: an entity's full name, email or username; else the id. */
export function userTagName(user: unknown): string {
	if (!isUserEntity(user)) return stockUserId(user);
	const p = (user as any).properties;
	return (
		stockFullName(user) ||
		p.email ||
		p['user:email'] ||
		p.username ||
		p['user:username'] ||
		stockUserId(user)
	);
}
/** Stock nuxeo-user-avatar `_name`: an entity's full name or username; else the id. */
function avatarName(user: unknown): string {
	if (!isUserEntity(user)) return stockUserId(user);
	const p = (user as any).properties;
	return stockFullName(user) || p.username || p['user:username'] || stockUserId(user);
}
function firstAndLastInitials(text: string): string {
	const parts = text.trim().split(/\s+/).filter(Boolean);
	if (parts.length <= 1) return parts[0] ? parts[0].charAt(0) : '';
	return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`;
}
/**
 * Stock nuxeo-user-avatar `_initials`, case kept: the first and last name parts of an entity's
 * names, else of its avatar name. Empty when that name does not start with a-z or 0-9: stock then
 * draws the user icon instead.
 */
export function userAvatarInitials(user: unknown): string {
	if (!/^[a-z0-9]/.test(avatarName(user).charAt(0).toLowerCase())) return '';
	const p = isUserEntity(user) ? (user as any).properties : undefined;
	const names = p
		? [p.firstName || p['user:firstName'] || '', p.lastName || p['user:lastName'] || '']
				.map((part: string) => part.trim())
				.join(' ')
				.trim()
		: '';
	return firstAndLastInitials(names || avatarName(user));
}
@Injectable({ providedIn: 'root' })
export class PrincipalTags {
	private readonly http = inject(HttpClient);
	private readonly auth = inject(AuthService, { optional: true });
	private scope = '';
	private readonly cache = new Map<string, Observable<any>>();
	resolve(user: unknown): Observable<any> {
		if (typeof user !== 'string' || !user) return of(user);
		const scope = this.auth?.userInfo?.()?.id ?? '';
		if (scope !== this.scope) {
			this.scope = scope;
			this.cache.clear();
		}
		const id = principalId(user);
		if (!this.cache.has(id))
			this.cache.set(
				id,
				this.http.get(`${environment.nuxeoUrl}/api/v1/user/${encodeURIComponent(id)}`).pipe(
					catchError(() => of(user)),
					shareReplay({ bufferSize: 1, refCount: false }),
				),
			);
		return this.cache.get(id)!;
	}
}
@Component({
	selector: 'nx-user-tag',
	imports: [AsyncPipe, RouterLink, WebUiIconComponent],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `@if (resolved() | async; as entity) {
		<span
			class="user-tag"
			[title]="label(entity) + ' (' + id(entity) + ')'"
			data-nx-results-interactive
			><span
				class="avatar"
				[style.background-color]="color(entity)"
				[attr.data-initials]="initials(entity)"
				aria-hidden="true"
			>
				@if (!initials(entity)) {
					<nx-webui-icon name="nuxeo:user" />
				}
			</span>
			@if (linked() && id(entity) !== 'system') {
				<a [routerLink]="['/page/user']" [queryParams]="{ id: id(entity) }">{{ name(entity) }}</a>
			} @else {
				<span class="name">{{ name(entity) }}</span>
			}
		</span>
	}`,
	styles: `
		:host {
			display: inline-block;
			max-width: 100%;
			min-width: 0;
			vertical-align: middle;
		}
		.user-tag {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			max-width: 100%;
			border-radius: 20px;
			background: var(--nuxeo-tag-background, #f5f5f5);
			padding-inline-end: 6px;
			line-height: 22px;
			font-size: 12px;
			white-space: nowrap;
		}
		.avatar {
			flex: 0 0 22px;
			width: 22px;
			height: 22px;
			border-radius: 50%;
			display: grid;
			place-items: center;
			color: #fff;
			font-size: 10px;
		}
		.avatar nx-webui-icon {
			--webui-icon-size: 12px;
			color: #fff;
		}
		/* Initials are decoration (stock renders them inside the avatar's shadow root), so they
		   stay out of the tag's text content and never read as part of the name. */
		.avatar::before {
			content: attr(data-initials);
		}
		a,
		.name {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			min-width: 0;
		}
		a {
			color: inherit;
			text-decoration: none;
		}
		a:hover {
			text-decoration: underline;
			color: var(--nuxeo-primary-color);
		}
		a:focus-visible {
			outline: 2px solid var(--nuxeo-primary-color);
		}
	`,
})
export class UserTagComponent {
	readonly user = input<unknown>('');
	readonly disabled = input(false);
	/** `false` for document fields the server already resolved (`fetch-document: properties`):
	 *  an id left as a string there is a principal the directory no longer has, so a lookup
	 *  can only 404. Stock `nuxeo-user-tag` never looks ids up. */
	readonly lookup = input(true);
	private readonly principals = inject(PrincipalTags);
	private readonly auth = inject(AuthService, { optional: true });
	readonly resolved = computed(() =>
		this.lookup() ? this.principals.resolve(this.user()) : of(this.user()),
	);
	readonly linked = computed(() => {
		const current = this.auth?.userInfo?.();
		return (
			!this.disabled() &&
			!!(
				current?.isAdministrator || current?.groups?.some((g: any) => (g.id ?? g) === 'powerusers')
			)
		);
	});
	readonly label = principalLabel;
	readonly id = principalId;
	/**
	 * Stock nuxeo-user-tag `_name` of the given user: the identifier for a string principal (it
	 * never resolves the name), the full name, email or username for a user entity.
	 */
	name(_entity?: unknown): string {
		return userTagName(this.user());
	}
	/** Stock nuxeo-user-avatar initials; the resolved entity drives the avatar. */
	initials(user: unknown): string {
		return userAvatarInitials(user);
	}
	color(user: unknown): string {
		let hash = 0;
		for (const c of this.id(user)) hash = c.charCodeAt(0) + ((hash << 5) - hash);
		return `hsl(${Math.abs(hash % 360)}, 70%, 30%)`;
	}
}
