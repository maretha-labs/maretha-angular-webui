import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MetadataPolicyService } from '../../../helpers/metadata-policy.service';
import { FileSizePipe } from 'app/pipes/file-size.pipe';

@Component({
	imports: [WebUiMessagePipe],
	providers: [FileSizePipe],
	selector: 'nx-picture-metadata-card',
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<details [open]="entries().length > 0">
			<summary>
				{{ kindLabel() }}
				@if (!entries().length) {
					<span class="unavailable">{{
						'app.modules.picture-metadata-card.not-available-c0e170' | webuiMessage: 'Not available'
					}}</span>
				}
			</summary>
			<div class="card-body">
				@if (entries().length) {
					<dl>
						@for (entry of entries(); track entry.key) {
							<dt>{{ entry.label }}</dt>
							<dd>{{ entry.value }}</dd>
						}
					</dl>
				} @else {
					<p>
						{{
							'picture.noMetadata'
								| webuiMessage
									: 'No {kind} metadata is available to display.'
									: { kind: kindLabel() }
						}}
					</p>
				}
			</div>
		</details>
	`,
	styles: `
		.unavailable {
			float: inline-end;
			font-size: 12px;
			font-weight: 400;
			color: var(--bs-secondary-color);
		}
		:host {
			display: block;
			min-width: 0;
		}
		details {
			background: var(--nuxeo-box, #fff);
			height: 100%;
			border: 0;
			border-radius: 0;
			min-height: 200px;
			overflow: hidden;
		}
		summary {
			text-align: start;
			padding: 12px 16px;
			font-size: 13px;
			font-weight: 600;
			cursor: pointer;
		}
		.card-body {
			padding: 12px 16px;
			border-top: 0;
			max-height: none;
			overflow: auto;
		}
		dl {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
			gap: 10px 16px;
			margin: 0;
			font-size: 12px;
			text-align: start;
		}
		dt {
			font-weight: 500;
			color: var(--bs-secondary-color);
		}
		dd {
			margin: 0;
			font-weight: 500;
			overflow-wrap: anywhere;
		}
		p {
			margin: 0;
			font-size: 13px;
			color: var(--bs-secondary-color);
			text-align: start;
		}
	`,
})
export class PictureMetadataCardComponent {
	private readonly uiLabels = injectUiMessages(RuntimeUiMessages);
	readonly document = input<any>();
	readonly kind = input.required<'Picture Info' | 'IPTC' | 'EXIF'>();
	readonly kindLabel = computed(() =>
		this.kind() === 'Picture Info'
			? this.uiLabels.text('app.labels.picture-info-fc2deb', 'Picture Info')
			: this.kind(),
	);
	private readonly policy = inject(MetadataPolicyService);
	private readonly fileSize = inject(FileSizePipe);
	readonly entries = computed(() => {
		const document = this.document();
		const preferences = this.policy.userPreferences(document?.type || '');
		if (this.kind() === 'Picture Info') {
			if (
				preferences.hiddenSchemas.includes('picture') ||
				preferences.hiddenFields.includes('picture:info') ||
				!this.policy.canRead(document, 'picture:info')
			)
				return [];
			const info = document?.properties?.['picture:info'] || {};
			const values = [
				{
					key: 'dimensions',
					label: this.uiLabels.text('app.labels.dimensions-914182', 'Dimensions'),
					value:
						info.width && info.height
							? `${this.format(info.width)} × ${this.format(info.height)}`
							: '',
				},
				{
					key: 'format',
					label: this.uiLabels.text('app.labels.format-2f3436', 'Format'),
					value: info.format,
				},
				{
					key: 'colorSpace',
					label: this.uiLabels.text('app.labels.color-profile-dacfe1', 'Color profile'),
					value: info.colorSpace,
				},
				{
					key: 'depth',
					label: this.uiLabels.text(
						'app.labels.bit-depth-per-channel-e31b31',
						'Bit depth per channel',
					),
					value: info.depth,
				},
				{
					// Stock "Weight" row: the main file's size (file:content.length), hidden without a file.
					key: 'weight',
					label: this.uiLabels.text('pictureViewLayout.weight', 'Weight'),
					value: this.weight(document),
				},
			];
			return values
				.filter((entry) => entry.value != null && entry.value !== '')
				.map((entry) => ({ ...entry, value: String(entry.value) }));
		}
		const prefixes = this.kind() === 'EXIF' ? ['imd'] : ['iptc', 'picture'];
		return Object.entries(document?.properties || {})
			.filter(
				([key, value]) =>
					prefixes.includes(key.split(':')[0]) &&
					!['picture:info', 'picture:views'].includes(key) &&
					!preferences.hiddenSchemas.includes(key.split(':')[0]) &&
					!preferences.hiddenFields.includes(key) &&
					this.policy.canRead(document, key) &&
					value != null &&
					value !== '' &&
					(!Array.isArray(value) || value.length > 0),
			)
			.map(([key, value]) => ({
				key,
				label: this.label(key),
				value: this.formatField(key, value),
			}));
	});
	private weight(document: any): string {
		if (!this.policy.canRead(document, 'file:content')) return '';
		const length = Number(document?.properties?.['file:content']?.length);
		return Number.isFinite(length) && length > 0 ? this.fileSize.transform(length, 2) : '';
	}
	private label(key: string): string {
		const labels: Record<string, string> = {
			'imd:iso_speed_ratings': 'ISO',
			'imd:fnumber': 'Aperture',
			'imd:exposure_time': 'Exposure',
			'imd:date_time_original': this.uiLabels.text('app.labels.date-taken-a2f4fe', 'Date taken'),
			'imd:xresolution': this.uiLabels.text(
				'app.labels.horizontal-resolution-cc9eae',
				'Horizontal resolution',
			),
			'imd:yresolution': this.uiLabels.text(
				'app.labels.vertical-resolution-415b15',
				'Vertical resolution',
			),
		};
		return (
			labels[key] ||
			key
				.split(':')
				.pop()!
				.replace(/([a-z])([A-Z])/g, '$1 $2')
				.replace(/[_-]/g, ' ')
				.replace(/^./, (s) => s.toUpperCase())
		);
	}
	private formatField(key: string, value: unknown): string {
		const text = this.format(value);
		if (key === 'imd:date_time_original') {
			const date = new Date(String(value));
			if (!Number.isNaN(date.getTime()))
				return new Intl.DateTimeFormat(this.uiLabels.locale(), {
					dateStyle: 'medium',
					timeStyle: 'short',
				}).format(date);
		}
		if (key === 'imd:fnumber') return text.startsWith('f/') ? text : `f/${text}`;
		if (key === 'imd:exposure_time') return /s$/i.test(text) ? text : `${text} s`;
		if (['imd:xresolution', 'imd:yresolution'].includes(key))
			return /dpi$/i.test(text) ? text : `${text} dpi`;
		return text;
	}

	private format(value: unknown): string {
		if (Array.isArray(value)) return value.map((item) => this.format(item)).join(', ');
		if (value && typeof value === 'object')
			return Object.entries(value)
				.map(([key, item]) => `${this.label(key)}: ${this.format(item)}`)
				.join('; ');
		return typeof value === 'number'
			? new Intl.NumberFormat(this.uiLabels.locale()).format(value)
			: String(value ?? '');
	}
}
