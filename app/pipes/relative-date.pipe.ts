import { Pipe, PipeTransform } from '@angular/core';

type RelativeUnit = 's' | 'ss' | 'm' | 'mm' | 'h' | 'hh' | 'd' | 'dd' | 'M' | 'MM' | 'y' | 'yy';
type RelativeText =
	| string
	| ((count: number, withoutSuffix: boolean, unit: RelativeUnit) => string);
interface RelativeLocale {
	readonly future: string;
	readonly past: string;
	readonly units: Readonly<Record<RelativeUnit, RelativeText>>;
	readonly postformat?: (text: string) => string;
}

/** Romanian `relativeTimeWithPlural` (moment locale/ro.js). */
function romanian(word: string): RelativeText {
	return (count) =>
		`${count}${count % 100 >= 20 || (count >= 100 && count % 100 === 0) ? ' de ' : ' '}${word}`;
}

/** Arabic `pluralize` (moment locale/ar.js): forms for 0, 1, 2 (without/with suffix), 3-10, 11-99, 100+. */
function arabic(
	forms: readonly [string, string, readonly [string, string], string, string, string],
) {
	return (count: number, withoutSuffix: boolean): string => {
		const form =
			count === 0
				? 0
				: count === 1
					? 1
					: count === 2
						? 2
						: count % 100 >= 3 && count % 100 <= 10
							? 3
							: count % 100 >= 11
								? 4
								: 5;
		const text = form === 2 ? forms[2][withoutSuffix ? 0 : 1] : (forms[form] as string);
		return text.replace(/%d/i, String(count));
	};
}

const AR_SECONDS = arabic([
	'أقل من ثانية',
	'ثانية واحدة',
	['ثانيتان', 'ثانيتين'],
	'%d ثوان',
	'%d ثانية',
	'%d ثانية',
]);
const AR_MINUTES = arabic([
	'أقل من دقيقة',
	'دقيقة واحدة',
	['دقيقتان', 'دقيقتين'],
	'%d دقائق',
	'%d دقيقة',
	'%d دقيقة',
]);
const AR_HOURS = arabic([
	'أقل من ساعة',
	'ساعة واحدة',
	['ساعتان', 'ساعتين'],
	'%d ساعات',
	'%d ساعة',
	'%d ساعة',
]);
const AR_DAYS = arabic([
	'أقل من يوم',
	'يوم واحد',
	['يومان', 'يومين'],
	'%d أيام',
	'%d يومًا',
	'%d يوم',
]);
const AR_MONTHS = arabic([
	'أقل من شهر',
	'شهر واحد',
	['شهران', 'شهرين'],
	'%d أشهر',
	'%d شهرا',
	'%d شهر',
]);
const AR_YEARS = arabic([
	'أقل من عام',
	'عام واحد',
	['عامان', 'عامين'],
	'%d أعوام',
	'%d عامًا',
	'%d عام',
]);

/** moment 2.30 relative-time data shipped with the stock UI (@nuxeo/moment core and locale/*.js). */
const RELATIVE_LOCALES: Readonly<Record<string, RelativeLocale>> = {
	en: {
		future: 'in %s',
		past: '%s ago',
		units: {
			s: 'a few seconds',
			ss: '%d seconds',
			m: 'a minute',
			mm: '%d minutes',
			h: 'an hour',
			hh: '%d hours',
			d: 'a day',
			dd: '%d days',
			M: 'a month',
			MM: '%d months',
			y: 'a year',
			yy: '%d years',
		},
	},
	fr: {
		future: 'dans %s',
		past: 'il y a %s',
		units: {
			s: 'quelques secondes',
			ss: '%d secondes',
			m: 'une minute',
			mm: '%d minutes',
			h: 'une heure',
			hh: '%d heures',
			d: 'un jour',
			dd: '%d jours',
			M: 'un mois',
			MM: '%d mois',
			y: 'un an',
			yy: '%d ans',
		},
	},
	es: {
		future: 'en %s',
		past: 'hace %s',
		units: {
			s: 'unos segundos',
			ss: '%d segundos',
			m: 'un minuto',
			mm: '%d minutos',
			h: 'una hora',
			hh: '%d horas',
			d: 'un día',
			dd: '%d días',
			M: 'un mes',
			MM: '%d meses',
			y: 'un año',
			yy: '%d años',
		},
	},
	it: {
		future: 'tra %s',
		past: '%s fa',
		units: {
			s: 'alcuni secondi',
			ss: '%d secondi',
			m: 'un minuto',
			mm: '%d minuti',
			h: "un'ora",
			hh: '%d ore',
			d: 'un giorno',
			dd: '%d giorni',
			M: 'un mese',
			MM: '%d mesi',
			y: 'un anno',
			yy: '%d anni',
		},
	},
	pt: {
		future: 'em %s',
		past: 'há %s',
		units: {
			s: 'segundos',
			ss: '%d segundos',
			m: 'um minuto',
			mm: '%d minutos',
			h: 'uma hora',
			hh: '%d horas',
			d: 'um dia',
			dd: '%d dias',
			M: 'um mês',
			MM: '%d meses',
			y: 'um ano',
			yy: '%d anos',
		},
	},
	ro: {
		future: 'peste %s',
		past: '%s în urmă',
		units: {
			s: 'câteva secunde',
			ss: romanian('secunde'),
			m: 'un minut',
			mm: romanian('minute'),
			h: 'o oră',
			hh: romanian('ore'),
			d: 'o zi',
			dd: romanian('zile'),
			M: 'o lună',
			MM: romanian('luni'),
			y: 'un an',
			yy: romanian('ani'),
		},
	},
	ar: {
		future: 'بعد %s',
		past: 'منذ %s',
		units: {
			s: AR_SECONDS,
			ss: AR_SECONDS,
			m: AR_MINUTES,
			mm: AR_MINUTES,
			h: AR_HOURS,
			hh: AR_HOURS,
			d: AR_DAYS,
			dd: AR_DAYS,
			M: AR_MONTHS,
			MM: AR_MONTHS,
			y: AR_YEARS,
			yy: AR_YEARS,
		},
		postformat: (text) =>
			text.replace(/\d/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]).replace(/,/g, '،'),
	},
};

