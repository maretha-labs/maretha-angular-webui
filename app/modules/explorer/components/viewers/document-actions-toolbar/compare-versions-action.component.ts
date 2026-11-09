import { localizedText, messageText } from 'app/helpers/localized-message';
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	computed,
	inject,
	input,
	signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { DocumentActionContext, WebUiIconComponent, WebUiMessages } from '@maretha/webui-sdk';
import { environment } from 'environments/environment';
import { hasDocumentVersion } from './document-version-policy';

@Component({
	selector: 'nx-compare-versions-action',
	imports: [WebUiIconComponent, TooltipDirective],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `@if (available()) {
			<button
				type="button"
				[disabled]="busy()"
				[attr.aria-label]="label"
				[tooltip]="label"
				container="body"
				(click)="compare()"
			>
				<nx-webui-icon name="nuxeo:compare" /><span class="action-label">{{ label }}</span>
			</button>
		}
		@if (message()) {
			<span role="status">{{ message() }}</span>
		}`,
	styles: `
		:host {
			display: contents;
		}
		button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 36px;
			height: 36px;
			padding: 8px;
			border: 0;
			background: transparent;
			color: inherit;
			border-radius: 4px;
		}
		button:hover {
			background: var(--nuxeo-border);
		}
		button:focus-visible {
			outline: 2px solid var(--nuxeo-primary-color);
		}
		span {
			font-size: 12px;
			max-width: 220px;
		}
	`,
})
export class CompareVersionsActionComponent {
	readonly context = input.required<DocumentActionContext>();
	private readonly http = inject(HttpClient);
	private readonly router = inject(Router);
	private readonly destroy = inject(DestroyRef);
	private readonly messages = inject(WebUiMessages);
	get label(): string {
		return this.messages.text('versionsDiffButton.tooltip', 'Compare Versions');
	}
	readonly busy = signal(false);
	readonly message = localizedText('');
	readonly available = computed(() => hasDocumentVersion(this.context().document));
	async compare(): Promise<void> {
		if (!this.available() || this.busy()) return;
		const document = this.context().document as Record<string, any>;
		const uid = document['uid'];
		const repository = String(document['repository'] ?? 'default');
		const current = () =>
			!this.destroy.destroyed &&
			this.context().document?.['uid'] === uid &&
			String(this.context().document?.['repository'] ?? 'default') === repository;
		this.busy.set(true);
		this.message.set('');
		try {
			const result = await firstValueFrom(
				this.http.post<{ entries: Record<string, any>[] }>(
					`${environment.nuxeoUrl}/api/v1/automation/Document.GetVersions`,
					{ input: uid, params: {}, context: {} },
					{ headers: { properties: '*', 'X-NXRepository': repository } },
				),
			);
			if (!current()) return;
			const versions = [...result.entries].reverse();
			const currentIndex = versions.findIndex(
				(version) =>
					version['properties']?.['uid:major_version'] ===
						document['properties']?.['uid:major_version'] &&
					version['properties']?.['uid:minor_version'] ===
						document['properties']?.['uid:minor_version'],
			);
			if (currentIndex > 0) versions.unshift(...versions.splice(currentIndex, 1));
			if (document['isCheckedOut']) versions.unshift(document);
			if (versions.length < 2) {
				this.message.set(
					messageText(
						'versionsDiffButton.nothingToCompare',
						'There are no other versions to compare with.',
					),
				);
				return;
			}
			await this.router.navigate(['/page/compare'], {
				queryParams: {
					left: versions[1]['uid'],
					right: versions[0]['uid'],
					ids: versions.map((version) => version['uid']).join(','),
					repository,
				},
			});
		} catch {
			if (current())
				this.message.set(
					messageText(
						'app.state.unable-to-load-versions-please-try-again-e20f81',
						'Unable to load versions. Please try again.',
					),
				);
		} finally {
			if (!this.destroy.destroyed) this.busy.set(false);
		}
	}
}
