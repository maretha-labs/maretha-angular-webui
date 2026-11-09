import { TestBed } from '@angular/core/testing';
import type { ResultsToolbarContext } from '@maretha/webui-sdk';
import { AcmeResultsExportRegisterComponent } from './acme.results.export-register.component';

describe('AcmeResultsExportRegisterComponent', () => {
	const render = (context: Partial<ResultsToolbarContext>) => {
		const fixture = TestBed.createComponent(AcmeResultsExportRegisterComponent);
		fixture.componentRef.setInput('context', {
			document: null,
			noEdit: false,
			selectedDocuments: [],
			busy: false,
			setBusy: () => undefined,
			refresh: () => Promise.resolve(),
			reportError: () => undefined,
			loadedCount: 20,
			totalCount: 57,
			allSelected: false,
			availableCommands: [],
			workflows: [],
			execute: () => Promise.resolve(),
			...context,
		} as ResultsToolbarContext);
		fixture.detectChanges();
		return fixture;
	};

	it('exports the complete query scope when the host supplies one', () => {
		const reportMessage = jasmine.createSpy('reportMessage');
		const fixture = render({
			reportMessage,
			queryScope: { repository: 'default', provider: 'default_search' } as never,
		});
		expect(fixture.nativeElement.textContent).toContain('Export register (57)');
		fixture.nativeElement.querySelector('button').click();
		expect(reportMessage).toHaveBeenCalledOnceWith(
			'acme.results.export-register.started',
			'Register export started',
		);
	});

	it('is disabled without a complete query scope', () => {
		expect(render({}).nativeElement.querySelector('button').disabled).toBeTrue();
	});
});
