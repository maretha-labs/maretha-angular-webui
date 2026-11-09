import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { POLYMER_MESSAGES, WebUiMessages } from '@maretha/webui-sdk';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { of } from 'rxjs';
import { UsersAndGroupsFinderService } from 'app/helpers/users-and-groups-finder.service';
import { WorkflowsService } from 'app/helpers/workflows.service';
import {
	TaskAssignmentDialogComponent,
	taskAssignmentDialogOptions,
} from './task-assignment-dialog.component';

describe('Task assignment dialog (stock nuxeo-document-task-assignment-popup)', () => {
	let modal: jasmine.SpyObj<BsModalRef>;
	let finder: { find: jasmine.Spy };
	let workflows: { assignTask: jasmine.Spy };
	const suggestions = [
		{
			id: 'AlexAdmin',
			type: 'USER_TYPE',
			displayLabel: 'Alex Morgan',
			email: 'alex@example.test',
		},
		{ id: 'members', type: 'GROUP_TYPE', displayLabel: 'Members' },
	];

	function open(action: 'reassign' | 'delegate'): ComponentFixture<TaskAssignmentDialogComponent> {
		const fixture = TestBed.createComponent(TaskAssignmentDialogComponent);
		Object.assign(
			fixture.componentInstance,
			taskAssignmentDialogOptions(
				{ id: 'task-1', name: 'wf.serialDocumentReview.DocumentValidation' },
				action,
			).initialState,
		);
		fixture.detectChanges();
		return fixture;
	}
	const text = (fixture: ComponentFixture<unknown>, selector: string) =>
		[...(fixture.nativeElement as HTMLElement).querySelectorAll(selector)].map((node) =>
			node.textContent!.replace(/\s+/g, ' ').trim(),
		);
	const input = (fixture: ComponentFixture<unknown>) =>
		(fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input')!;
	const type = (fixture: ComponentFixture<unknown>, value: string) => {
		input(fixture).value = value;
		input(fixture).dispatchEvent(new Event('input'));
		fixture.detectChanges();
	};

	beforeEach(() => {
		modal = jasmine.createSpyObj<BsModalRef>('modal', ['hide']);
		finder = { find: jasmine.createSpy('find').and.returnValue(of(suggestions)) };
		workflows = {
			assignTask: jasmine.createSpy('assignTask').and.returnValue(of({ id: 'task-1' })),
		};
		TestBed.configureTestingModule({
			imports: [TaskAssignmentDialogComponent],
			providers: [
				{ provide: BsModalRef, useValue: modal },
				{ provide: UsersAndGroupsFinderService, useValue: finder },
				{ provide: WorkflowsService, useValue: workflows },
			],
		});
		TestBed.inject(WebUiMessages).register('polymer', POLYMER_MESSAGES);
	});

	it('shows the task name, the required user field, the comment, Close and the action', () => {
		const fixture = open('reassign');
		expect(text(fixture, 'h2')).toEqual(['Validate the Document']);
		expect(text(fixture, 'label')).toEqual(['Choose the user', 'Include a comment']);
		expect(
			fixture.nativeElement
				.querySelector('label')
				.classList.contains('nx-task-assignment__label--required'),
		).toBeTrue();
		expect(input(fixture).placeholder).toBe('Type here');
		expect(fixture.nativeElement.querySelector('textarea').placeholder).toBe('Type here');
		expect(text(fixture, '.nx-task-assignment__buttons button')).toEqual(['Close', 'Reassign']);
		expect(fixture.nativeElement.querySelector('input[type=checkbox]')).toBeNull();
		expect(text(open('delegate'), '.nx-task-assignment__buttons button')).toEqual([
			'Close',
			'Delegate',
		]);
		fixture.nativeElement.querySelector('.nx-task-assignment__secondary').click();
		expect(modal.hide).toHaveBeenCalled();
	});

	it('searches users and groups from three characters, once typing pauses for 300 ms', fakeAsync(() => {
		const fixture = open('reassign');
		input(fixture).dispatchEvent(new Event('focus'));
		fixture.detectChanges();
		expect(text(fixture, '.nx-task-assignment__message')).toEqual([
			'Please enter 3 or more characters',
		]);
		type(fixture, 'et');
		tick(300);
		expect(finder.find).not.toHaveBeenCalled();
		type(fixture, 'eth');
		tick(200);
		type(fixture, 'etha');
		tick(299);
		expect(finder.find).not.toHaveBeenCalled();
		tick(1);
		fixture.detectChanges();
		expect(finder.find).toHaveBeenCalledOnceWith('etha');
		expect(text(fixture, '.nx-task-assignment__entity > span')).toEqual([
			'Alex Morgan',
			'alex@example.test - AlexAdmin',
			'Members',
			'Group - members',
		]);
		input(fixture).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
		input(fixture).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		fixture.detectChanges();
		expect(text(fixture, '.nx-task-assignment__chip')).toEqual(['×Members']);
		expect(input(fixture).value).toBe('');
	}));

	it('requires a user or group, then sends one assignment and closes', fakeAsync(() => {
		const fixture = open('reassign');
		const component = fixture.componentInstance;
		let assigned: unknown;
		component.assigned.subscribe((task) => (assigned = task));
		fixture.nativeElement.querySelector('.nx-task-assignment__primary').click();
		fixture.detectChanges();
		expect(workflows.assignTask).not.toHaveBeenCalled();
		expect(input(fixture).getAttribute('aria-invalid')).toBe('true');
		type(fixture, 'etha');
		tick(300);
		fixture.detectChanges();
		fixture.nativeElement.querySelector('.nx-task-assignment__result').click();
		type(fixture, 'mem');
		tick(300);
		fixture.detectChanges();
		fixture.nativeElement.querySelector('.nx-task-assignment__result').click();
		const comment = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
		comment.value = 'Over to you';
		comment.dispatchEvent(new Event('input'));
		fixture.nativeElement.querySelector('.nx-task-assignment__primary').click();
		expect(workflows.assignTask).toHaveBeenCalledOnceWith(
			'task-1',
			'reassign',
			['AlexAdmin', 'members'],
			'Over to you',
		);
		expect(modal.hide).toHaveBeenCalledTimes(1);
		expect(assigned).toEqual({ id: 'task-1' });
		expect(finder.find).toHaveBeenCalledTimes(2);
	}));
});
