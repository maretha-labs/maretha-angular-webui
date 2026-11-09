import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';
import { WebUiLocale } from './extensions/i18n/webui-locale';

describe('AppComponent', () => {
	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [RouterTestingModule, AppComponent],
		}).compileComponents();
	});

	it('should create the app', () => {
		const fixture = TestBed.createComponent(AppComponent);
		const app = fixture.componentInstance;
		expect(app).toBeTruthy();
	});

	it('renders the routed application shell', () => {
		const fixture = TestBed.createComponent(AppComponent);
		fixture.detectChanges();
		const compiled = fixture.nativeElement as HTMLElement;
		expect(compiled.querySelector('nx-sidebar')).not.toBeNull();
		expect(compiled.querySelector('.nx-main__content router-outlet')).not.toBeNull();
	});
	it('updates language and RTL styles from the shared locale and removes RTL when switching back', () => {
		const saved = localStorage.getItem('lang');
		const html = document.documentElement;
		const previousLang = html.getAttribute('lang');
		const previousDir = html.getAttribute('dir');
		localStorage.setItem('lang', 'en-US');
		const fixture = TestBed.createComponent(AppComponent);
		try {
			const locale = TestBed.inject(WebUiLocale);
			locale.setLocale('ar-EG');
			fixture.detectChanges();
			expect(html.lang).toBe('ar');
			expect(html.dir).toBe('rtl');
			expect(document.querySelectorAll('#bootstrap_rtl').length).toBe(1);
			locale.setLocale('fr');
			fixture.detectChanges();
			expect(html.lang).toBe('fr');
			expect(html.dir).toBe('ltr');
			expect(document.getElementById('bootstrap_rtl')).toBeNull();
		} finally {
			fixture.destroy();
			if (saved === null) localStorage.removeItem('lang');
			else localStorage.setItem('lang', saved);
			if (previousLang === null) html.removeAttribute('lang');
			else html.setAttribute('lang', previousLang);
			if (previousDir === null) html.removeAttribute('dir');
			else html.setAttribute('dir', previousDir);
		}
	});
	it('gives routed flex pages a usable viewport even when their contents are positioned', () => {
		const fixture = TestBed.createComponent(AppComponent);
		fixture.detectChanges();
		const content = fixture.nativeElement.querySelector('.nx-main__content') as HTMLElement;
		const page = document.createElement('section');
		page.style.cssText = 'display:flex;flex:1;min-height:0;position:relative';
		const viewport = document.createElement('div');
		viewport.style.cssText = 'position:absolute;inset:0';
		page.appendChild(viewport);
		content.appendChild(page);
		expect(viewport.getBoundingClientRect().height).toBeGreaterThan(100);
		expect(viewport.getBoundingClientRect().height).toBeCloseTo(
			content.getBoundingClientRect().height,
			0,
		);
	});
});
