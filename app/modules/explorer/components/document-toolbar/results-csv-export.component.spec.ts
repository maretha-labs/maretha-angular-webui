import { TestBed } from '@angular/core/testing';
import { DocumentEnhancerService } from '../../helpers/document-enhancer.service';
import { SelectionDownloadService } from '../../helpers/selection-download.service';
import { ResultsCsvExportComponent } from './results-csv-export.component';
describe('Result CSV export', () => {
	it('pins the applied query and releases its result when destroyed', async () => {
		let finish!: (blob: Blob) => void;
		const exportCsv = jasmine
			.createSpy('exportCsv')
			.and.returnValue(new Promise<Blob>((resolve) => (finish = resolve)));
		TestBed.configureTestingModule({
			imports: [ResultsCsvExportComponent],
			providers: [
				{ provide: SelectionDownloadService, useValue: { exportCsv } },
				{
					provide: DocumentEnhancerService,
					useValue: {
						loadDocumentTypes: () =>
							Promise.resolve({
								File: { schemas: ['common', 'file', 'dublincore', 'uid', 'files'] },
								Invoice: { schemas: ['common', 'dublincore', 'invoice'] },
							}),
					},
				},
			],
		});
		const create = spyOn(URL, 'createObjectURL').and.returnValue('blob:csv');
		const revoke = spyOn(URL, 'revokeObjectURL');
		const scope = {
			repository: 'default',
			providerName: 'nxql_search',
			queryParams: ['SELECT * FROM File'],
			namedParameters: {},
		};
		const f = TestBed.createComponent(ResultsCsvExportComponent);
		f.componentRef.setInput('context', {
			busy: false,
			queryScope: scope,
			csvSchemas: ['dublincore', 'common', 'file', 'uid'],
			items: [{ type: 'File' }, { type: 'Invoice' }, { type: 'Unknown' }, { type: 'File' }],
		});
		f.detectChanges();
		const done = f.componentInstance.start();
		scope.queryParams[0] = 'SELECT * FROM Document';
		// The export waits for the type catalogue before calling the service; the query was cloned first.
		await new Promise((resolve) => setTimeout(resolve));
		expect(exportCsv.calls.mostRecent().args[0].queryParams).toEqual(['SELECT * FROM File']);
		expect(exportCsv.calls.mostRecent().args[2]).toEqual({
			schemas: ['dublincore', 'common', 'file', 'uid'],
		});
		// Stock nuxeo-csv-export-button adds the schemas of the page's document types.
		expect(exportCsv.calls.mostRecent().args[3]).toEqual([
			'common',
			'file',
			'dublincore',
			'uid',
			'files',
			'invoice',
		]);
		finish(new Blob(['title'], { type: 'text/plain' }));
		await done;
		f.detectChanges();
		expect(create).toHaveBeenCalled();
		expect(f.nativeElement.textContent).toContain('Export ready');
		expect(f.nativeElement.querySelector('a').download).toBe('results.csv');
		f.destroy();
		expect(revoke).toHaveBeenCalledWith('blob:csv');
	});
});
