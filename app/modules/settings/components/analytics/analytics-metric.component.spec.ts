import { TestBed } from '@angular/core/testing';
import { AnalyticsMetricComponent } from './analytics-metric.component';

describe('AnalyticsMetricComponent', () => {
	const create = (inputs: Record<string, unknown>) => {
		const fixture = TestBed.createComponent(AnalyticsMetricComponent);
		fixture.componentRef.setInput('heading', 'Heading');
		for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
		fixture.detectChanges();
		return fixture;
	};

	it('draws grouped bars with the stock legend on top', () => {
		const metric = create({
			kind: 'bar',
			rows: [{ key: 'a · t', value: 1 }],
			groups: {
				labels: ['Choose Participants', 'Validate the Document'],
				series: [
					{ label: 'audit-member', values: [15, 7] },
					{ label: 'gpt', values: [10, 1] },
				],
			},
		}).componentInstance;
		const data = metric.chartData();
		expect(data.labels).toEqual(['Choose Participants', 'Validate the Document']);
		expect(data.datasets.map((dataset) => [dataset.label, dataset.data])).toEqual([
			['audit-member', [15, 7]],
			['gpt', [10, 1]],
		]);
		expect(data.datasets.map((dataset) => dataset.backgroundColor)).toEqual(['#3366cc', '#ff9900']);
		expect(metric.options().plugins?.legend).toEqual({ display: true, position: 'top' });
		expect(metric.plugins()).toEqual([]);
	});

	it('draws stock pies: small legend boxes below and values in the slices', () => {
		const metric = create({ kind: 'pie', rows: [{ key: 'gpt', value: 38 }] }).componentInstance;
		expect(metric.options().plugins?.legend).toEqual({
			display: true,
			position: 'bottom',
			labels: { boxWidth: 12 },
		});
		expect(metric.plugins().map((plugin) => plugin.id)).toEqual(['nxPieValues']);
	});

	it('shows durations as stock _asDuration in a table of the requested height', () => {
		const fixture = create({
			rows: [{ key: 'AlexAdmin', value: 16_796_696.6 }],
			duration: true,
			tableHeight: 450,
		});
		const element: HTMLElement = fixture.nativeElement;
		expect(element.querySelector('tbody td:nth-child(2)')?.textContent?.trim()).toBe('4h 39m 56s');
		expect((element.querySelector('.table-wrap') as HTMLElement).style.height).toBe('450px');
	});
});
