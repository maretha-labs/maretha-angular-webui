import { TestBed } from '@angular/core/testing';
import type { DocumentCreateContext } from '@maretha/webui-sdk';
import { AcmeCreateContractComponent } from './acme.create.contract.component';

describe('AcmeCreateContractComponent', () => {
	it('asks the host to create a Contract', () => {
		const create = jasmine.createSpy('create');
		const fixture = TestBed.createComponent(AcmeCreateContractComponent);
		fixture.componentRef.setInput('context', {
			document: { uid: 'folder-1' },
			noEdit: false,
			types: [{ name: 'Contract', label: 'Contract', file: true, folder: false }],
			create,
			importFiles: () => undefined,
			open: () => undefined,
		} as DocumentCreateContext);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('New contract');
		fixture.nativeElement.querySelector('button').click();
		expect(create).toHaveBeenCalledOnceWith('Contract');
	});
});
