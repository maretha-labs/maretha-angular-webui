import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Directive, Input } from '@angular/core';
import { LazyLoadDirective } from 'app/directives/lazy-load.directive';

import { ThreedRendererComponent } from './threed-renderer.component';

describe('ThreedRendererComponent', () => {
	let component: ThreedRendererComponent;
	let fixture: ComponentFixture<ThreedRendererComponent>;

	beforeEach(async () => {
		TestBed.overrideComponent(ThreedRendererComponent, {
			set: { template: '<div #modelViewer></div>', imports: [] },
		});
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [ThreedRendererComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(ThreedRendererComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('document', fixtureDocument());
		fixture.detectChanges();
	});

	it('has no model source until a document blob is given', () => {
		expect(component.contentUrl).toBe('');
	});

	it('updates the model element when rotation is toggled', () => {
		component.autoRotate = false;
		component.toggleAutoRotate();
		expect(fixture.nativeElement.querySelector('div').hasAttribute('auto-rotate')).toBeTrue();
		component.toggleAutoRotate();
		expect(fixture.nativeElement.querySelector('div').hasAttribute('auto-rotate')).toBeFalse();
	});
});

@Directive({ selector: '[nxLazyLoad]', standalone: true })
class InertModelSourceDirective {
	@Input() src = '';
}

describe('3D hotspot controls', () => {
	it('keeps view, editable label, and removal independently focusable without nested buttons', async () => {
		// Exercise the real Angular template without requiring a GPU or loading a model.
		const createElement = document.createElement.bind(document);
		spyOn(document, 'createElement').and.callFake(
			(name: string, options?: ElementCreationOptions) =>
				createElement(name === 'model-viewer' ? 'div' : name, options),
		);
		await TestBed.configureTestingModule({
			imports: [ThreedRendererComponent],
			providers: [...legacyTestProviders()],
		})
			.overrideComponent(ThreedRendererComponent, {
				remove: { imports: [LazyLoadDirective] },
				add: { imports: [InertModelSourceDirective] },
			})
			.compileComponents();
		const fixture = TestBed.createComponent(ThreedRendererComponent);
		const component = fixture.componentInstance;
		fixture.componentRef.setInput('document', fixtureDocument());
		component.hotspots = [
			{ slot: 'hotspot-1', label: 'First view', placement: { surface: '0 0 0' }, user: 'alice' },
		];
		fixture.detectChanges();
		const view = fixture.nativeElement.querySelector('.hotspot-focus') as HTMLButtonElement;
		const editor = fixture.nativeElement.querySelector(
			'.annotation [role="textbox"]',
		) as HTMLElement;
		const remove = fixture.nativeElement.querySelector('.btn-remove-hotspot') as HTMLButtonElement;
		const activate = spyOn(component, 'hotspotAction');
		const add = spyOn(component, 'addHotspot');
		expect(fixture.nativeElement.querySelector('button button')).toBeNull();
		view.focus();
		expect(document.activeElement).toBe(view);
		view.click();
		expect(activate).toHaveBeenCalledWith(component.hotspots[0]);
		editor.focus();
		expect(document.activeElement).toBe(editor);
		editor.click();
		editor.textContent = 'Renamed view';
		editor.dispatchEvent(new Event('input', { bubbles: true }));
		expect(component.hotspots[0].label).toBe('Renamed view');
		remove.focus();
		expect(document.activeElement).toBe(remove);
		remove.click();
		expect(component.hotspots).toEqual([]);
		expect(add).not.toHaveBeenCalled();
		fixture.destroy();
	});
});
