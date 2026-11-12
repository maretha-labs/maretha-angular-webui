// The condition cases are ported from Nuxeo Elements `ui/test/nuxeo-filter.test.js`
// (©2023 Hyland Software, Inc. and its affiliates, Apache License 2.0). Each Polymer
// fixture's `ok` / `notok` element becomes an expected `true` / `false`.
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { defineContribution } from './contribution';
import { ExtensionRegistry } from './extension-registry.service';
import { NUXEO_FILTERS, nuxeoFilter, NuxeoFilterConditions } from './nuxeo-filter';
import { DOCUMENT_ACTIONS_SLOT } from './slots';

type Case = readonly [document: unknown, conditions: NuxeoFilterConditions, expected: boolean];
const run = (cases: readonly Case[], user?: unknown) =>
	cases.map(([document, conditions]) =>
		nuxeoFilter(conditions)({ document: document as Record<string, unknown>, user }),
	);
const expected = (cases: readonly Case[]) => cases.map((item) => item[2]);

@Component({ template: '', changeDetection: ChangeDetectionStrategy.Eager, standalone: true })
class Action {}

describe('nuxeoFilter (ported nuxeo-filter cases)', () => {
	it('passes with no conditions', () => {
		expect(nuxeoFilter({})({ document: {} })).toBeTrue();
		expect(nuxeoFilter({ type: '' })({ document: null })).toBeTrue();
	});

	it('facet filter', () => {
		const cases: Case[] = [
			[{ facets: ['Folderish'] }, { facet: 'Folderish' }, true],
			[{ facets: ['Folderish'] }, { facet: 'Commentable' }, false],
			[{ facets: ['Folderish'] }, { facet: 'Folderish, Commentable' }, true],
			[{ facets: ['Commentable'] }, { facet: 'Folderish,Commentable,Versionable' }, true],
			[{ facets: [] }, { facet: 'Folderish,Commentable' }, false],
		];
		expect(run(cases)).toEqual(expected(cases));
	});

	it('schema filter matches a name or a prefix', () => {
		const files = { schemas: [{ name: 'files', prefix: 'files' }] };
		const dublincore = { schemas: [{ name: 'dublincore', prefix: 'dc' }] };
		const cases: Case[] = [
			[files, { schema: 'files' }, true],
			[files, { schema: 'dublincore' }, false],
			[dublincore, { schema: 'dublincore' }, true],
			[files, { schema: 'files, dublincore' }, true],
			[dublincore, { schema: 'dc,common,files' }, true],
			[dublincore, { schema: 'common,files,dc' }, true],
			[
				{ schemas: [{ name: 'common', prefix: 'common' }] },
				{ schema: 'dublincore,common,files' },
				true,
			],
			[{ schemas: [] }, { schema: 'file,common' }, false],
		];
		expect(run(cases)).toEqual(expected(cases));
	});

	it('type, permission and state filters', () => {
		const cases: Case[] = [
			[{ type: 'Folder' }, { type: 'Folder' }, true],
			[{ type: 'Folder' }, { type: 'File' }, false],
			[{ type: 'Folder' }, { type: 'Folder,File' }, true],
			[{ contextParameters: { permissions: ['Write'] } }, { permission: 'Write' }, true],
			[{ contextParameters: { permissions: ['Read'] } }, { permission: 'Write' }, false],
			[{ state: 'project' }, { state: 'project' }, true],
			[{ state: 'project' }, { state: 'deleted' }, false],
		];
		expect(run(cases)).toEqual(expected(cases));
	});

	it('path filter is a prefix regular expression', () => {
		const cases: Case[] = [
			[{ path: '/default-domain/workspaces/' }, { path: '/default-domain' }, true],
			[{ path: '/default-domain/workspaces/' }, { path: '/another-domain' }, false],
			[{ path: '/default-domain/workspaces/' }, { path: '/default-.*/work' }, true],
			[{ path: '/default-domain' }, { path: '/default-domain, /other' }, false],
		];
		expect(run(cases)).toEqual(expected(cases));
	});

	it('user group filter reads Nuxeo extendedGroups and SDK groups', () => {
		const group = (user: unknown, value: string) =>
			nuxeoFilter({ group: value })({ document: null, user });
		const administrators = { extendedGroups: [{ name: 'Administrators' }] };
		const members = { extendedGroups: [{ name: 'Members' }] };
		expect(group(administrators, 'Administrators')).toBeTrue();
		expect(group(members, 'Administrators')).toBeFalse();
		expect(group(members, 'Administrators,Members')).toBeTrue();
		expect(group({ groups: ['Members'] }, 'Members')).toBeTrue();
		expect(group(null, 'Members')).toBeFalse();
	});

	it('expression filter', () => {
		const cases: Case[] = [
			[{ title: 'Title' }, { expression: (document) => document?.['title'] === 'Title' }, true],
			[{ title: 'Title' }, { expression: (document) => document?.['title'] !== 'Title' }, false],
			[
				{ type: 'File', title: 'Title' },
				{
					expression: (document) => document?.['type'] === 'File' && document['title'] === 'Title',
				},
				true,
			],
			[
				{ facets: ['Folderish', 'Commentable'] },
				{ expression: (document) => (document?.['facets'] as string[]).includes('Folderish') },
				true,
			],
		];
		expect(run(cases)).toEqual(expected(cases));
	});

	it('trashed expression filter uses the helpers Polymer exposed as `this`', () => {
		const trashed = {
			expression: (document: unknown, _user: unknown, filters = NUXEO_FILTERS) =>
				filters.isTrashed(document as Record<string, unknown>),
		} as const;
		const notTrashed = {
			expression: (document: unknown) =>
				!NUXEO_FILTERS.isTrashed(document as Record<string, unknown>),
		} as const;
		const cases: Case[] = [
			[{ title: 'Title', state: 'project' }, notTrashed, true],
			[{ title: 'Title', state: 'deleted' }, trashed, true],
			[{ title: 'Title', state: 'project', isTrashed: false }, notTrashed, true],
			[{ title: 'Title', state: 'project', isTrashed: true }, trashed, true],
			[{ title: 'Title', state: 'deleted', isTrashed: false }, notTrashed, true],
			[{ title: 'Title', state: 'deleted', isTrashed: true }, trashed, true],
		];
		expect(run(cases)).toEqual(expected(cases));
	});

	it('multiple filters must all pass', () => {
		const administrators = { extendedGroups: [{ name: 'Administrators' }] };
		const check = (conditions: NuxeoFilterConditions, document: unknown, user?: unknown) =>
			nuxeoFilter(conditions)({ document: document as Record<string, unknown>, user });
		const title = (document: Readonly<Record<string, unknown>> | null | undefined) =>
			document?.['title'] === 'Title';
		expect(check({ expression: title }, { type: 'File', title: 'Title' })).toBeTrue();
		expect(check({ expression: (d) => !title(d) }, { type: 'File', title: 'Title' })).toBeFalse();
		expect(
			check({ type: 'File', group: 'Administrators' }, { type: 'File' }, administrators),
		).toBeTrue();
		expect(
			check({ type: 'File', group: 'Administrators' }, { type: 'File' }, { extendedGroups: [] }),
		).toBeFalse();
		expect(
			check(
				{ type: 'File', facet: 'Folderish', expression: title },
				{ type: 'File', title: 'Title', facets: ['Folderish'] },
			),
		).toBeTrue();
	});
});

