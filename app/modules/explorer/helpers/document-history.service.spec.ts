import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { AuthService } from 'app/helpers/auth.service';
import { DocumentHistoryService } from './document-history.service';

describe('DocumentHistoryService', () => {
	it('records actual view time without mutating selection and isolates accounts and repositories', () => {
		const users = new Subject<any>();
		const values = new Map<string, string>();
		spyOn(localStorage, 'getItem').and.callFake((key) => values.get(key) ?? null);
		spyOn(localStorage, 'setItem').and.callFake((key, value) => {
			values.set(key, value);
		});
		TestBed.configureTestingModule({
			providers: [{ provide: AuthService, useValue: { userInfoUpdated$: users } }],
		});
		const history = TestBed.inject(DocumentHistoryService);
		users.next({ id: 'first' });
		const doc = { uid: 'a', repository: 'default', ng: { isSelected: true } };
		history.push(doc);
		expect(doc.ng.isSelected).toBeTrue();
		expect(history.documentHistory()[0].ng.isSelected).toBeUndefined();
		expect(Date.parse(history.documentHistory()[0].lastViewed)).toBeGreaterThan(Date.now() - 1000);
		history.push({ ...doc, repository: 'other' });
		expect(history.documentHistory().length).toBe(2);
		users.next({ id: 'second' });
		expect(history.documentHistory()).toEqual([]);
		history.push({ uid: 'second-only' });
		users.next(null);
		expect(history.documentHistory()).toEqual([]);
		history.push({ uid: 'logged-out' });
		expect(history.documentHistory()).toEqual([]);
		users.next({ id: 'first' });
		expect(history.documentHistory().map((d) => d.repository)).toEqual(['other', 'default']);
		history.clear();
		expect(history.documentHistory()).toEqual([]);
	});
});
