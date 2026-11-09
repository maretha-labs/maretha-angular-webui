import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DocumentOrderService, planDocumentOrder } from './document-order.service';

describe('Document ordering', () => {
	const siblings = ['a', 'b', 'c', 'd', 'e'];
	it('groups separated selections in sibling order, including pinned boundary selections', () => {
		expect(planDocumentOrder(siblings, ['d', 'b'], 'up')).toEqual({
			input: ['b', 'd'],
			before: 'a',
		});
		expect(planDocumentOrder(siblings, ['a', 'd', 'c'], 'up')).toEqual({
			input: ['c', 'd'],
			before: 'b',
		});
		expect(planDocumentOrder(siblings, ['b', 'd'], 'down')).toEqual({ input: ['b', 'd'] });
		expect(planDocumentOrder(siblings, ['e', 'd', 'b'], 'down')).toEqual({
			input: ['b'],
			before: 'd',
		});
		expect(planDocumentOrder(siblings, ['b'], 'down')).toEqual({ input: ['b'], before: 'd' });
	});
	it('refuses missing selections and sequences already at the requested boundary', () => {
		for (const selection of [[], ['a', 'b'], siblings, ['missing']])
			expect(planDocumentOrder(siblings, selection, 'up')).toBeNull();
		expect(planDocumentOrder(siblings, ['d', 'e'], 'down')).toBeNull();
	});

	let service: DocumentOrderService;
	let http: HttpTestingController;
	const parent = {
		uid: 'parent',
		facets: ['Orderable'],
		contextParameters: { permissions: ['WriteProperties'] },
	};
	const page = (ids: string[], next = false, total = ids.length) => ({
		entries: ids.map((uid) => ({ uid, parentRef: 'parent', repository: 'other' })),
		isNextPageAvailable: next,
		totalSize: total,
	});
	const tick = async () => {
		await Promise.resolve();
		await Promise.resolve();
	};
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		service = TestBed.inject(DocumentOrderService);
		http = TestBed.inject(HttpTestingController);
	});
	afterEach(() => http.verify());
	it('reads fresh permissions and all pages before ordering an explicit selection in its repository', async () => {
		const result = service.move('parent', 'other', ['b'], 'down', () => true);
		http.expectOne((r) => r.url.endsWith('/repo/other/id/parent')).flush(parent);
		await tick();
		const first = http.expectOne((r) => r.url.endsWith('/repo/other/query'));
		expect(first.request.params.get('query')).toContain('ORDER BY ecm:pos');
		expect(first.request.params.get('currentPageIndex')).toBe('0');
		first.flush(page(['a', 'b'], true, 4));
		await tick();
		const second = http.expectOne((r) => r.url.endsWith('/repo/other/query'));
		expect(second.request.params.get('currentPageIndex')).toBe('1');
		second.flush(page(['c', 'd'], false, 4));
		await tick();
		const order = http.expectOne((r) => r.url.endsWith('/automation/Document.Order'));
		expect(order.request.body).toEqual({ input: ['b'], params: { before: 'd' } });
		expect(order.request.headers.get('X-NXRepository')).toBe('other');
		order.flush({});
		expect(await result).toEqual(['a', 'c', 'b', 'd']);
	});
	it('refuses revoked permissions before loading or mutating children', async () => {
		const result = service.move('parent', 'other', ['b'], 'up', () => true);
		const assertion = expectAsync(result).toBeRejectedWithError(/no longer be reordered/);
		http
			.expectOne((r) => r.url.endsWith('/id/parent'))
			.flush({ ...parent, contextParameters: { permissions: ['Read'] } });
		await assertion;
	});
	it('refuses truncated siblings and changed navigation without sending an order operation', async () => {
		const result = service.move('parent', 'other', ['b'], 'up', () => true);
		const assertion = expectAsync(result).toBeRejectedWithError(/complete sibling order/);
		http.expectOne((r) => r.url.endsWith('/id/parent')).flush(parent);
		await tick();
		http.expectOne((r) => r.url.endsWith('/query')).flush(page(['a', 'b'], false, 9));
		await assertion;
		let current = true;
		const changed = service.move('parent', 'other', ['b'], 'up', () => current);
		http.expectOne((r) => r.url.endsWith('/id/parent')).flush(parent);
		await tick();
		current = false;
		http.expectOne((r) => r.url.endsWith('/query')).flush(page(['a', 'b']));
		await changed;
	});
	it('refuses a stale displayed sequence before issuing another move', async () => {
		const result = service.move('parent', 'other', ['b'], 'up', () => true, ['b', 'a']);
		const assertion = expectAsync(result).toBeRejectedWithError(/displayed order is stale/);
		http.expectOne((r) => r.url.endsWith('/id/parent')).flush(parent);
		await tick();
		http.expectOne((r) => r.url.endsWith('/query')).flush(page(['a', 'b']));
		await assertion;
	});
	it('reports an ambiguous write failure without automatically repeating the mutation', async () => {
		const result = service.move('parent', 'other', ['b'], 'up', () => true);
		const assertion = expectAsync(result).toBeRejectedWithError(/outcome is unknown/);
		http.expectOne((r) => r.url.endsWith('/id/parent')).flush(parent);
		await tick();
		http.expectOne((r) => r.url.endsWith('/query')).flush(page(['a', 'b']));
		await tick();
		http
			.expectOne((r) => r.url.endsWith('/Document.Order'))
			.flush({}, { status: 504, statusText: 'Gateway timeout' });
		await assertion;
	});
	it('denies inconsistent and duplicated sibling pages before a mutation', async () => {
		for (const [response, message] of [
			[
				{ entries: [{ uid: 'a', parentRef: 'elsewhere', repository: 'other' }], totalSize: 1 },
				/contents changed/,
			],
			[page(['a', 'a']), /order changed/],
			[page([], true, 2), /incomplete sibling page/],
			[page(['a']), /selected document moved/],
		] as const) {
			const result = service.move('parent', 'other', ['b'], 'up', () => true);
			const assertion = expectAsync(result).toBeRejectedWithError(message);
			http.expectOne((r) => r.url.endsWith('/id/parent')).flush(parent);
			await tick();
			http.expectOne((r) => r.url.endsWith('/query')).flush(response);
			await assertion;
			http.expectNone((r) => r.url.endsWith('/Document.Order'));
		}
	});
});
