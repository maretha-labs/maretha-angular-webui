import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { localizedText, messageText } from 'app/helpers/localized-message';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	effect,
	inject,
	input,
	signal,
	untracked,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DocumentInfoBarContext, WebUiIconComponent } from '@maretha/webui-sdk';
import { environment } from 'environments/environment';
import { documentUrl } from 'app/helpers/document-route';
import { hasPermission } from 'app/helpers/document-permissions';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

@Component({
	selector: 'nx-standard-version-notice',
	imports: [WebUiMessagePipe, WebUiIconComponent],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<div class="version-notice" role="status">
			<nx-webui-icon name="icons:info" />
			<span>{{
				'version.viewing'
					| webuiMessage: "You're viewing version {version}." : { version: version(document()) }
			}}</span>
			@if (canRestore()) {
				<button type="button" [disabled]="busy()" (click)="restore()">
					{{
						'version.restore' | webuiMessage: 'Restore {version}' : { version: version(document()) }
					}}
				</button>
			}
		</div>
		@if (error()) {
			<p role="alert">{{ error() }}</p>
		}
	`,
	styles: `
		:host {
			display: block;
		}
		.version-notice {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 12px 16px;
			background: var(--nuxeo-box);
			border-bottom: 1px solid var(--nuxeo-border);
			color: var(--nuxeo-text-default);
		}
		button {
			margin-inline-start: auto;
			background: var(--nuxeo-box);
			border: 1px solid var(--nuxeo-border);
			color: inherit;
			padding: 6px 12px;
		}
	`,
})
export class StandardVersionNoticeComponent {
	private readonly uiStandardVersionNoticeComponentConfirmations =
		injectUiMessages(RuntimeUiMessages);

	readonly context = input.required<DocumentInfoBarContext>();
	readonly document = computed<any>(() => this.context().document);
	readonly latest = signal<any>(null);
	readonly busy = signal(false);
	readonly error = localizedText('');
	readonly canRestore = computed(() => this.mayRestore(this.document(), this.latest()));
	private readonly confirmDialog = inject(ConfirmDialogService);
	private readonly http = inject(HttpClient);
	private readonly router = inject(Router);
	private readonly destroy = inject(DestroyRef);
	private generation = 0;
	private scope = '';
	private readonly api = `${environment.nuxeoUrl}/api/v1/automation`;
	constructor() {
		effect(() => {
			const doc = this.document();
			const scope = JSON.stringify([doc?.repository, doc?.uid]);
			if (scope === this.scope) return;
			this.scope = scope;
			const generation = ++this.generation;
			this.latest.set(null);
			this.error.set('');
			this.busy.set(false);
			if (doc?.isVersion) untracked(() => void this.load(doc, generation));
		});
		this.destroy.onDestroy(() => this.generation++);
	}
	version(doc: any): string {
		return `${doc?.properties?.['uid:major_version'] ?? 0}.${doc?.properties?.['uid:minor_version'] ?? 0}`;
	}
	private mayRestore(doc: any, latest: any): boolean {
		return (
			!!doc?.isVersion &&
			!!latest &&
			!this.context().noEdit &&
			!latest.isRecord &&
			!latest.hasLegalHold &&
			!latest.retainUntil &&
			hasPermission(latest, 'WriteVersion') &&
			(this.version(doc) !== this.version(latest) || latest.isCheckedOut === true)
		);
	}
	private source(doc: any): Promise<any> {
		return firstValueFrom(
			this.http.post(
				`${this.api}/Proxy.GetSourceDocument`,
				{ input: doc.uid, params: {} },
				{
					headers: {
						'X-NXRepository': doc.repository ?? 'default',
						properties: '*',
						'enrichers-document': 'permissions',
					},
				},
			),
		);
	}
	private async load(doc: any, generation: number): Promise<void> {
		try {
			const latest = await this.source(doc);
			if (generation === this.generation) this.latest.set(latest);
		} catch {
			if (generation === this.generation)
				this.error.set(
					messageText(
						'app.state.unable-to-check-whether-this-version-can-be-r-dc052f',
						'Unable to check whether this version can be restored.',
					),
				);
		}
	}
	async restore(): Promise<void> {
		if (!this.canRestore() || this.busy()) return;
		const doc = this.document();
		const confirmed = await this.confirmDialog.confirm({
			titleKey: 'versions.restore',
			title: 'Restore',
			messageKey: 'versions.restore.confirm',
			message: 'Restore this version? The current working copy will be replaced.',
			confirmKey: 'versions.restore',
			confirm: 'Restore',
			destructive: true,
		});
		if (!confirmed || this.busy() || this.document() !== doc) return;
		const generation = this.generation;
		this.busy.set(true);
		this.error.set('');
		try {
			const latest = await this.source(doc);
			if (generation !== this.generation) return;
			this.latest.set(latest);
			if (!this.mayRestore(doc, latest)) {
				this.error.set(
					messageText(
						'app.state.this-version-can-no-longer-be-restored-246e03',
						'This version can no longer be restored.',
					),
				);
				return;
			}
			await firstValueFrom(
				this.http.post(
					`${this.api}/Document.RestoreVersion`,
					{ input: doc.uid, params: { checkout: false } },
					{
						headers: { 'X-NXRepository': doc.repository ?? 'default', 'X-NXES-SYNC': 'true' },
					},
				),
			);
			if (generation === this.generation) await this.router.navigateByUrl(documentUrl(latest));
		} catch {
			if (generation === this.generation)
				this.error.set(
					messageText(
						'app.state.the-version-could-not-be-restored-2faf1c',
						'The version could not be restored.',
					),
				);
		} finally {
			if (generation === this.generation) this.busy.set(false);
		}
	}
}
