import { builtinAggregationLabel } from './builtin-aggregation-labels';

describe('built-in aggregate label origin', () => {
	it('identifies known date and range buckets only inside their own aggregate family', () => {
		expect(builtinAggregationLabel('dc_modified_agg', 'lastWeek').labelKey).toBe(
			'label.ui.aggregate.lastWeek',
		);
		expect(builtinAggregationLabel('common_size_agg', 'tiny').labelKey).toBe(
			'label.ui.aggregate.tiny',
		);
		expect(builtinAggregationLabel('asset_width_agg', 'to_500_px').labelKey).toBe(
			'label.ui.aggregate.to_500_px',
		);
		for (const name of ['dc_creator_agg', 'dc_last_contributor_agg', 'custom_agg'])
			for (const key of ['lastWeek', 'tiny', 'to_500_px'])
				expect(builtinAggregationLabel(name, key)).toEqual({});
	});
	it('does not interpret unknown or prototype-like identifiers as message keys', () => {
		for (const key of ['customer-range', '__proto__', 'constructor']) {
			expect(builtinAggregationLabel('dc_modified_agg', key)).toEqual({});
			expect(builtinAggregationLabel('common_size_agg', key)).toEqual({});
			expect(builtinAggregationLabel(key, 'tiny')).toEqual({});
		}
	});
});