function isLeapYear(year: number): boolean {
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
	const modMonth = ((month % 12) + 12) % 12;
	const actualYear = year + (month - modMonth) / 12;
	return modMonth === 1 ? (isLeapYear(actualYear) ? 29 : 28) : 31 - ((modMonth % 7) % 2);
}

/** moment `add(months, 'M')`: the same day, clamped to the target month's last day. */
function addMonths(date: Date, months: number): Date {
	const result = new Date(date.getTime());
	if (months) {
		const month = date.getMonth() + months;
		const day = date.getDate();
		result.setMonth(month, day < 29 ? day : Math.min(day, daysInMonth(date.getFullYear(), month)));
	}
	return result;
}

/** moment `positiveMomentsDifference`: whole calendar months, then the remaining milliseconds. */
function positiveDifference(base: Date, other: Date): { months: number; milliseconds: number } {
	let months = other.getMonth() - base.getMonth() + (other.getFullYear() - base.getFullYear()) * 12;
	if (addMonths(base, months).getTime() > other.getTime()) months--;
	return { months, milliseconds: other.getTime() - addMonths(base, months).getTime() };
}

const daysToMonths = (days: number): number => (days * 4800) / 146097;
const monthsToDays = (months: number): number => (months * 146097) / 4800;

/**
 * Stock nuxeo-date `format="relative"`: moment's `moment().to(date)` with its default thresholds
 * (ss 44, s 45, m 45, h 22, d 26, M 11; no weeks) in the UI language's moment locale
 * (nuxeo-format-behavior.js `_formatDate`, `_languageCode`).
 */
export function stockRelativeDate(
	value: string | number | Date | null | undefined,
	locale: string,
	now: Date = new Date(),
): string {
	if (value === null || value === undefined || value === '') return '';
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	const data = RELATIVE_LOCALES[String(locale).split('-')[0]] ?? RELATIVE_LOCALES['en'];
	// moment `momentsDifference(now, date)` as a duration of months and milliseconds.
	const forward = now.getTime() < date.getTime();
	const difference = forward ? positiveDifference(now, date) : positiveDifference(date, now);
	const sign = forward ? 1 : -1;
	const signedValue =
		Math.floor(Math.round(monthsToDays(sign * difference.months)) * 864e5) +
		sign * difference.milliseconds;
	// moment `relativeTime$1` on the absolute duration.
	const months = difference.months;
	const milliseconds = difference.milliseconds;
	const wholeDays = Math.round(monthsToDays(months));
	const seconds = Math.round(wholeDays * 86400 + milliseconds / 1000);
	const minutes = Math.round(wholeDays * 1440 + milliseconds / 6e4);
	const hours = Math.round(wholeDays * 24 + milliseconds / 36e5);
	const days = Math.round(wholeDays + milliseconds / 864e5);
	const exactMonths = months + daysToMonths(milliseconds / 864e5);
	const monthCount = Math.round(exactMonths);
	const years = Math.round(exactMonths / 12);
	// moment passes no count for the singular units, so they render with 1.
	const [unit, count]: [RelativeUnit, number] =
		seconds <= 44
			? ['s', seconds]
			: seconds < 45
				? ['ss', seconds]
				: minutes <= 1
					? ['m', 1]
					: minutes < 45
						? ['mm', minutes]
						: hours <= 1
							? ['h', 1]
							: hours < 22
								? ['hh', hours]
								: days <= 1
									? ['d', 1]
									: days < 26
										? ['dd', days]
										: monthCount <= 1
											? ['M', 1]
											: monthCount < 11
												? ['MM', monthCount]
												: years <= 1
													? ['y', 1]
													: ['yy', years];
	const text = data.units[unit];
	const number = count || 1;
	const output =
		typeof text === 'function' ? text(number, false, unit) : text.replace(/%d/i, String(number));
	const sentence = (signedValue > 0 ? data.future : data.past).replace(/%s/i, output);
	return data.postformat ? data.postformat(sentence) : sentence;
}

/**
 * The stock relative date (nuxeo-date `format="relative"`), computed when the date or the language
 * changes, like the stock element's binding; it does not tick on its own.
 */
@Pipe({ name: 'nxRelativeDate' })
export class RelativeDatePipe implements PipeTransform {
	transform(value: string | number | Date | null | undefined, locale: string): string {
		return stockRelativeDate(value, locale);
	}
}
