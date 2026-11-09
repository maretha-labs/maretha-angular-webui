import { NgTemplateOutlet } from '@angular/common';
import { Component, Input, TemplateRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { legacyTestProviders } from '../testing/legacy-test-providers';
import { DocumentContentRendererComponent } from './document-content-renderer.component';

@Component({
	imports: [NgTemplateOutlet],
	template: `<p>{{ document?.title }}</p>
		<ng-container *ngTemplateOutlet="mainContentTemplate" />`,
})
class TestContentRenderer {
	@Input() document?: { title: string };
	@Input() noEdit = false;
	@Input() mainContentTemplate?: TemplateRef<unknown>;
}

@Component({
	imports: [DocumentContentRendererComponent],
	template: `<ng-template #response><p>Saved interaction response</p></ng-template>
		<nx-extension-document-content
			[document]="document()"
			[noEdit]="readOnly()"
			[mainContentTemplate]="response"
		/>`,
})
class TestContentHost {
	document = signal({ title: 'Saved result' });
	readOnly = signal(true);
}

describe('Lazy document content renderer inputs', () => {
	beforeEach(() => {
		// Exercise the public lazy boundary without importing PDF/media implementations.
		spyOn(DocumentContentRendererComponent.prototype, 'load').and.stub();
		TestBed.configureTestingModule({
			imports: [TestContentHost, TestContentRenderer],
			providers: legacyTestProviders(),
		});
	});

	it('projects saved content and forwards read-only state through the lazy renderer', () => {
		const fixture = TestBed.createComponent(TestContentHost);
		fixture.detectChanges();
		const boundary = fixture.debugElement.query(By.directive(DocumentContentRendererComponent))
			.componentInstance as DocumentContentRendererComponent;
		boundary.renderer.set(TestContentRenderer);
		fixture.detectChanges();
		const renderer = fixture.debugElement.query(By.directive(TestContentRenderer))
			.componentInstance as TestContentRenderer;
		expect(renderer.document).toBe(fixture.componentInstance.document());
		expect(renderer.noEdit).toBeTrue();
		expect(renderer.mainContentTemplate).toBe(boundary.mainContentTemplate());
		expect(fixture.nativeElement.textContent).toContain('Saved interaction response');

		fixture.componentInstance.readOnly.set(false);
		fixture.componentInstance.document.set({ title: 'Updated result' });
		fixture.detectChanges();
		expect(renderer.noEdit).toBeFalse();
		expect(renderer.document?.title).toBe('Updated result');
	});
});
