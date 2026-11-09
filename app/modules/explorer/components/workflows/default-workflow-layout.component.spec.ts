import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { AuthService } from 'app/helpers/auth.service';
import { UsersAndGroupsFinderService } from 'app/helpers/users-and-groups-finder.service';
import { SuggestionScope, SuggestionSettings, WorkflowLayoutContext } from '@maretha/webui-sdk';
import { DefaultWorkflowLayoutComponent } from './default-workflow-layout.component';

describe('DefaultWorkflowLayoutComponent', () => {
	let fixture: ComponentFixture<DefaultWorkflowLayoutComponent>;
	let component: DefaultWorkflowLayoutComponent;
	let committed: Record<string, unknown>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [DefaultWorkflowLayoutComponent],
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: AuthService, useValue: { userInfo: () => ({ id: 'reviewer' }) } },
				{ provide: UsersAndGroupsFinderService, useValue: { find: () => of([]) } },
				SuggestionScope,
			],
		}).compileComponents();
		fixture = TestBed.createComponent(DefaultWorkflowLayoutComponent);
		component = fixture.componentInstance;
	});

	function render(taskKey: string, variables: Record<string, unknown> = {}) {
		committed = {};
		fixture.componentRef.setInput('context', {
			document: {},
			task: { id: 'task', name: taskKey },
			taskKey,
			variables,
			mode: 'process',
			readOnly: false,
			noEdit: false,
			busy: false,
			errors: {},
			commit: (value) => (committed = { ...value }),
		} satisfies WorkflowLayoutContext);
		fixture.detectChanges();
	}

	it('renders the six shipped task layouts with the stock widgets and labels', () => {
		const labels = () =>
			[...fixture.nativeElement.querySelectorAll('.nx-workflow-label')].map((label: Element) =>
				label.textContent!.trim(),
			);
		render('task38e', { validationOrReview: 'validation' });
		expect(labels()).toEqual(['Participants', 'Review Type', 'Comment']);
		expect(
			fixture.nativeElement.querySelector('.nx-workflow-label--required').textContent,
		).toContain('Participants');
		expect(fixture.nativeElement.querySelector('select').value).toBe('validation');
		expect(fixture.nativeElement.textContent).not.toContain('Search users and groups.');
		render('task542');
		expect(fixture.nativeElement.textContent.trim()).toBe('');
		render('task6d8', {
			participants: ['group:reviewers', 'system'],
			initiatorComment: 'Start',
		});
		expect(labels()).toEqual(['Participants', 'Initiator Comment', 'Comment']);
		expect(fixture.nativeElement.querySelector('.nx-workflow-group-tag').textContent.trim()).toBe(
			'reviewers',
		);
		expect(fixture.nativeElement.textContent).toContain('Start');
		render('task2556', { end_date: '2026-09-16T00:00:00.000Z' });
		expect(labels()).toEqual(['Participants', 'Comment', 'End Date']);
		expect(fixture.nativeElement.querySelector('input[type=date]').value).toBe('2026-09-16');
		render('task328d', { initiatorComment: 'Start' });
		expect(labels()).toEqual(['Initiator Comment', 'Comment']);
		render('task2169', { review_result: '<strong>Approved</strong>' });
		expect(labels()).toEqual(['Consultation Wrap-Up', 'Comment']);
		expect(fixture.nativeElement.querySelector('strong').textContent).toBe('Approved');
		TestBed.inject(HttpTestingController).verify();
	});

	it('shows user participants as tags resolved once through the shared principal cache', () => {
		const http = TestBed.inject(HttpTestingController);
		render('task6d8', { participants: ['user:alice', 'user:alice', 'user:system'] });
		const request = http.expectOne((item) => item.url.endsWith('/api/v1/user/alice'));
		request.flush({
			'entity-type': 'user',
			id: 'alice',
			properties: { firstName: 'Alice', lastName: 'Example' },
		});
		fixture.detectChanges();
		const tags = [...fixture.nativeElement.querySelectorAll('nx-user-tag')].map((tag: Element) =>
			tag.textContent!.trim(),
		);
		expect(tags).toEqual(['Alice Example', 'system']);
		render('task6d8', { participants: ['user:alice'] });
		http.expectNone((item) => item.url.includes('/user/'));
		http.verify();
	});

	it('uses typed user/group suggestions and serializes dates as ISO', fakeAsync(() => {
		const find = jasmine.createSpy('find').and.returnValue(
			of([
				{ prefixed_id: 'user:alice', displayLabel: 'Alice' },
				{ prefixed_id: 'group:reviewers', displayLabel: 'Reviewers' },
			]),
		);
		TestBed.inject(UsersAndGroupsFinderService).find = find;
		render('task2556');
		// Stock nuxeo-user-suggestion: 3 characters, then one search once typing pauses 300 ms.
		component.searchParticipants('al');
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Please enter 3 or more characters');
		tick(300);
		expect(find).not.toHaveBeenCalled();
		component.searchParticipants('ali');
		tick(299);
		expect(find).not.toHaveBeenCalled();
		tick(1);
		expect(find).toHaveBeenCalledOnceWith('ali');
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).not.toContain('Please enter');
		expect(fixture.nativeElement.textContent).toContain('Alice');
		component.addParticipant('user:alice', 'Alice');
		expect(committed['participants']).toEqual(['user:alice']);
		expect(component.participantLabel('user:alice')).toBe('Alice');
		expect(component.participantLabel('group:reviewers')).toBe('reviewers');
		component.setDate('2026-09-17');
		expect(committed['end_date']).toBe('2026-09-17T00:00:00.000Z');
	}));

	it('takes its limits from the workflow layout scope', fakeAsync(() => {
		TestBed.inject(SuggestionSettings).apply({
			layouts: { 'nuxeo.task2556': { minChars: 1, pauseMs: 0 } },
		});
		const find = jasmine.createSpy('find').and.returnValue(of([]));
		TestBed.inject(UsersAndGroupsFinderService).find = find;
		TestBed.inject(SuggestionScope).layout.set('nuxeo.task2556');
		render('task2556');
		component.searchParticipants('a');
		tick();
		expect(find).toHaveBeenCalledOnceWith('a');
	}));

	it('persists a native date control change through a new renderer context', () => {
		render('task2556', { participants: ['user:Administrator'] });
		const input = fixture.nativeElement.querySelector('input[type=date]') as HTMLInputElement;
		input.value = '2026-09-23';
		input.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		expect(committed['end_date']).toBe('2026-09-23T00:00:00.000Z');
		fixture.componentRef.setInput('context', {
			...fixture.componentInstance.context,
			variables: committed,
		} satisfies WorkflowLayoutContext);
		fixture.detectChanges();
		expect(
			(fixture.nativeElement.querySelector('input[type=date]') as HTMLInputElement).value,
		).toBe('2026-09-23');
	});
});
