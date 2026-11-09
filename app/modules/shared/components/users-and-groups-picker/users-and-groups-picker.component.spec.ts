import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { UsersAndGroupsFinderService } from 'app/helpers/users-and-groups-finder.service';

import { UsersAndGroupsPickerComponent } from './users-and-groups-picker.component';

describe('UsersAndGroupsComponent', () => {
	let component: UsersAndGroupsPickerComponent;
	let fixture: ComponentFixture<UsersAndGroupsPickerComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [UsersAndGroupsPickerComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(UsersAndGroupsPickerComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});

describe('UsersAndGroupsPickerComponent search behaviour', () => {
	let finder: jasmine.SpyObj<UsersAndGroupsFinderService>;
	let fixture: ComponentFixture<UsersAndGroupsPickerComponent>;
	let component: UsersAndGroupsPickerComponent;
	beforeEach(() => {
		finder = jasmine.createSpyObj('finder', ['find', 'findUsers', 'findGroups']);
		finder.find.and.returnValue(of([{ id: 'both', type: 'USER_TYPE' }]));
		finder.findUsers.and.returnValue(of([{ id: 'user-only', type: 'USER_TYPE' }]));
		finder.findGroups.and.returnValue(of([{ id: 'group-only', type: 'GROUP_TYPE' }]));
		TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				{ provide: UsersAndGroupsFinderService, useValue: finder },
			],
			imports: [UsersAndGroupsPickerComponent],
		});
		fixture = TestBed.createComponent(UsersAndGroupsPickerComponent);
		component = fixture.componentInstance;
	});
	function emissions(): any[][] {
		const seen: any[][] = [];
		component.items$.subscribe((items) => seen.push(items));
		return seen;
	}

	it('searches users and groups after the stock pause, skipping short terms and swallowing errors', fakeAsync(() => {
		const seen = emissions();
		expect(seen).toEqual([[]]);
		component.searchTerm$.next('ab');
		tick(300);
		expect(finder.find).not.toHaveBeenCalled();
		expect(component.loading).toBeFalse();
		expect(seen.length).toBe(2);
		component.searchTerm$.next('bob');
		expect(component.loading).toBeFalse();
		tick(299);
		expect(finder.find).not.toHaveBeenCalled();
		tick(1);
		expect(finder.find).toHaveBeenCalledOnceWith('bob');
		expect(seen.at(-1)).toEqual([{ id: 'both', type: 'USER_TYPE' }]);
		expect(component.loading).toBeFalse();
		finder.find.and.returnValue(throwError(() => new Error('offline')));
		component.searchTerm$.next('carol');
		tick(300);
		expect(seen.at(-1)).toEqual([]);
		component.searchTerm$.next('carol');
		tick(300);
		expect(finder.find).toHaveBeenCalledTimes(2);
	}));
	it('restricts the lookup to the configured principal kinds', fakeAsync(() => {
		component.findUsers = false;
		expect(component.findOnlyUsers).toBeFalse();
		const seen = emissions();
		component.searchTerm$.next('team');
		tick(300);
		expect(finder.findGroups).toHaveBeenCalledOnceWith('team');
		expect(seen.at(-1)).toEqual([{ id: 'group-only', type: 'GROUP_TYPE' }]);
		component.findUsers = true;
		component.findGroups = false;
		expect(component.findOnlyUsers).toBeTrue();
		component.searchTerm$.next('alice');
		tick(300);
		expect(finder.findUsers).toHaveBeenCalledOnceWith('alice');
		expect(seen.at(-1)).toEqual([{ id: 'user-only', type: 'USER_TYPE' }]);
		expect(finder.find).not.toHaveBeenCalled();
	}));
	it('refuses a picker that searches for nothing', () => {
		component.findUsers = false;
		component.findGroups = false;
		expect(() => fixture.detectChanges()).toThrow(
			'nx-users-and-groups: You must specify what to search for',
		);
	});
	it('loads the default entries once on focus and bridges the nested control to the parent form', () => {
		fixture.detectChanges();
		const terms: string[] = [];
		component.searchTerm$.subscribe((term) => terms.push(term));
		component.fetchEntries(new Event('focus'));
		component.fetchEntries(new Event('focus'));
		expect(terms).toEqual(['']);
		expect(component.trackByFn({ id: 'alice' })).toBe('alice');
		expect(component.compareFn({ prefixed_id: 'user:alice' }, 'user:alice')).toBeTrue();
		expect(component.compareFn({ prefixed_id: 'user:alice' }, 'user:bob')).toBeFalse();
		expect(component.compareFn({ id: 'alice' }, 'alice')).toBeFalse();
		const changes: any[] = [];
		const touched = jasmine.createSpy('touched');
		component.registerOnChange((value: any) => changes.push(value));
		component.registerOnTouched(touched);
		component.writeValue('user:alice');
		expect(component.formControl.value).toBe('user:alice');
		expect(changes).toEqual([]);
		component.formControl.setValue('user:bob');
		expect(changes).toEqual(['user:bob']);
		expect(touched).toHaveBeenCalledOnceWith('user:bob');
		component.setDisabledState(true);
		expect(component.formControl.disabled).toBeTrue();
		component.setDisabledState(false);
		expect(component.formControl.enabled).toBeTrue();
		// Disabling and enabling re-emit the current value to the parent form.
		expect(changes).toEqual(['user:bob', 'user:bob', 'user:bob']);
		expect(component.validate(new FormControl())).toBeNull();
		component.ngOnDestroy();
		component.formControl.setValue('user:carol');
		expect(changes.length).toBe(3);
		expect(touched).toHaveBeenCalledTimes(3);
	});
});
