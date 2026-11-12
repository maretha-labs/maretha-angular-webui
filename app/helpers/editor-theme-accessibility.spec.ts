import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { BaseEditorComponent } from '../modules/explorer/components/editors/base-editor/base-editor.component';
import { fixtureDocument, legacyTestProviders } from '../testing/legacy-test-providers';

@Component({
	imports: [BaseEditorComponent],
	changeDetection: ChangeDetectionStrategy.Eager,
	template: `<nx-base-editor
		[editorForm]="form"
		[parentDocument]="parent"
		documentType="File"
	></nx-base-editor>`,
})
class EditorThemeHost {
	readonly form = new FormGroup({});
	readonly parent = fixtureDocument();
}

function contrast(foreground: string, background: string): number {
	const luminance = (color: string) => {
		const channels = color
			.match(/[\d.]+/g)
			?.slice(0, 3)
			.map(Number);
		if (!channels || channels.length !== 3) throw new Error(`Expected RGB color, got ${color}`);
		const linear = channels.map((channel) => {
			const value = channel / 255;
			return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
		});
		return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
	};
	const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
	return (values[0] + 0.05) / (values[1] + 0.05);
}

describe('Editor theme accessibility with the real Bootstrap RTL stylesheet', () => {
	let rtlStyles: string;
	let fixture: ComponentFixture<EditorThemeHost>;
	let priorStyle: string | null;
	let priorDirection: string | null;
	let stylesheet: HTMLStyleElement;

	beforeAll(async () => {
		const response = await fetch('/base/node_modules/bootstrap/dist/css/bootstrap.rtl.min.css');
		if (!response.ok) throw new Error(`Bootstrap RTL fixture unavailable: ${response.status}`);
		rtlStyles = await response.text();
	});

	beforeEach(async () => {
		priorStyle = document.documentElement.getAttribute('style');
		priorDirection = document.documentElement.getAttribute('dir');
		await TestBed.configureTestingModule({
			imports: [EditorThemeHost],
			providers: legacyTestProviders(),
		}).compileComponents();
		fixture = TestBed.createComponent(EditorThemeHost);
		fixture.detectChanges();
		stylesheet = document.createElement('style');
		stylesheet.textContent = rtlStyles;
	});

	afterEach(() => {
		stylesheet?.remove();
		fixture?.destroy();
		for (const [name, value] of [
			['style', priorStyle],
			['dir', priorDirection],
		] as const) {
			if (value === null) document.documentElement.removeAttribute(name);
			else document.documentElement.setAttribute(name, value);
		}
	});

	it('wraps enlarged spaced footer labels and retains a full-size close target', () => {
		document.documentElement.style.fontSize = '26px';
		const host: HTMLElement = fixture.nativeElement;
		host.style.cssText =
			'display:block;width:240px;letter-spacing:.12em;word-spacing:.16em;line-height:1.5';
		host.querySelector('.modal-title')!.textContent = 'Customer {long retained title}';
		const close = host.querySelector<HTMLButtonElement>('.btn-close')!;
		expect(close.getBoundingClientRect().width).toBe(32);
		const buttons = host.querySelectorAll<HTMLButtonElement>('.modal-footer > .btn');
		for (const button of buttons) {
			expect(button.scrollWidth)
				.withContext(button.textContent ?? '')
				.toBeLessThanOrEqual(button.clientWidth);
			expect(button.getBoundingClientRect().width).toBeLessThanOrEqual(240);
		}
		expect(buttons[1].getBoundingClientRect().top).toBeGreaterThanOrEqual(
			buttons[0].getBoundingClientRect().bottom,
		);
		const unavailable = host.querySelector<HTMLButtonElement>(
			'.modal-footer [aria-disabled="true"]',
		)!;
		const style = getComputedStyle(unavailable);
		expect(style.opacity).toBe('1');
		expect(style.borderBottomStyle).toBe('dashed');
	});

	for (const theme of [
		{
			name: 'light',
			text: '#3a3a54',
			surface: '#ffffff',
			foreground: 'rgb(58, 58, 84)',
			background: 'rgb(255, 255, 255)',
		},
		{
			name: 'dark',
			text: '#ffffff',
			surface: '#2e2e3e',
			foreground: 'rgb(255, 255, 255)',
			background: 'rgb(46, 46, 62)',
		},
		{
			name: 'custom',
			text: '#112233',
			surface: '#fafafa',
			foreground: 'rgb(17, 34, 51)',
			background: 'rgb(250, 250, 250)',
		},
	]) {
		it(`preserves ${theme.name} form colors, visible focus and the close glyph after late RTL loading`, () => {
			const html = document.documentElement;
			html.style.setProperty('--nuxeo-text-default', theme.text);
			html.style.setProperty('--nuxeo-box', theme.surface);
			html.style.setProperty('--maretha-style-color-text', theme.text);
			html.style.setProperty('--maretha-style-color-surface', theme.surface);
			const host: HTMLElement = fixture.nativeElement;
			host.style.backgroundColor = theme.surface;
			const body = host.querySelector('.modal-body')!;
			const fields = ['input', 'textarea', 'select'].map((tag) => {
				const field = document.createElement(tag) as
					| HTMLInputElement
					| HTMLTextAreaElement
					| HTMLSelectElement;
				field.className = tag === 'select' ? 'form-select' : 'form-control';
				field.style.transition = 'none';
				if (field instanceof HTMLSelectElement) field.add(new Option('Customer draft', 'draft'));
				else field.value = 'Customer {draft}';
				body.appendChild(field);
				return field;
			});
			for (const direction of ['ltr', 'rtl'] as const) {
				html.dir = direction;
				if (direction === 'rtl') document.head.appendChild(stylesheet);
				for (const field of fields) {
					field.focus();
					const style = getComputedStyle(field);
					expect(style.color)
						.withContext(`${direction} ${field.tagName} foreground`)
						.toBe(theme.foreground);
					expect(style.backgroundColor)
						.withContext(`${direction} ${field.tagName} surface`)
						.toBe(theme.background);
					expect(contrast(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
					expect(style.outlineStyle).toBe('solid');
					expect(style.outlineWidth).toBe('2px');
					expect(contrast(style.outlineColor, theme.background)).toBeGreaterThanOrEqual(3);
					expect(field.value).toBe(
						field instanceof HTMLSelectElement ? 'draft' : 'Customer {draft}',
					);
				}
				const footer = host.querySelector('.modal-footer')!;
				expect(getComputedStyle(footer).backgroundColor).toBe(theme.background);
				for (const button of footer.querySelectorAll<HTMLButtonElement>('button')) {
					const buttonStyle = getComputedStyle(button);
					// Link buttons inherit the theme text; the primary action paints its own palette.
					const primary = button.classList.contains('btn-primary');
					if (!primary) expect(buttonStyle.color).toBe(theme.foreground);
					expect(
						contrast(
							buttonStyle.color,
							primary ? buttonStyle.backgroundColor : getComputedStyle(footer).backgroundColor,
						),
					).toBeGreaterThanOrEqual(4.5);
				}
				const close = host.querySelector<HTMLButtonElement>('.btn-close')!;
				close.focus();
				const style = getComputedStyle(close);
				expect(style.backgroundImage).toBe('none');
				expect(style.opacity).toBe('1');
				expect(style.outlineStyle).toBe('solid');
				expect(style.outlineWidth).toBe('2px');
				expect(close.getBoundingClientRect().width).toBeGreaterThanOrEqual(24);
				expect(close.getBoundingClientRect().height).toBeGreaterThanOrEqual(24);
				for (const pseudo of ['::before', '::after']) {
					const glyph = getComputedStyle(close, pseudo);
					expect(glyph.borderTopStyle).toBe('solid');
					expect(glyph.borderTopWidth).toBe('2px');
					expect(contrast(glyph.borderTopColor, theme.background)).toBeGreaterThanOrEqual(3);
				}
			}
		});
	}
});
