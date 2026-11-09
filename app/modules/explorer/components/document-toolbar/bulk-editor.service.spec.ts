import { BulkValidationError } from '@maretha/webui-sdk';
import { TestBed } from '@angular/core/testing';
import { DocumentLayoutGatewayService } from '../../helpers/document-layout-gateway.service';
import { BulkEditorService } from './bulk-editor.service';

describe('BulkEditorService', () => {
	let gateway: jasmine.SpyObj<DocumentLayoutGatewayService>;
	let service: BulkEditorService;
	beforeEach(() => {
		gateway = jasmine.createSpyObj<DocumentLayoutGatewayService>('gateway', ['read', 'update']);
		TestBed.configureTestingModule({
			providers: [BulkEditorService, { provide: DocumentLayoutGatewayService, useValue: gateway }],
		});
		service = TestBed.inject(BulkEditorService);
	});
	it('retains typed validation parameters without writing and preserves server literal errors', async () => {
		gateway.read.and.resolveTo({
			uid: 'one',
			changeToken: 'fresh',
			properties: { 'dc:subjects': 'scalar' },
			contextParameters: { permissions: ['WriteProperties'] },
		} as any);
		const result = await service.save(
			['one'],
			[{ property: 'dc:subjects', mode: 'addValues', value: ['new'] }],
			() => true,
		);
		expect(result[0].validationError).toEqual(jasmine.any(BulkValidationError));
		expect(result[0].validationError?.code).toBe('add-scalar');
		expect(result[0].validationError?.parameters).toEqual({ property: 'dc:subjects' });
		expect(result[0].error).toBe('Cannot add values to scalar property: dc:subjects');
		expect(gateway.update).not.toHaveBeenCalled();
		gateway.read.and.rejectWith(new Error('Customer message'));
		const literal = await service.save(['one'], [], () => true);
		expect(literal[0].error).toBe('Customer message');
		expect(literal[0].errorCode).toBeUndefined();
		expect(literal[0].validationError).toBeUndefined();
	});
	it('re-reads each explicit document, retains its fields, and sends a change token', async () => {
		gateway.read.and.callFake(
			async (uid: string) =>
				({
					uid,
					changeToken: `${uid}-token`,
					properties: { 'dc:subjects': ['existing'], 'dc:title': 'kept' },
					contextParameters: { permissions: ['WriteProperties'] },
				}) as any,
		);
		gateway.update.and.resolveTo({} as any);
		const status = await service.save(
			['one', 'two'],
			[{ property: 'dc:subjects', mode: 'addValues', value: ['existing', 'new'] }],
			() => true,
		);
		expect(status.map((item) => item.state)).toEqual(['saved', 'saved']);
		expect(gateway.read.calls.allArgs()).toEqual([['one'], ['two']]);
		expect(gateway.update.calls.argsFor(0)[0].changeToken).toBe('one-token');
		expect(gateway.update.calls.argsFor(0)[1]).toEqual({ 'dc:subjects': ['existing', 'new'] });
	});
	it('reports a conflict per document and retries only the failed ids', async () => {
		gateway.read.and.callFake(
			async (uid: string) =>
				({
					uid,
					changeToken: 'fresh',
					properties: {},
					contextParameters: { permissions: ['WriteProperties'] },
				}) as any,
		);
		gateway.update.and.callFake(async (document: any) => {
			if (document.uid === 'conflict')
				throw Object.assign(new Error('409 Conflict'), { status: 409 });
			return {} as any;
		});
		const first = await service.save(
			['ok', 'conflict'],
			[{ property: 'dc:nature', mode: 'replace', value: 'nature' }],
			() => true,
		);
		expect(first.map((item) => item.state)).toEqual(['saved', 'failed']);
		gateway.update.and.resolveTo({} as any);
		const retry = await service.save(
			first.filter((item) => item.state === 'failed').map((item) => item.uid),
			[{ property: 'dc:nature', mode: 'replace', value: 'nature' }],
			() => true,
		);
		expect(retry).toEqual([{ uid: 'conflict', state: 'saved' }]);
	});
});
