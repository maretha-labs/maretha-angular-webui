import { localizedMessage } from 'app/helpers/localized-message';
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
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { formatDate } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription, forkJoin } from 'rxjs';
import { PageContext, WebUiIconComponent, WebUiMessages } from '@maretha/webui-sdk';
import { environment } from 'environments/environment';
import { DocumentLinkPipe } from 'app/helpers/document-route';
import {
	DocumentComparisonService,
	ComparisonCell,
	ComparisonProperty,
} from 'app/modules/explorer/helpers/document-comparison.service';
import { ComparisonValueComponent } from 'app/modules/explorer/components/viewers/document-comparison/comparison-value.component';

@Component({
	selector: 'nx-comparison-page',
	imports: [
		FormsModule,
		RouterLink,
		DocumentLinkPipe,
		ComparisonValueComponent,
		WebUiIconComponent,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: ` <header>
			{{ 'app.components.comparison-page.compare-11a835' | webuiMessage: 'Compare' }}
			@if (left(); as doc) {
				<a [routerLink]="doc | documentLink">{{ doc['title'] }}</a>
			}

			{{ 'diffPage.versus' | webuiMessage: 'Vs.' }}
			@if (right(); as doc) {
				<a [routerLink]="doc | documentLink">{{ doc['title'] }}</a>
			}
		</header>
		<main>
			@if (loading()) {
				<p role="status">
					{{
						'app.components.comparison-page.loading-documents-24cc43'
							| webuiMessage: 'Loading documents…'
					}}
				</p>
			}
			@if (error()) {
				<p role="alert">{{ error() }}</p>
				<button type="button" (click)="retry.update(increment)">
					{{ 'app.components.comparison-page.retry-b82db2' | webuiMessage: 'Retry' }}
				</button>
			}
			@if (left() && right()) {
				<div class="controls">
					<label
						><input type="checkbox" [ngModel]="showAll()" (ngModelChange)="showAll.set($event)" />

						{{ 'diff.controls.showAll' | webuiMessage: 'View All Data' }}</label
					>
					<label class="unified-switch"
						><input
							type="checkbox"
							role="switch"
							[ngModel]="unified()"
							(ngModelChange)="unified.set($event)"
						/>{{ 'app.components.comparison-page.unified' | webuiMessage: 'Unified View' }}</label
					>
				</div>
				<div class="selectors">
					<label
						><span class="visually-hidden">{{
							'app.components.comparison-page.left-document-b1d815' | webuiMessage: 'Left document'
						}}</span
						><select [ngModel]="leftId()" (ngModelChange)="select('left', $event)">
							@for (doc of documents(); track doc['uid']) {
								<option [value]="doc['uid']">{{ title(doc) }}</option>
							}
						</select></label
					>
					<button
						type="button"
						[attr.aria-label]="'diff.controls.switchSides.tooltip' | webuiMessage: 'Switch Sides'"
						[attr.title]="'diff.controls.switchSides.tooltip' | webuiMessage: 'Switch Sides'"
						(click)="swap()"
					>
						<nx-webui-icon name="nuxeo:switch-sides" />
					</button>
					<label
						><span class="visually-hidden">{{
							'app.components.comparison-page.right-document-06d484'
								| webuiMessage: 'Right document'
						}}</span
						><select [ngModel]="rightId()" (ngModelChange)="select('right', $event)">
							@for (doc of documents(); track doc['uid']) {
								<option [value]="doc['uid']">{{ title(doc) }}</option>
							}
						</select></label
					>
				</div>
				@for (group of groups(); track group.name) {
					<details open>
						<summary>{{ group.name }}</summary>
						@for (property of group.properties; track property.name) {
							<div class="comparison-row" [class.unified]="unified()">
								@if (!unified()) {
									<div class="value">
										<h3>{{ fieldLabel(property) }}</h3>
										<nx-comparison-value
											[document]="left()!"
											[property]="displayProperty(property)"
											[cell]="displayCell(left()!, property, right()!)"
											[mode]="'split-left'"
										/>
									</div>
								}
								<div class="value" [class.changed]="cell(right()!, property, left()!).changed">
									<h3>{{ fieldLabel(property) }}</h3>
									<nx-comparison-value
										[document]="right()!"
										[property]="displayProperty(property)"
										[cell]="displayCell(right()!, property, left()!)"
										[mode]="unified() ? 'unified' : 'split-right'"
									/>
								</div>
							</div>
						}
					</details>
				} @empty {
					<p>
						{{
							'app.components.comparison-page.no-differences-82d964'
								| webuiMessage: 'No differences.'
						}}
					</p>
				}
			}
		</main>`,
	styles: `
		:host {
			display: flex;
			flex: 1;
			min-height: 0;
			min-width: 0;
			flex-direction: column;
			color: var(--nuxeo-text-default);
		}
		header {
			min-height: 53px;
			padding: 16px 76px 16px 16px;
			background: var(--nuxeo-box);
			border-bottom: 1px solid var(--nuxeo-border);
			overflow-wrap: anywhere;
		}
		header a {
			color: var(--nuxeo-link-color, var(--nuxeo-primary-color));
		}
		main {
			overflow: auto;
			padding: 24px;
		}
		.controls {
			display: flex;
			justify-content: flex-end;
			align-items: center;
			gap: 20px;
			margin-bottom: 20px;
		}
		.controls label {
			display: flex;
			align-items: center;
			gap: 8px;
		}
		button,
		select {
			font: inherit;
			color: inherit;
			border: 0;
			border-bottom: 1px solid var(--nuxeo-border);
			background: var(--nuxeo-box);
			padding: 8px;
		}
		button:focus-visible,
		select:focus-visible {
			outline: 2px solid var(--nuxeo-primary-color);
		}
		.selectors {
			display: grid;
			grid-template-columns: minmax(0, 1fr) 40px minmax(0, 1fr);
			gap: 16px;
			margin-bottom: 20px;
		}
		.selectors label,
		select {
			width: 100%;
			min-width: 0;
		}
		details {
			margin-bottom: 24px;
		}
		summary {
			cursor: pointer;
			font-size: 14px;
			font-weight: 600;
			margin: 0;
			padding: 10px 16px;
			background: var(--nuxeo-box);
			border-bottom: 1px solid var(--nuxeo-border);
		}
		.comparison-row {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			background: var(--nuxeo-box);
			border-bottom: 1px solid var(--nuxeo-border);
		}
		.comparison-row.unified {
			grid-template-columns: minmax(0, 1fr);
		}
		.value {
			min-width: 0;
			padding: 12px 16px;
			display: grid;
			grid-template-columns: minmax(100px, 35%) minmax(0, 1fr);
			gap: 12px;
			overflow-wrap: anywhere;
		}
		.value + .value {
			border-inline-start: 1px solid var(--nuxeo-border);
		}
		h3 {
			font-size: 12px;
			font-weight: 400;
			margin: 0;
		}
		@media (max-width: 600px) {
			main {
				padding: 12px;
			}
			.controls {
				justify-content: space-between;
				gap: 8px;
			}
			.selectors {
				gap: 6px;
			}
			.value {
				padding: 8px;
			}
		}
		@media (max-width: 720px) {
			header {
				padding-inline-start: 56px;
			}
		}
	`,
})
export class ComparisonPageComponent {
	readonly context = input.required<PageContext>();
	readonly comparison = inject(DocumentComparisonService);
	private readonly messages = inject(WebUiMessages);
	private readonly http = inject(HttpClient);
	private readonly router = inject(Router);
	private readonly destroy = inject(DestroyRef);
	private request?: Subscription;
	readonly documents = signal<Record<string, any>[]>([]);
	readonly schemas = signal<Record<string, any>[]>([]);
	readonly loading = signal(false);
	private readonly errorMessage = localizedMessage();
	readonly error = this.errorMessage.text;
	readonly retry = signal(0);
	readonly increment = (value: number) => value + 1;
	readonly showAll = signal(false);
	readonly unified = signal(false);
	readonly leftId = computed(() => this.context().query['left'] ?? '');
	readonly rightId = computed(() => this.context().query['right'] ?? '');
	readonly left = computed(() => this.documents().find((doc) => doc['uid'] === this.leftId()));
	readonly right = computed(() => this.documents().find((doc) => doc['uid'] === this.rightId()));
	private readonly loadKey = computed(() =>
		JSON.stringify([
			this.context().query['repository'] ?? 'default',
			[
				...new Set(
					[...(this.context().query['ids'] ?? '').split(','), this.leftId(), this.rightId()].filter(
						Boolean,
					),
				),
			],
			this.retry(),
		]),
	);
	readonly groups = computed(() => {
		const left = this.left();
		const right = this.right();
		if (!left || !right) return [];
		const groups = new Map<string, ComparisonProperty[]>();
		const common = (left['schemas'] ?? []).filter((schema: any) =>
			(right['schemas'] ?? []).some((other: any) => other.name === schema.name),
		);
		const metadata = {
			schemas: common.map((schema: any) => ({
				...schema,
				fields: this.schemas().find((definition) => definition['name'] === schema.name)?.['fields'],
			})),
		};
		for (const property of this.comparison.properties([left, right], metadata)) {
			if (!property.name.startsWith('properties.')) continue;
			const name = property.name.slice(11);
			if (!(name in (left['properties'] ?? {})) || !(name in (right['properties'] ?? {}))) continue;
			if (!this.showAll() && !this.cell(right, property, left).changed) continue;
			const prefix = name.split(':')[0];
			const schema = common.find((item: any) => (item.prefix || item.name) === prefix);
			if (!schema) continue;
			groups.set(schema.name, [...(groups.get(schema.name) ?? []), property]);
		}
		return common
			.map((schema: any) => ({ name: schema.name, properties: groups.get(schema.name) ?? [] }))
			.filter(
				(group: { properties: ComparisonProperty[] }) => this.showAll() || group.properties.length,
			);
	});
	constructor() {
		effect(() => {
			const [repository, ids] = JSON.parse(this.loadKey()) as [string, string[]];
			this.request?.unsubscribe();
			this.documents.set([]);
			this.schemas.set([]);
			this.errorMessage.clear();
			if (ids.length < 2 || ids.length >= 200) {
				this.loading.set(false);
				this.errorMessage.set(
					'app.components.comparison-page.select-between-2-and-199-documents-to-compare',
					'Select between 2 and 199 documents to compare.',
				);
				return;
			}
			this.loading.set(true);
			this.request = forkJoin({
				schemas: this.http.get<Record<string, any>[]>(
					`${environment.nuxeoUrl}/api/v1/config/schemas`,
				),
				documents: forkJoin(
					ids.map((id) =>
						this.http.get<Record<string, any>>(
							`${environment.nuxeoUrl}/api/v1/repo/${encodeURIComponent(repository)}/id/${encodeURIComponent(id)}`,
							{
								headers: {
									properties: '*',
									'fetch-document': 'properties',
									'translate-directoryEntry': 'label',
								},
							},
						),
					),
				),
			}).subscribe({
				next: ({ documents, schemas }) => {
					this.schemas.set(schemas);
					this.documents.set(documents);
					this.loading.set(false);
				},
				error: () => {
					this.errorMessage.set(
						'app.components.comparison-page.unable-to-load-these-documents-they-may-be-missing-or-yo',
						'Unable to load these documents. They may be missing or you may not have access.',
					);
					this.loading.set(false);
				},
			});
		});
		this.destroy.onDestroy(() => this.request?.unsubscribe());
	}
	title(document: Record<string, any>): string {
		const props = document['properties'] ?? {};
		const version =
			this.documents().some((candidate) => candidate['isVersion']) && !document['isCheckedOut']
				? ` (v${props['uid:major_version']}.${props['uid:minor_version']})`
				: '';
		return `${document['title']}${version}`;
	}
	fieldLabel(property: ComparisonProperty): string {
		if (property.labelKey) return this.messages.text(property.labelKey, property.label);
		if (!property.name.startsWith('properties.')) return property.label;
		return this.messages.text(
			`diffObject.property.label.${property.name.slice('properties.'.length)}`,
			property.label.split(':').slice(1).join(':') || property.label,
		);
	}
	cell(
		document: Record<string, any>,
		property: ComparisonProperty,
		baseline?: Record<string, any>,
	): ComparisonCell {
		const cell = this.comparison.cell(document, property, baseline);
		if (!baseline || !cell.changed) return cell;
		return {
			...cell,
			changed: JSON.stringify(diffValue(cell.value)) !== JSON.stringify(diffValue(cell.baseline)),
		};
	}
	displayProperty(property: ComparisonProperty): ComparisonProperty {
		return property.kind === 'date' ? { ...property, kind: 'default' } : property;
	}
	displayCell(
		document: Record<string, any>,
		property: ComparisonProperty,
		baseline?: Record<string, any>,
	): ComparisonCell {
		const cell = this.cell(document, property, baseline);
		if (property.kind !== 'date') return cell;
		const display = (value: unknown) => {
			if (value == null || value === '') return '';
			try {
				return formatDate(String(value), 'longDate', this.messages.locale());
			} catch {
				return value;
			}
		};
		return { ...cell, value: display(cell.value), baseline: display(cell.baseline) };
	}
	select(side: 'left' | 'right', id: string): void {
		const opposite = side === 'left' ? 'right' : 'left';
		const oppositeId = side === 'left' ? this.rightId() : this.leftId();
		const queryParams = { ...this.context().query, [side]: id };
		if (id === oppositeId) queryParams[opposite] = side === 'left' ? this.leftId() : this.rightId();
		void this.router.navigate(['/page/compare'], { queryParams });
	}
	swap(): void {
		void this.router.navigate(['/page/compare'], {
			queryParams: { ...this.context().query, left: this.rightId(), right: this.leftId() },
		});
	}
}

/** Source blob differences depend on content digest, including blobs inside complex fields. */
function diffValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(diffValue);
	if (!value || typeof value !== 'object') return value;
	const record = value as Record<string, unknown>;
	if (
		typeof record['digest'] === 'string' &&
		('mime-type' in record || 'mimeType' in record || 'name' in record)
	)
		return { digest: record['digest'] };
	return Object.fromEntries(
		Object.keys(record)
			.sort()
			.map((key) => [key, diffValue(record[key])]),
	);
}
