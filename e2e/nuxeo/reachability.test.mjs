import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNativeReachability } from './reachability.mjs';

const app = 'http://localhost:8080/nuxeo/authoring-local';
const api = 'http://localhost:8080/nuxeo';
function fixture(applicationStatus, healthStatus) {
	const requests = [];
	return {
		requests,
		fetcher: async (url, options) => {
			requests.push({ url, options });
			return new Response(null, {
				status: url.endsWith('/runningstatus') ? healthStatus : applicationStatus,
			});
		},
	};
}

for (const status of [200, 204, 401])
	test(`application ${status} with successful health permits actual auth verification`, async () => {
		const { fetcher, requests } = fixture(status, 200);
		await assertNativeReachability(app, api, fetcher);
		assert.deepEqual(
			requests.map(({ url }) => url),
			[`${app}/`, `${api}/runningstatus`],
		);
		for (const { options } of requests) {
			assert.equal(options.redirect, 'manual');
			assert.ok(options.signal instanceof AbortSignal);
			assert.equal(options.signal.aborted, false);
			assert.equal(options.headers, undefined);
		}
	});

for (const status of [403, 404, 500])
	test(`application ${status} fails before health or authenticated paths`, async () => {
		const { fetcher, requests } = fixture(status, 200);
		await assert.rejects(assertNativeReachability(app, api, fetcher), /PRECONDITION NOT MET/);
		assert.equal(requests.length, 1);
	});

for (const status of [401, 404, 503])
	test(`health ${status} fails even when application 401 is reachable`, async () => {
		const { fetcher, requests } = fixture(401, status);
		await assert.rejects(assertNativeReachability(app, api, fetcher), /health must return 2xx/);
		assert.equal(requests.length, 2);
	});

for (const target of ['application', 'health'])
	for (const status of [301, 302, 307, 308])
		test(`${target} redirect ${status} fails without following it`, async () => {
			const { fetcher, requests } = fixture(
				target === 'application' ? status : 401,
				target === 'health' ? status : 200,
			);
			await assert.rejects(assertNativeReachability(app, api, fetcher), /endpoint redirected/);
			assert.equal(requests.length, target === 'application' ? 1 : 2);
			assert.ok(requests.every(({ options }) => options.redirect === 'manual'));
		});

test('trailing slash input still probes the single final application URL', async () => {
	const { fetcher, requests } = fixture(401, 204);
	await assertNativeReachability(`${app}/`, `${api}/`, fetcher);
	assert.deepEqual(
		requests.map(({ url }) => url),
		[`${app}/`, `${api}/runningstatus`],
	);
});