describe('nuxeoFilter definitions', () => {
	it('rejects unknown conditions and wrong value types when defined', () => {
		expect(() => nuxeoFilter({ facets: 'Folderish' } as NuxeoFilterConditions)).toThrowError(
			/Unknown nuxeo-filter condition: facets/,
		);
		expect(() => nuxeoFilter({ expression: 'document.title' } as never)).toThrowError(/wrong type/);
		expect(() => nuxeoFilter({ type: ['File'] } as never)).toThrowError(/wrong type/);
		expect(() => nuxeoFilter(null as never)).toThrowError(/must be an object/);
	});

	it('composes with a contribution and fails closed when an expression throws', () => {
		const registry = new ExtensionRegistry();
		registry.register({
			id: 'custom.webui',
			contributions: [
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: 'custom.file-only',
					component: Action,
					when: nuxeoFilter({ type: 'File', permission: 'Write' }),
				}),
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: 'custom.broken',
					component: Action,
					when: nuxeoFilter({
						expression: () => {
							throw new Error('private data');
						},
					}),
				}),
			],
		});
		const resolve = (document: Record<string, unknown>) =>
			registry.resolve('DOCUMENT_ACTIONS', { document, noEdit: false });
		const file = { type: 'File', contextParameters: { permissions: ['Write'] } };
		expect(resolve(file).items.map((item) => item.id)).toEqual(['custom.file-only']);
		expect(resolve({ ...file, type: 'Note' }).items).toEqual([]);
		expect(resolve(file).diagnostics.map((item) => item.code)).toEqual(['condition-failed']);
	});
});

