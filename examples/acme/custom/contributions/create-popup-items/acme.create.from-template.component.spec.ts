import { TestBed } from '@angular/core/testing';
import type { DocumentCreateContext } from '@maretha/webui-sdk';
import { AcmeCreateFromTemplateComponent } from './acme.create.from-template.component';

describe('AcmeCreateFromTemplateComponent', () => {
	it('offers the ACME types the folder allows and creates through the host', () => {
		const create = jasmine.createSpy('create');
		const fixture = TestBed.createComponent(AcmeCreateFromTemplateComponent);
		fixture.componentRef.setInput('context', {
			document: { uid: 'folder-1' },
			noEdit: false,
			types: [
				{ name: 'File', label: 'File', file: true, folder: false },
				{ name: 'Invoice', label: 'Invoice', file: true, folder: false },
			],
			create,
			importFiles: () => undefined,
			open: () => undefined,
		} as DocumentCreateContext);
		fixture.detectChanges();
		const buttons = fixture.nativeElement.querySelectorAll('button');
		expect(buttons.length).toBe(1);
		expect(buttons[0].textContent).toContain('Standard Invoice');
		buttons[0].click();
		expect(create).toHaveBeenCalledOnceWith('Invoice');
	});
});
