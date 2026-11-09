import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { of } from 'rxjs';

import { CommentsComponent } from './comments.component';

describe('CommentsComponent', () => {
	let component: CommentsComponent;
	let fixture: ComponentFixture<CommentsComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [CommentsComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(CommentsComponent);
		component = fixture.componentInstance;
		component.documentComments = [
			{
				id: 'reply-target',
				text: 'Review the draft',
				author: 'alice',
				creationDate: '2026-09-01T12:00:00Z',
				expanded: false,
				replies: [],
			},
		];
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
	it('provides a focusable reply button that selects and expands its comment', () => {
		const comment = component.documentComments[0];
		const reply = fixture.nativeElement.querySelector('.comment-reply') as HTMLButtonElement;
		expect(reply.tagName).toBe('BUTTON');
		expect(reply.type).toBe('button');
		reply.focus();
		expect(document.activeElement).toBe(reply);
		reply.click();
		expect(component.form?.get('reply')?.value).toBe(comment);
		expect(comment.expanded).toBeTrue();
	});

	it('renders a thread that arrives after the view was first checked', () => {
		const manager = (component as any).documentsManagerService;
		spyOn(manager, 'getComments').and.returnValue(
			of({
				entries: [
					{
						id: 'rest-1',
						parentId: 'doc-1',
						ancestorIds: ['doc-1'],
						text: 'Posted through REST',
						author: 'bob',
						creationDate: '2026-09-02T12:00:00Z',
						modificationDate: '2026-09-02T12:00:00Z',
						numberOfReplies: 0,
					},
				],
				totalSize: 1,
			}),
		);
		component.documentComments = [];
		component.currentPage = 1;
		component.loadComments();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Posted through REST');
	});
});
