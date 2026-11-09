import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { PageContext, WebUiIconComponent } from '@maretha/webui-sdk';
import { environment } from 'environments/environment';
import { catchError, concat, distinctUntilChanged, map, of, switchMap } from 'rxjs';
interface PrincipalDetails {
	id: string;
	kind: string;
	title: string;
	fields: readonly { label: string; labelKey: string; value: string }[];
	members: readonly string[];
	groups: readonly string[];
}
interface PrincipalState {
	loading: boolean;
	error: string;
	errorKey?: string;
	data: PrincipalDetails | null;
}
@Component({
	selector: 'nx-principal-page',
	imports: [RouterLink, WebUiIconComponent, WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `<header>
			{{
				context().pageId === 'user'
					? ('app.components.principal-page.user' | webuiMessage: 'User')
					: ('app.components.principal-page.group' | webuiMessage: 'Group')
			}}
		</header>
		<main>
			@if (state().loading) {
				<p role="status">
					{{ 'app.components.principal-page.loading-85be6b' | webuiMessage: 'Loading…' }}
				</p>
			}
			@if (state().error) {
				<p role="alert">{{ state().errorKey || '' | webuiMessage: state().error }}</p>
				<button type="button" (click)="retry()">
					{{ 'app.components.principal-page.retry-2971db' | webuiMessage: 'Retry' }}
				</button>
			}
			@if (state().data; as principal) {
				<section>
					<h1>
						<nx-webui-icon [name]="principal.kind === 'user' ? 'nuxeo:user' : 'nuxeo:group'" />{{
							principal.title
						}}
					</h1>
					<p>{{ principal.id }}</p>
					<dl>
						@for (field of principal.fields; track field.label) {
							<dt>{{ field.labelKey | webuiMessage: field.label }}</dt>
							<dd>{{ field.value || '—' }}</dd>
						}
					</dl>
				</section>
				<section>
					<h2>
						{{
							principal.kind === 'user'
								? ('app.components.principal-page.groups' | webuiMessage: 'Groups')
								: ('app.components.principal-page.subgroups' | webuiMessage: 'Subgroups')
						}}
					</h2>
					<ul>
						@for (group of principal.groups; track group) {
							<li>
								<a [routerLink]="['/page/group']" [queryParams]="{ id: group }">{{ group }}</a>
							</li>
						} @empty {
							<li>
								{{
									'app.components.principal-page.no-groups-to-display-b171c2'
										| webuiMessage: 'No groups to display.'
								}}
							</li>
						}
					</ul>
				</section>
				@if (principal.kind === 'group') {
					<section>
						<h2>{{ 'createGroup.members' | webuiMessage: 'Members' }}</h2>
						<ul>
							@for (user of principal.members; track user) {
								<li>
									<a [routerLink]="['/page/user']" [queryParams]="{ id: user }">{{ user }}</a>
								</li>
							} @empty {
								<li>
									{{
										'app.components.principal-page.no-members-to-display-b4c708'
											| webuiMessage: 'No members to display.'
									}}
								</li>
							}
						</ul>
					</section>
				}
			}
		</main>`,
	styles: `
		:host {
			display: flex;
			flex: 1;
			min-height: 0;
			flex-direction: column;
			color: var(--nuxeo-text-default);
		}
		header {
			height: 53px;
			flex-shrink: 0;
			padding: 16px 76px 16px 16px;
			background: var(--nuxeo-box);
			box-shadow: 0 2px 4px #0002;
		}
		main {
			overflow: auto;
			padding: 16px;
		}
		section {
			padding: 24px;
			background: var(--nuxeo-box);
			margin-bottom: 16px;
		}
		h1 {
			display: flex;
			align-items: center;
			gap: 16px;
			font-size: 1.5rem;
		}
		h2 {
			font-size: 1.2rem;
		}
		nx-webui-icon {
			width: 48px;
			height: 48px;
		}
		dt {
			margin-top: 12px;
		}
		dd {
			overflow-wrap: anywhere;
		}
		li {
			padding: 4px;
		}
		@media (max-width: 720px) {
			header {
				padding-inline-start: 56px;
			}
		}
	`,
})
export class PrincipalPageComponent {
	readonly context = input.required<PageContext>();
	private readonly http = inject(HttpClient);
	private readonly revision = signal(0);
	retry(): void {
		this.revision.update((v) => v + 1);
	}
	private readonly target = computed(() =>
		JSON.stringify([
			this.context().pageId,
			this.context().query['id'] ?? '',
			this.context().user?.id,
			this.revision(),
		]),
	);
	readonly state = toSignal(
		toObservable(this.target).pipe(
			distinctUntilChanged(),
			switchMap((key) => {
				const [kind, id, user] = JSON.parse(key) as string[];
				if (!user || !id || !['user', 'group'].includes(kind))
					return of<PrincipalState>({
						loading: false,
						error: 'Select a valid user or group.',
						errorKey: 'app.components.principal-page.invalid',
						data: null,
					});
				return concat(
					of<PrincipalState>({ loading: true, error: '', data: null }),
					this.http
						.get<any>(`${environment.nuxeoUrl}/api/v1/${kind}/${encodeURIComponent(id)}`)
						.pipe(
							map(
								(data): PrincipalState => ({
									loading: false,
									error: '',
									data: this.details(kind, id, data),
								}),
							),
							catchError(() =>
								of<PrincipalState>({
									loading: false,
									error:
										'This user or group is unavailable, or you do not have permission to view it.',
									errorKey: 'app.components.principal-page.unavailable',
									data: null,
								}),
							),
						),
				);
			}),
		),
		{ initialValue: { loading: true, error: '', data: null } as PrincipalState },
	);
	private details(kind: string, id: string, data: any): PrincipalDetails {
		const p = data.properties ?? {};
		const strings = (values: unknown): string[] =>
			Array.isArray(values) ? values.filter((v) => typeof v === 'string') : [];
		return {
			kind,
			id,
			title:
				kind === 'user'
					? [p.firstName, p.lastName].filter(Boolean).join(' ') || id
					: data.grouplabel || p.grouplabel || id,
			fields:
				kind === 'user'
					? [
							{
								label: 'First name',
								labelKey: 'app.components.principal-page.first-name',
								value: p.firstName ?? '',
							},
							{
								label: 'Last name',
								labelKey: 'app.components.principal-page.last-name',
								value: p.lastName ?? '',
							},
							{
								label: 'Company',
								labelKey: 'app.components.principal-page.company',
								value: p.company ?? '',
							},
							{
								label: 'Email',
								labelKey: 'app.components.principal-page.email',
								value: p.email ?? '',
							},
						]
					: [
							{
								label: 'Description',
								labelKey: 'app.components.principal-page.description',
								value: p.description ?? '',
							},
						],
			members: strings(data.memberUsers),
			groups:
				kind === 'user'
					? Array.isArray(data.extendedGroups)
						? data.extendedGroups
								.map((g: any) => g.name)
								.filter((g: unknown) => typeof g === 'string')
						: strings(p.groups)
					: strings(data.memberGroups),
		};
	}
}
