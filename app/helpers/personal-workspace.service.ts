import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, PendingTasks, signal } from '@angular/core';
import { localizedText, messageText } from 'app/helpers/localized-message';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { environment } from 'environments/environment';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { AuthService } from './auth.service';

/** The signed-in user's personal workspace in the current repository, loaded once per pair. */
@Injectable({ providedIn: 'root' })
export class PersonalWorkspaceService {
	private readonly http = inject(HttpClient);
	private readonly tasks = inject(PendingTasks);
	private readonly auth = inject(AuthService);
	private readonly documents = inject(DocumentsManagerService);
	private readonly cancelled = new Subject<void>();
	private readonly revision = signal(0);
	private readonly _workspace = signal<{ path: string } | null>(null);
	private readonly _loading = signal(false);
	private generation = 0;
	private readonly userId = computed(() => this.auth.userInfo()?.id ?? null);
	readonly repository = computed(() =>
		String(this.documents.documentFetched()?.repository ?? 'default'),
	);
	readonly workspace = this._workspace.asReadonly();
	readonly loading = this._loading.asReadonly();
	readonly error = localizedText('');

	constructor() {
		effect(() => {
			const user = this.userId();
			const repository = this.repository();
			void this.revision();
			this.tasks.run(() => this.load(user, repository));
		});
	}

	retry(): void {
		this.revision.update((value) => value + 1);
	}

	private async load(user: string | null, repository: string): Promise<void> {
		const generation = ++this.generation;
		this.cancelled.next();
		this._workspace.set(null);
		this.error.set('');
		this._loading.set(!!user);
		if (!user) return;
		try {
			const document = await firstValueFrom(
				this.http
					.post<{
						path: string;
					}>(
						environment.nuxeoUrl + '/api/v1/automation/User.GetUserWorkspace',
						{ params: {} },
						{ headers: { 'X-NXRepository': repository } },
					)
					.pipe(takeUntil(this.cancelled)),
			);
			if (generation !== this.generation) return;
			if (typeof document.path !== 'string' || !document.path.startsWith('/'))
				throw new Error('Invalid workspace');
			this._workspace.set(document);
		} catch {
			if (generation === this.generation)
				this.error.set(
					messageText(
						'app.state.your-personal-workspace-could-not-be-loaded-c-101b54',
						'Your personal workspace could not be loaded. Check your access and retry.',
					),
				);
		} finally {
			if (generation === this.generation) this._loading.set(false);
		}
	}
}
