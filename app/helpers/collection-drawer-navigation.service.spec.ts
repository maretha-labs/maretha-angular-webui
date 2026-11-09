import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { CollectionDrawerNavigation } from './collection-drawer-navigation.service';
import { documentUrl } from './document-route';

describe('Collection member navigation', () => {
	const collection = { uid: 'collection', type: 'Collection', repository: 'secondary' };
	const member = { uid: 'member', repository: 'secondary' };
	let router: { url: string; navigateByUrl: jasmine.Spy };
	beforeEach(() => {
		router = { url: '/browse', navigateByUrl: jasmine.createSpy('navigateByUrl') };
		TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }] });
	});
	it('requests member context only after successful matching document navigation', async () => {
		const navigation = TestBed.inject(CollectionDrawerNavigation);
		let complete!: (result: boolean) => void;
		router.navigateByUrl.and.returnValue(new Promise<boolean>((resolve) => (complete = resolve)));
		const pending = navigation.navigate(collection, member, 'user');
		expect(navigation.pending()).toBeNull();
		router.url = documentUrl(member);
		complete(true);
		await pending;
		const request = navigation.pending()!;
		expect(request).toEqual(
			jasmine.objectContaining({ collection, member, userId: 'user', repository: 'secondary' }),
		);
		expect(navigation.accept(request)).toBeTrue();
		expect(navigation.accepted()).toBe(request);
		expect(navigation.accept(request)).toBeFalse();
	});
	it('ignores guard rejection, redirect, and protected document or cross-repository callers', async () => {
		const navigation = TestBed.inject(CollectionDrawerNavigation);
		router.navigateByUrl.and.resolveTo(false);
		await navigation.navigate(collection, member, 'user');
		expect(navigation.pending()).toBeNull();
		router.navigateByUrl.and.resolveTo(true);
		await navigation.navigate(collection, member, 'user');
		expect(navigation.pending()).toBeNull();
		router.navigateByUrl.calls.reset();
		for (const type of ['Folder', 'File', 'Picture', 'Favorites'])
			await navigation.navigate({ ...collection, type }, member, 'user');
		await navigation.navigate(collection, { ...member, repository: 'another' }, 'user');
		expect(router.navigateByUrl).not.toHaveBeenCalled();
	});
	it('does not let an old navigation replace a newer member request', async () => {
		const navigation = TestBed.inject(CollectionDrawerNavigation);
		let complete!: (result: boolean) => void;
		router.navigateByUrl.and.returnValue(new Promise<boolean>((resolve) => (complete = resolve)));
		const old = navigation.navigate(collection, member, 'user');
		const newer = { ...member, uid: 'newer' };
		router.navigateByUrl.and.resolveTo(true);
		router.url = documentUrl(newer);
		await navigation.navigate(collection, newer, 'user');
		complete(true);
		await old;
		expect(navigation.pending()?.member.uid).toBe('newer');
	});
});
