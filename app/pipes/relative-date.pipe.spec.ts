import { RelativeDatePipe, stockRelativeDate } from './relative-date.pipe';

describe('Stock relative date (moment `to`)', () => {
	const now = new Date(2026, 10, 6, 17, 0, 0);
	const later = (milliseconds: number) => new Date(now.getTime() + milliseconds);
	const second = 1000;
	const hour = 3600 * second;
	const day = 24 * hour;

	it('uses moment thresholds and English wording', () => {
		const en = (date: Date) => stockRelativeDate(date, 'en-US', now);
		expect(en(later(44 * second))).toBe('in a few seconds');
		expect(en(later(45 * second))).toBe('in a minute');
		expect(en(later(90 * second))).toBe('in 2 minutes');
		expect(en(later(21 * hour))).toBe('in 21 hours');
		expect(en(later(22 * hour))).toBe('in a day');
		expect(en(later(5 * day + 60 * second))).toBe('in 5 days');
		expect(en(later(25 * day))).toBe('in 25 days');
		expect(en(later(26 * day))).toBe('in a month');
		expect(en(new Date(2027, 1, 6, 17, 0, 0))).toBe('in 3 months');
		expect(en(new Date(2028, 0, 6, 17, 0, 0))).toBe('in a year');
		expect(en(new Date(2028, 10, 6, 17, 0, 0))).toBe('in 2 years');
		expect(en(later(-5 * day))).toBe('5 days ago');
		expect(en(now)).toBe('a few seconds ago');
		expect(stockRelativeDate(new Date(2027, 1, 28), 'en', new Date(2027, 0, 31))).toBe(
			'in a month',
		);
	});

	it('uses the moment locale of the UI language', () => {
		const inFiveDays = later(5 * day + 60 * second);
		expect(stockRelativeDate(inFiveDays, 'fr', now)).toBe('dans 5 jours');
		expect(stockRelativeDate(inFiveDays, 'es', now)).toBe('en 5 días');
		expect(stockRelativeDate(inFiveDays, 'it', now)).toBe('tra 5 giorni');
		expect(stockRelativeDate(inFiveDays, 'pt-PT', now)).toBe('em 5 dias');
		expect(stockRelativeDate(inFiveDays, 'ro', now)).toBe('peste 5 zile');
		expect(stockRelativeDate(later(20 * day), 'ro', now)).toBe('peste 20 de zile');
		expect(stockRelativeDate(inFiveDays, 'ar', now)).toBe('بعد ٥ أيام');
		expect(stockRelativeDate(later(2 * day), 'ar', now)).toBe('بعد يومين');
		expect(stockRelativeDate(later(-11 * day), 'ar', now)).toBe('منذ ١١ يومًا');
		expect(stockRelativeDate(inFiveDays, 'de', now)).toBe('in 5 days');
	});

	it('renders nothing for a missing or invalid date', () => {
		expect(stockRelativeDate(undefined, 'en', now)).toBe('');
		expect(stockRelativeDate('', 'en', now)).toBe('');
		expect(stockRelativeDate('not a date', 'en', now)).toBe('');
		expect(
			new RelativeDatePipe().transform(new Date(Date.now() + 5 * day + 60 * second), 'en-US'),
		).toBe('in 5 days');
	});
});
