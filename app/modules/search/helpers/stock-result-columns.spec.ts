import type { ResultsProjectionColumn } from '@maretha/webui-sdk';
import { applyResultColumnLayout } from 'app/modules/explorer/helpers/scoped-result-columns';
import { stockResultColumnWidths, userResultColumnLayout } from './stock-result-columns';

describe('Stock result column sizing', () => {
	it('matches the measured stock table, resizes flexible columns and preserves only user widths', () => {
		const columns: readonly ResultsProjectionColumn[] = [
			{ id: 'title', label: 'Title', hidden: true, flex: 50 },
			{ id: 'path', label: 'Path', flex: 100 },
			{ id: 'size', label: 'Size', flex: 10 },
			{ id: 'modified', label: 'Modified', flex: 50 },
			{ id: 'lastContributor', label: 'Last contributor', flex: 50 },
		];
		// Polymer's 1596px table allocates 2px to its frame and 19.5px to the settings gutter; the AG
		// projection reserves 4px and a 32px settings column. Compare the same 1510.5px data area by
		// including those extra 14.5px in the projection width.
		const measured = stockResultColumnWidths(columns, 1610.5, true);
		expect(measured[0].width).toBeUndefined();
		// Live Polymer at 1680px: 583.58px Path, 193.36px Size, 366.78px dates/people.
		expect(measured[1].width).toBeCloseTo(583.58, 1);
		expect(measured[2].width).toBeCloseTo(193.36, 1);
		expect(measured[3].width).toBeCloseTo(366.78, 1);
		const reordered = [measured[2], measured[1], measured[3], measured[4]].map(({ id, width }) => ({
			id,
			width,
		}));
		const savedOrder = userResultColumnLayout(reordered, [], measured);
		expect(savedOrder).toEqual([
			{ id: 'size' },
			{ id: 'path' },
			{ id: 'modified' },
			{ id: 'lastContributor' },
		]);
		const resized = userResultColumnLayout([{ id: 'path', width: 480 }], savedOrder, measured);
		expect(resized).toEqual([{ id: 'path', width: 480 }]);
		const configured = applyResultColumnLayout(columns, resized);
		const narrow = stockResultColumnWidths(configured, 1298, true);
		const wide = stockResultColumnWidths(configured, 1596, true);
		expect(narrow.find((column) => column.id === 'path')?.width).toBe(480);
		expect(wide.find((column) => column.id === 'path')?.width).toBe(480);
		expect(wide.find((column) => column.id === 'size')!.width!).toBeGreaterThan(
			narrow.find((column) => column.id === 'size')!.width!,
		);
		expect(userResultColumnLayout([{ id: 'path', width: 480 }], resized, wide)).toEqual(resized);
	});
});
