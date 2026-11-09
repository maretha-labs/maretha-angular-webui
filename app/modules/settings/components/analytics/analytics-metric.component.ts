import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, ChartData, ChartOptions, Plugin } from 'chart.js';
import {
	WebUiIconComponent,
	WebUiMessagePipe,
	WebUiNumberPipe,
	WebUiMessages,
} from '@maretha/webui-sdk';
import { formatAnalyticsDuration, MetricGroups, MetricRow } from '../../helpers/analytics.service';

/** Stock chart-elements colors (chart-property-behavior). */
const CHART_COLORS = [
	'#3366cc',
	'#ff9900',
	'#dc3912',
	'#109618',
	'#990099',
	'#0099c6',
	'#dd4477',
	'#66aa00',
	'#b82e2e',
	'#316395',
	'#994499',
	'#22aa99',
	'#aaaa11',
	'#6633cc',
	'#e67300',
	'#8b0707',
	'#651067',
	'#329262',
	'#5574a6',
	'#3b3eac',
	'#b77322',
	'#16d620',
	'#b91383',
	'#f4359e',
	'#9c5935',
	'#a9c413',
	'#2a778d',
	'#668d1c',
	'#bea413',
	'#0c5922',
	'#743411',
];

/** Stock chart-pie `_drawValuesInPie`: each slice's value in white, for slices above 5%. */
const PIE_VALUES: Plugin = {
	id: 'nxPieValues',
	afterDatasetsDraw(chart) {
		const data = chart.data.datasets[0]?.data ?? [];
		const value = (index: number) => Number(data[index]) || 0;
		let total = 0;
		for (let index = 0; index < data.length; index++)
			if (chart.getDataVisibility(index)) total += value(index);
		const { ctx } = chart;
		ctx.save();
		ctx.font = `${Chart.defaults.font.size ?? 12}px ${Chart.defaults.font.family ?? 'sans-serif'}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'bottom';
		ctx.fillStyle = '#fff';
		chart.getDatasetMeta(0).data.forEach((arc, index) => {
			if (!value(index) || !chart.getDataVisibility(index)) return;
			if (Math.round((value(index) / total) * 100) <= 5) return;
			const { x, y } = arc.tooltipPosition(true);
			if (x !== null && y !== null) ctx.fillText(String(value(index)), x, y);
		});
		ctx.restore();
	},
};

@Component({
	selector: 'nx-analytics-metric',
	imports: [BaseChartDirective, WebUiIconComponent, WebUiMessagePipe, WebUiNumberPipe],
	template: `<section>
		<h2>{{ heading() }}</h2>
		@if (kind() === 'table') {
			<div class="table-wrap" [style.height.px]="tableHeight()">
				<table>
					<thead>
						<tr>
							@if (showName()) {
								<th>{{ resolvedNameHeader() }}</th>
							}
							@if (showValue()) {
								<th>{{ resolvedValueHeader() }}</th>
							}
							<th class="settings">
								<button
									type="button"
									(click)="settings.set(!settings())"
									[attr.aria-expanded]="settings()"
									[attr.aria-label]="'table.columnSettings' | webuiMessage: 'Column settings'"
								>
									<nx-webui-icon name="nuxeo:settings" />
								</button>
							</th>
						</tr>
					</thead>
					<tbody>
						@for (row of rows(); track row.key) {
							<tr>
								@if (showName()) {
									<td>{{ row.key }}</td>
								}
								@if (showValue()) {
									<td>
										@if (duration()) {
											{{ durationText(row.value) }}
										} @else {
											{{ row.value | webuiNumber }}
										}
									</td>
								}
								<td></td>
							</tr>
						}
						@if (!rows().length) {
							<tr>
								<td colspan="3">
									{{ 'repositoryAnalytics.noResults' | webuiMessage: 'No results.' }}
								</td>
							</tr>
						}
					</tbody>
				</table>
			</div>
			@if (settings()) {
				<fieldset>
					<legend>{{ 'table.columnSettings' | webuiMessage: 'Column settings' }}</legend>
					<label
						><input type="checkbox" [checked]="showName()" (change)="showName.set(!showName())" />{{
							resolvedNameHeader()
						}}</label
					><label
						><input
							type="checkbox"
							[checked]="showValue()"
							(change)="showValue.set(!showValue())"
						/>{{ resolvedValueHeader() }}</label
					>
				</fieldset>
			}
		} @else {
			<div class="chart">
				<canvas
					baseChart
					[type]="kind() === 'pie' ? 'pie' : kind() === 'line' ? 'line' : 'bar'"
					[data]="chartData()"
					[options]="options()"
					[plugins]="plugins()"
					role="img"
					[attr.aria-label]="heading()"
				></canvas>
			</div>
			@if (!rows().length) {
				<p>{{ 'repositoryAnalytics.noResults' | webuiMessage: 'No results.' }}</p>
			}
		}
	</section>`,
	styles: `
		:host {
			display: block;
			min-width: 0;
		}
		section {
			height: 100%;
			min-height: 275px;
			padding: 16px;
			background: var(--nuxeo-box);
			box-shadow: 0 3px 5px rgba(0, 0, 0, 0.04);
			color: var(--nuxeo-text-default);
		}
		/* Stock nuxeo-card heading. */
		h2 {
			margin: 0 0 1em;
			font-size: 14px;
			font-weight: 700;
			letter-spacing: 0.24px;
			line-height: 1.25rem;
			color: inherit;
		}
		table {
			width: 100%;
			border-collapse: collapse;
		}
		th,
		td {
			padding: 20px 24px;
			text-align: start;
			border-bottom: 1px solid var(--nuxeo-border);
			overflow-wrap: anywhere;
		}
		/* Stock nuxeo-data-table header, not the app's uppercase table header. */
		th {
			height: 50px;
			padding-block: 0;
			font-size: 1rem;
			font-weight: 600;
			letter-spacing: normal;
			text-transform: none;
			color: var(--nuxeo-text-default);
			background: var(--nuxeo-box);
		}
		.settings {
			width: 32px;
		}
		.settings button {
			border: 0;
			background: transparent;
			color: inherit;
			padding: 0;
		}
		nx-webui-icon {
			display: block;
			width: 18px;
			height: 18px;
		}
		/* Stock chart-pie and chart-bar in a nuxeo-card. */
		.chart {
			position: relative;
			height: 280px;
			margin-top: 25px;
		}
		.table-wrap {
			max-height: 500px;
			overflow: auto;
		}
		fieldset {
			padding: 8px;
			border: 1px solid var(--nuxeo-border);
		}
		legend {
			font-size: 0.9rem;
		}
		fieldset label {
			display: block;
		}
		input {
			margin-inline-end: 8px;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsMetricComponent {
	readonly heading = input.required<string>();
	readonly rows = input<MetricRow[]>([]);
	readonly kind = input<'pie' | 'bar' | 'line' | 'table'>('table');
	readonly nameHeader = input('');
	private readonly messages = inject(WebUiMessages);
	readonly resolvedNameHeader = computed(
		() => this.nameHeader() || this.messages.text('searchAnalytics.numberOfResults.range', 'Range'),
	);
	readonly resolvedValueHeader = computed(
		() =>
			this.valueHeader() ||
			this.messages.text('searchAnalytics.numberOfResults.calls', 'Number of Calls'),
	);
	readonly valueHeader = input('');
	readonly duration = input(false);
	/** Bars per label, one series each, instead of one bar per row. */
	readonly groups = input<MetricGroups | null>(null);
	readonly tableHeight = input<number | null>(null);
	readonly plugins = computed<Plugin[]>(() => (this.kind() === 'pie' ? [PIE_VALUES] : []));
	readonly settings = signal(false);
	readonly showName = signal(true);
	readonly showValue = signal(true);
	readonly chartData = computed<ChartData>(() => {
		const groups = this.kind() === 'bar' ? this.groups() : null;
		// Stock chart-bar: a dataset per series, colored in order.
		if (groups)
			return {
				labels: groups.labels,
				datasets: groups.series.map((series, index) => ({
					label: series.label,
					data: series.values,
					backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
					borderColor: CHART_COLORS[index % CHART_COLORS.length],
					borderWidth: 1,
				})),
			};
		return {
			labels: this.rows().map((row) => row.key),
			datasets: [
				{
					data: this.rows().map((row) => row.value),
					backgroundColor: this.kind() === 'pie' ? CHART_COLORS : CHART_COLORS[0],
					borderColor: CHART_COLORS[0],
				},
			],
		};
	});
	readonly options = computed<ChartOptions>(() => ({
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			// Stock chart-pie: legend below with 12px boxes; chart-bar: the default legend on top.
			legend:
				this.kind() === 'pie'
					? { display: true, position: 'bottom', labels: { boxWidth: 12 } }
					: { display: this.kind() === 'bar' && !!this.groups(), position: 'top' },
		},
		...(this.kind() === 'pie'
			? {}
			: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }),
	}));
	durationText(milliseconds: number): string {
		return formatAnalyticsDuration(milliseconds, this.messages.locale());
	}
}