describe('NUXEO_FILTERS helpers', () => {
	const doc = {
		type: 'File',
		state: 'project',
		path: '/default-domain/workspaces/a',
		facets: ['Publishable', 'Immutable'],
		schemas: [{ name: 'dublincore', prefix: 'dc' }],
		isProxy: true,
		retainUntil: '9999-01-01T00:00:00.000Z',
		properties: {
			'file:content': { name: 'a.pdf' },
			'files:files': [{ file: {} }],
			'uid:major_version': 0,
			'uid:minor_version': 1,
		},
		contextParameters: {
			permissions: ['Write', 'WriteVersion', 'MakeRecord', 'SetRetention', 'ManageLegalHold'],
			favorites: { isFavorite: true },
			subscribedNotifications: ['Modification'],
			collections: [{ uid: 'c' }],
			runningWorkflows: [],
			runnableWorkflows: [{ id: 'w' }],
		},
	};

	it('read documents like FiltersBehavior', () => {
		const f = NUXEO_FILTERS;
		expect([f.isFavorite(doc), f.isSubscribed(doc), f.isCollectionMember(doc)]).toEqual([
			true,
			true,
			true,
		]);
		expect(f.isCollectionMember({ facets: ['NotCollectionMember'] })).toBeFalse();
		expect(f.isCollectionMember({})).toBeFalse();
		expect([f.isRetentionDateIndeterminate(doc), f.isImmutable(doc), f.isPublication(doc)]).toEqual(
			[true, true, true],
		);
		expect([
			f.hasContent(doc),
			f.hasContent(doc, 'file:content.name'),
			f.hasContent(doc, 'x:y'),
		]).toEqual([true, true, false]);
		expect([f.hasAttachments(doc), f.hasVersions(doc), f.hasCollections(doc)]).toEqual([
			true,
			true,
			true,
		]);
		expect([f.hasRunningWorkflows(doc), f.hasRunnableWorkflows(doc)]).toEqual([false, true]);
		expect([f.canSetRetention(doc), f.canSetLegalHold(doc)]).toEqual([true, true]);
		expect(f.canSetRetention({ ...doc, hasLegalHold: true })).toBeFalse();
		expect(f.isPublishable(doc)).toBeFalse();
		expect(f.isPublishable({ ...doc, isProxy: false })).toBeTrue();
		expect(f.isTaggable(doc)).toBeFalse();
		expect(f.isTaggable({ ...doc, isProxy: false })).toBeTrue();
		expect([f.isVersion(doc), f.isRecord(doc), f.isUnderRetentionOrLegalHold(doc)]).toEqual([
			false,
			false,
			false,
		]);
		expect([f.pathMatches(doc, 'workspaces/a$'), f.hasSchema(doc, 'dc')]).toEqual([true, true]);
	});

	it('return false for missing documents instead of throwing', () => {
		for (const [name, helper] of Object.entries(NUXEO_FILTERS))
			expect((helper as (value: unknown, arg?: string) => boolean)(null, 'x'))
				.withContext(name)
				.toBeFalse();
	});

	it('recognise administrators and power users', () => {
		expect(NUXEO_FILTERS.hasAdministrationPermissions({ isAdministrator: true })).toBeTrue();
		expect(NUXEO_FILTERS.hasAdministrationPermissions({ groups: ['powerusers'] })).toBeTrue();
		expect(NUXEO_FILTERS.hasAdministrationPermissions({ groups: ['members'] })).toBeFalse();
	});
});
