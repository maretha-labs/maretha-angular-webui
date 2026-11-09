import assert from 'node:assert/strict';
import test from 'node:test';
import { quickSearchDocumentIdentityPattern } from './quick-search-identity.mjs';
import { isExactDocumentRoute } from '../local-boundary.mjs';

const uid = 'a63bf4a7-97bb-4a2c-8846-fb686f3301af';
const app = 'http://localhost:8080/nuxeo/authoring-local';

for (const type of ['Document', 'document', 'Documento', 'Documentul', 'مستند'])
	test(`exact native identity matches localized type ${type}`, () => {
		assert.equal(quickSearchDocumentIdentityPattern(uid).test(`${type} / ${uid}`), true);
	});

for (const text of [
	`Document / ${uid}-other`,
	`Document / prefix-${uid}`,
	`Document / ${uid}/child`,
	`Maretha native QA ${uid}`,
	`Search for Document / ${uid}\ncommand`,
	`Document / ${uid}?view=metadata`,
])
	test('labels, commands and partial document identities do not qualify', () => {
		assert.equal(quickSearchDocumentIdentityPattern(uid).test(text), false);
	});

test('result selection still must navigate to the exact document route, never user/group', () => {
	assert.equal(isExactDocumentRoute(`${app}/#/browse/documents/${uid}`, uid, app), true);
	for (const route of [
		`/page/user?id=${uid}`,
		`/page/group?id=${uid}`,
		`/browse/documents/${uid}-other`,
	])
		assert.equal(isExactDocumentRoute(`${app}/#${route}`, uid, app), false);
});

test('configured identity cannot change the matching expression', () => {
	for (const id of ['', `${uid}.*`, `${uid}$`, `${uid}/child`, `${uid}\n`, null])
		assert.throws(() => quickSearchDocumentIdentityPattern(id), /exact native test document ID/);
});
