import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TooltipConfig } from 'ngx-bootstrap/tooltip';
import { ToolbarActionComponent } from './toolbar-action.component';

describe('Selection action tooltip viewport positioning', () => {
	let fixture: ComponentFixture<ToolbarActionComponent>;
	const settlePosition = async () => {
		await new Promise((resolve) => setTimeout(resolve, 350));
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	};

	beforeEach(() => {
		TestBed.configureTestingModule({
			imports: [ToolbarActionComponent],
			providers: [
				{
					provide: TooltipConfig,
					// Match the application's default: action tooltips must opt into overflow handling.
					useValue: Object.assign(new TooltipConfig(), { adaptivePosition: false }),
				},
			],
		});
		fixture = TestBed.createComponent(ToolbarActionComponent);
		fixture.componentRef.setInput('context', {
			availableCommands: ['trash'],
			selectedDocuments: [],
			document: null,
			busy: false,
			execute: jasmine.createSpy('execute'),
		});
		fixture.componentRef.setInput('command', 'trash');
		fixture.componentRef.setInput('label', 'Move selected documents to trash');
		fixture.detectChanges();
	});

	afterEach(() => fixture.destroy());

	for (const edge of ['left', 'right']) {
		it(`keeps a focused ${edge}-edge action's label inside the viewport and below its button`, async () => {
			const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
			Object.assign(button.style, { position: 'fixed', top: '100px', [edge]: '0px' });
			button.focus();
			await settlePosition();
			const tooltip = document.getElementById(button.getAttribute('aria-describedby')!)!;
			expect(tooltip)
				.withContext('Focused actions expose their tooltip description')
				.not.toBeNull();
			const bounds = tooltip.getBoundingClientRect();
			expect(bounds.width).toBeGreaterThan(button.getBoundingClientRect().width);
			expect(bounds.left).toBeGreaterThanOrEqual(1);
			expect(bounds.right).toBeLessThanOrEqual(window.innerWidth - 1);
			expect(bounds.top).toBeGreaterThanOrEqual(button.getBoundingClientRect().bottom);
			expect(tooltip.textContent?.trim()).toBe('Move selected documents to trash');
			expect(button.getAttribute('aria-label')).toBe('Move selected documents to trash');
			button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			await settlePosition();
			expect(document.getElementById(tooltip.id)).toBeNull();
		});
	}
});
