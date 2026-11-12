import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from 'app/helpers/auth.service';
import { environment } from 'environments/environment';
import { MetadataPolicyService } from './metadata-policy.service';
import { metadataAccess, MetadataPolicy } from './metadata-policy.service';

describe('Metadata access rules', () => {
	const document = { type: 'Picture', schemas: [{ name: 'dublincore', prefix: 'dc' }] };
	const user = { id: 'mary', groups: [{ id: 'editors' }, { id: 'photographers' }] };
	const policy = (rules: Partial<MetadataPolicy['rules'][number]>[]): MetadataPolicy => ({
		version: 1,
		rules: rules.map((rule, index) => ({
			id: String(index),
			documentType: '*',
			schema: '*',
			access: 'read',
			subjects: { users: [], groups: [], match: 'any' },
			...rule,
		})),
	});
	it('matches a schema name and denies fields outside the allowlist', () => {
		const rules = policy([
			{ documentType: 'Picture', schema: 'dublincore', access: 'write', fields: ['dc:title'] },
		]);
		expect(metadataAccess(rules, document, 'dc:title', user)).toBe('write');
		expect(metadataAccess(rules, document, 'dc:description', user)).toBe('hidden');
	});
	it('supports either user or group membership', () => {
		const rules = policy([
			{ access: 'hidden', subjects: { users: ['other'], groups: ['editors'], match: 'any' } },
		]);
		expect(metadataAccess(rules, document, 'dc:title', user)).toBe('hidden');
	});
	it('requires both user and group categories for all matching', () => {
		const rules = policy([
			{ access: 'hidden', subjects: { users: ['other'], groups: ['editors'], match: 'all' } },
		]);
		expect(metadataAccess(rules, document, 'dc:title', user)).toBe('write');
		rules.rules[0].subjects.users = ['mary'];
		expect(metadataAccess(rules, document, 'dc:title', user)).toBe('hidden');
	});
	it('prefers a user exception over group rules and uses restrictive ties', () => {
		const rules = policy([
			{ access: 'hidden', subjects: { users: [], groups: ['editors'], match: 'any' } },
			{ access: 'write', subjects: { users: ['mary'], groups: [], match: 'any' } },
		]);
		expect(metadataAccess(rules, document, 'dc:title', user)).toBe('write');
		rules.rules.push({ ...rules.rules[1], id: 'deny', access: 'read' });
		expect(metadataAccess(rules, document, 'dc:title', user)).toBe('read');
	});
	it('uses specific type rules and does not apply unrelated document types', () => {
		const rules = policy([
			{ access: 'hidden' },
			{ documentType: 'Picture', schema: 'dc', access: 'read' },
		]);
		expect(metadataAccess(rules, document, 'dc:title', user)).toBe('read');
		expect(metadataAccess(rules, { type: 'File' }, 'dc:title', user)).toBe('hidden');
	});
	it('validates administrative changes before HTTP and preserves explicit error identities', async () => {
		const userInfo = signal<any>({ isAdministrator: false });
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(withXhr()),
				provideHttpClientTesting(),
				{ provide: AuthService, useValue: { userInfo } },
			],
		});
		const service = TestBed.inject(MetadataPolicyService);
		await expectAsync(service.save(policy([]))).toBeRejectedWith(
			jasmine.objectContaining({ key: 'metadata.adminOnly' }),
		);
		userInfo.set({ isAdministrator: true });
		await expectAsync(service.save({ version: 2, rules: [] } as any)).toBeRejectedWith(
			jasmine.objectContaining({ key: 'metadata.invalidPolicy' }),
		);
		for (const rule of [
			{ schema: ' ' },
			{ subjects: { users: [''], groups: [], match: 'any' } },
			{ fields: ['invalid'] },
		])
			await expectAsync(service.save(policy([rule as any]))).toBeRejectedWith(
				jasmine.objectContaining({ key: 'metadata.invalidRule' }),
			);
		TestBed.inject(HttpTestingController).expectNone(() => true);
	});
	it('does not apply rules for another schema or another principal', () => {
		expect(
			metadataAccess(policy([{ schema: 'picture', access: 'hidden' }]), document, 'dc:title', user),
		).toBe('write');
		expect(
			metadataAccess(
				policy([
					{ access: 'hidden', subjects: { users: ['other'], groups: ['unknown'], match: 'any' } },
				]),
				document,
				'dc:title',
				user,
			),
		).toBe('write');
	});
});

