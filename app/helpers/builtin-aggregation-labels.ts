/** Only these built-in aggregate/value pairs are application messages (stock `label.ui.aggregate.*` keys). User names and IDs stay literal. */
const DATE_BUCKETS: Readonly<Record<string, { labelKey: string; label: string }>> = {
	last24h: { labelKey: 'label.ui.aggregate.last24h', label: 'Last 24h' },
	lastWeek: { labelKey: 'label.ui.aggregate.lastWeek', label: 'Last week' },
	lastMonth: { labelKey: 'label.ui.aggregate.lastMonth', label: 'Last month' },
	lastYear: { labelKey: 'label.ui.aggregate.lastYear', label: 'Last year' },
	priorToLastYear: {
		labelKey: 'label.ui.aggregate.priorToLastYear',
		label: 'More than 1 year ago',
	},
};
const SIZE_BUCKETS = {
	tiny: 'label.ui.aggregate.tiny',
	small: 'label.ui.aggregate.small',
	medium: 'label.ui.aggregate.medium',
	big: 'label.ui.aggregate.big',
	huge: 'label.ui.aggregate.huge',
};
const PIXEL_BUCKETS = {
	to_500_px: 'label.ui.aggregate.to_500_px',
	from_500_to_1500_px: 'label.ui.aggregate.from_500_to_1500_px',
	from_1500_to_2000_px: 'label.ui.aggregate.from_1500_to_2000_px',
	from_2000_px: 'label.ui.aggregate.from_2000_px',
};
const DURATION_BUCKETS = {
	to_30_s: 'label.ui.aggregate.to_30_s',
	from_30_to_180_s: 'label.ui.aggregate.from_30_to_180_s',
	from_180_to_600_s: 'label.ui.aggregate.from_180_to_600_s',
	from_600_to_1800_s: 'label.ui.aggregate.from_600_to_1800_s',
	from_1800_s: 'label.ui.aggregate.from_1800_s',
};
const RANGE_KEYS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
	common_size_agg: SIZE_BUCKETS,
	asset_width_agg: PIXEL_BUCKETS,
	asset_height_agg: PIXEL_BUCKETS,
	video_duration_agg: DURATION_BUCKETS,
};
export function builtinAggregationLabel(
	name: string,
	key: string,
): { labelKey?: string; label?: string } {
	if (name === 'dc_modified_agg') return Object.hasOwn(DATE_BUCKETS, key) ? DATE_BUCKETS[key] : {};
	const ranges = Object.hasOwn(RANGE_KEYS, name) ? RANGE_KEYS[name] : undefined;
	return ranges && Object.hasOwn(ranges, key) ? { labelKey: ranges[key] } : {};
}
