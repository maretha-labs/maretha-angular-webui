import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DocumentViewContext } from '@maretha/webui-sdk';
import { DocumentPermissionsViewComponent } from './document-permissions-view.component';

@Component({
	selector: 'nx-document-permissions',
	template: '<output>{{ document()?.uid }} {{ noEdit() }}</output>',
})
class PermissionsStub {
	readonly document = input<any>();
	readonly noEdit = input<boolean>();
}

describe('DocumentPermissionsViewComponent', () => {
	it('hands the routed document and edit mode to the permissions table', () => {
		TestBed.configureTestingModule({ imports: [DocumentPermissionsViewComponent] });
		TestBed.overrideComponent(DocumentPermissionsViewComponent, {
			set: { imports: [PermissionsStub] },
		});
		const fixture = TestBed.createComponent(DocumentPermissionsViewComponent);
		const context = (document: any, noEdit: boolean): DocumentViewContext => ({ document, noEdit });
		fixture.componentRef.setInput('context', context({ uid: 'one', type: 'File' }, false));
		fixture.detectChanges();
		const host = fixture.nativeElement as HTMLElement;
		expect(host.querySelector('output')?.textContent).toBe('one false');
		expect(getComputedStyle(host).display).toBe('block');
		fixture.componentRef.setInput('context', context({ uid: 'two', type: 'Note' }, true));
		fixture.detectChanges();
		expect(host.querySelector('output')?.textContent).toBe('two true');
	});
});