describe('MetadataPolicyService loading, access checks and preferences', () => {
	let service: MetadataPolicyService;
	let http: HttpTestingController;
	let userInfo: ReturnType<typeof signal<any>>;
	const api = `${environment.nuxeoUrl}/api/v1`;
	const query = (candidate: { url: string }) => candidate.url.endsWith('/search/lang/NXQL/execute');
	const policyDocument = (rules: unknown[], uid = 'policy-doc') => ({
		uid,
		properties: { 'dc:description': JSON.stringify({ version: 1, rules }) },
	});
	const picture = {
		type: 'Picture',
		schemas: [{ name: 'dublincore', prefix: 'dc' }],
		properties: { 'dc:title': 'Sunset', 'dc:description': 'Evening', 'dc:created': '2026-01-01' },
		contextParameters: { permissions: ['Read', 'WriteProperties'] },
	};
	beforeEach(() => {
		userInfo = signal<any>({ id: 'mary', isAdministrator: false, groups: ['editors'] });
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(withXhr()),
				provideHttpClientTesting(),
				{ provide: AuthService, useValue: { userInfo } },
			],
		});
		service = TestBed.inject(MetadataPolicyService);
		http = TestBed.inject(HttpTestingController);
		localStorage.clear();
	});
	afterEach(() => {
		http.verify();
		localStorage.clear();
	});

	it('loads the shared policy by query, applies its rules to reads and writes, and shares one pending load', async () => {
		expect(service.canRead(picture, 'dc:title')).toBeFalse();
		const first = service.load();
		expect(service.load()).toBe(first);
		expect(service.loading()).toBeTrue();
		const request = http.expectOne(query);
		expect(request.request.params.get('query')).toContain(
			"ecm:path = '/default-domain/.maretha-ui-metadata-pol'",
		);
		request.flush({
			entries: [
				policyDocument([
					{
						id: 'hide-description',
						documentType: 'Picture',
						schema: 'dublincore',
						access: 'read',
						subjects: { users: [], groups: ['editors'], match: 'any' },
						fields: ['dc:title'],
					},
				]),
			],
		});
		await first;
		expect(service.loading()).toBeFalse();
		expect(service.revision()).toBe(1);
		expect(service.policy().rules.length).toBe(1);
		expect(service.canRead(picture, 'dc:title')).toBeTrue();
		expect(service.canRead(picture, 'dc:description')).toBeFalse();
		expect(service.canWrite(picture, 'dc:title')).toBeFalse();
		expect(service.canWrite({ ...picture, type: 'File' }, 'dc:title')).toBeTrue();
		expect(service.canWrite({ ...picture, type: 'File' }, 'dc:created')).toBeFalse();
		expect(service.canWrite({ ...picture, type: 'File' }, 'uid:uid')).toBeFalse();
		expect(
			service.canWrite(
				{ ...picture, type: 'File', contextParameters: { permissions: ['Read'] } },
				'dc:title',
			),
		).toBeFalse();
		// The allowlist hides every other dublincore field, including generated ones.
		expect(service.visibleDocument(picture).properties).toEqual({ 'dc:title': 'Sunset' });
		expect(service.visibleDocument(undefined)).toBeUndefined();
		await expectAsync(service.assertWritable(picture, { 'dc:title': 'Sunset' })).toBeResolved();
		await expectAsync(service.assertWritable(picture, { 'dc:title': 'Dawn' })).toBeRejectedWith(
			jasmine.objectContaining({ key: 'metadata.cannotEdit' }),
		);
	});

	it('treats an absent policy document as an empty policy and a failed query as a load error', async () => {
		const absent = service.load();
		http.expectOne(query).flush({ entries: [] });
		await absent;
		expect(service.error()).toBe('');
		expect(service.canRead(picture, 'dc:title')).toBeTrue();
		expect(service.canWrite(picture, 'dc:title')).toBeTrue();
		userInfo.set({ id: 'bob', isAdministrator: false });
		TestBed.tick();
		const failing = http.expectOne(query);
		expect(service.canRead(picture, 'dc:title')).toBeFalse();
		failing.flush(null, { status: 500, statusText: 'Server error' });
		await service.load();
		expect(service.error()).not.toBe('');
		expect(service.canRead(picture, 'dc:title')).toBeFalse();
	});

	it('lets an administrator read everything and decodes an escaped legacy note body', async () => {
		userInfo.set({ id: 'admin', isAdministrator: true });
		const load = service.load();
		http.expectOne(query).flush({
			entries: [
				{
					uid: 'legacy',
					properties: {
						'note:note':
							'{&quot;version&quot;:1,&quot;rules&quot;:[{&quot;id&quot;:&quot;r&quot;,&quot;documentType&quot;:&quot;*&quot;,&quot;schema&quot;:&quot;*&quot;,&quot;access&quot;:&quot;hidden&quot;,&quot;subjects&quot;:{&quot;users&quot;:[],&quot;groups&quot;:[],&quot;match&quot;:&quot;any&quot;}}]}',
					},
				},
			],
		});
		await load;
		expect(service.policy().rules[0].access).toBe('hidden');
		expect(service.canRead(picture, 'dc:title')).toBeTrue();
		expect(service.canWrite(picture, 'dc:title')).toBeTrue();
	});

	it('saves a validated policy through a created settings document and rejects a concurrent change', async () => {
		userInfo.set({ id: 'admin', isAdministrator: true });
		const load = service.load();
		http.expectOne(query).flush({ entries: [] });
		await load;
		const policy: MetadataPolicy = {
			version: 1,
			rules: [
				{
					id: 'r1',
					documentType: '*',
					schema: 'dc',
					access: 'read',
					subjects: { users: ['mary'], groups: [], match: 'any' },
				},
			],
		};
		const saving = service.save(policy);
		const created = http.expectOne(`${api}/path/default-domain`);
		expect(created.request.body.type).toBe('Note');
		created.flush({
			uid: 'new-policy',
			properties: { 'dc:description': '{"version":1,"rules":[]}' },
		});
		await Promise.resolve();
		for (const name of [
			'Document.AddPermission',
			'Document.AddPermission',
			'Document.BlockPermissionInheritance',
			'Document.AddFacet',
		]) {
			await new Promise((resolve) => setTimeout(resolve));
			const operation = http.expectOne(`${api}/automation/${name}`);
			expect(operation.request.body.input).toBe('new-policy');
			operation.flush({});
		}
		await new Promise((resolve) => setTimeout(resolve));
		http.expectOne(`${api}/id/new-policy`).flush({
			uid: 'new-policy',
			changeToken: '7',
			properties: { 'dc:description': '{"version":1,"rules":[]}' },
		});
		await new Promise((resolve) => setTimeout(resolve));
		const put = http.expectOne((candidate) => candidate.method === 'PUT');
		expect(put.request.body.changeToken).toBe('7');
		expect(JSON.parse(put.request.body.properties['dc:description'])).toEqual(policy);
		put.flush({ uid: 'new-policy', properties: { 'dc:description': JSON.stringify(policy) } });
		await saving;
		expect(service.policy()).toEqual(policy);
		expect(service.loading()).toBeFalse();
		// Another administrator saved meanwhile: the stored content no longer matches ours.
		const conflicting = service.save(policy);
		for (const name of [
			'Document.AddPermission',
			'Document.AddPermission',
			'Document.BlockPermissionInheritance',
			'Document.AddFacet',
		]) {
			await new Promise((resolve) => setTimeout(resolve));
			http.expectOne(`${api}/automation/${name}`).flush({});
		}
		await new Promise((resolve) => setTimeout(resolve));
		http.expectOne(`${api}/id/new-policy`).flush({
			uid: 'new-policy',
			changeToken: '8',
			properties: { 'dc:description': '{"version":1,"rules":[]}' },
		});
		await expectAsync(conflicting).toBeRejectedWith(
			jasmine.objectContaining({ key: 'metadata.changedBeforeSave' }),
		);
		expect(service.error()).not.toBe('');
	});

	it('maps a 409 and a server message to save errors', async () => {
		userInfo.set({ id: 'admin', isAdministrator: true });
		const load = service.load();
		http.expectOne(query).flush({ entries: [policyDocument([])] });
		await load;
		const conflict = service.save({ version: 1, rules: [] });
		await new Promise((resolve) => setTimeout(resolve));
		http
			.expectOne(`${api}/automation/Document.AddPermission`)
			.flush({}, { status: 409, statusText: 'Conflict' });
		await expectAsync(conflict).toBeRejectedWith(
			jasmine.objectContaining({ key: 'metadata.conflict' }),
		);
		const refused = service.save({ version: 1, rules: [] });
		await new Promise((resolve) => setTimeout(resolve));
		http
			.expectOne(`${api}/automation/Document.AddPermission`)
			.flush({ message: 'Permission denied by server' }, { status: 403, statusText: 'Forbidden' });
		await expectAsync(refused).toBeRejectedWithError('Permission denied by server');
		expect(service.error()).toBe('Permission denied by server');
	});

	it('stores per-user, per-type presentation preferences and ignores malformed saved values', () => {
		expect(service.userPreferences('Picture')).toEqual({
			hiddenFields: [],
			hiddenSchemas: [],
			fieldOrder: [],
			metadataHidden: false,
		});
		const revision = service.revision();
		service.setUserPreferences('Picture', { hiddenFields: ['dc:title'], metadataHidden: true });
		expect(service.revision()).toBe(revision + 1);
		service.setUserPreferences('Picture', { fieldOrder: ['dc:description', 'dc:title'] });
		expect(service.userPreferences('Picture')).toEqual({
			hiddenFields: ['dc:title'],
			hiddenSchemas: [],
			fieldOrder: ['dc:description', 'dc:title'],
			metadataHidden: true,
		});
		expect(service.userPreferences('File').hiddenFields).toEqual([]);
		const key = Object.keys(localStorage).find(
			(item) => item.includes('mary') && item.endsWith('Picture'),
		)!;
		expect(key).toContain(encodeURIComponent(environment.nuxeoUrl));
		localStorage.setItem(key, JSON.stringify({ hiddenFields: ['dc:title', 3, null] }));
		expect(service.userPreferences('Picture').hiddenFields).toEqual(['dc:title']);
		localStorage.setItem(key, '{not json');
		expect(service.userPreferences('Picture').metadataHidden).toBeFalse();
		const setItem = spyOn(Storage.prototype, 'setItem').and.throwError('quota');
		expect(() => service.setUserPreferences('Picture', { metadataHidden: false })).toThrowMatching(
			(error) => error.key === 'metadata.preferencesFailed',
		);
		setItem.and.callThrough();
	});
});
