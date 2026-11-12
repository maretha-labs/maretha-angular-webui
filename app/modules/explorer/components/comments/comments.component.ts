import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectorRef,
	Component,
	OnDestroy,
	computed,
	ChangeDetectionStrategy,
} from '@angular/core';
import {
	UntypedFormBuilder,
	UntypedFormGroup,
	Validators,
	FormsModule,
	ReactiveFormsModule,
} from '@angular/forms';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { AuthService } from 'app/helpers/auth.service';
import { UnescapePipe } from 'app/pipes/unescape.pipe';
import { ToastService } from 'app/helpers/toast.service';
import { Subject } from 'rxjs';
import { NgTemplateOutlet, NgClass } from '@angular/common';
import { AutofocusDirective } from '../../../../directives/autofocus.directive';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
	BsDropdownDirective,
	BsDropdownToggleDirective,
	BsDropdownMenuDirective,
} from 'ngx-bootstrap/dropdown';
import { TimeagoModule } from 'ngx-timeago';

@Component({
	selector: 'nx-comments',
	templateUrl: './comments.component.html',
	styleUrls: ['./comments.component.scss'],
	providers: [UnescapePipe],
	imports: [
		NgTemplateOutlet,
		FormsModule,
		ReactiveFormsModule,
		AutofocusDirective,
		TooltipDirective,
		FontAwesomeModule,
		NgClass,
		BsDropdownDirective,
		BsDropdownToggleDirective,
		BsDropdownMenuDirective,
		UnescapePipe,
		TimeagoModule,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommentsComponent implements OnDestroy {
	private readonly uiCommentsComponentMessages = injectUiMessages(RuntimeUiMessages);

	private destroy$ = new Subject();

	parentUid: string = this.documentsManagerService.documentInfo?.uid;
	readonly readOnly = this.documentsManagerService.documentInfo?.isTrashed;
	documentComments: any[] = [];
	form?: UntypedFormGroup;
	focus = false;
	currentPage = 1;
	canLoadMore = false;
	readonly currentUser = computed(() => this.authService.userInfo()?.id);
	users: Record<string, number> = {};

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly documentsManagerService: DocumentsManagerService,
		private readonly fb: UntypedFormBuilder,
		private readonly unescapePipe: UnescapePipe,
		private readonly authService: AuthService,
		private readonly toastrService: ToastService,
		private readonly cdr: ChangeDetectorRef,
	) {
		this.form = this.fb.group({
			text: [null, [Validators.required]],
			reply: [null],
			edit: [null],
		});

		this.loadComments();
	}

	// --------------------------------------------------------------------------------------------------
	loadComments() {
		this.documentsManagerService
			.getComments(this.parentUid, this.currentPage - 1)
			.subscribe((x: any) => {
				if (!x) return;

				this.documentComments = [
					...this.documentComments,
					...x.entries
						.map((y: any) => {
							y.currentPage = 1;
							y.replies = [];
							y.canLoadMore = y.numberOfReplies > 0;

							if (!this.users[y.author]) this.users[y.author] = Object.keys(this.users).length + 1;

							return y;
						})
						.sort(
							(a: any, b: any) =>
								b.modificationDate - a.modificationDate || b.creationDate - a.creationDate,
						),
				];

				this.currentPage++;

				this.canLoadMore = x.totalSize > this.documentComments.length;
				this.cdr.markForCheck();
			});
	}

	// --------------------------------------------------------------------------------------------------
	loadReplies(comment: any) {
		if (!comment) return;

		this.documentsManagerService
			.getComments(comment.id, comment.currentPage - 1)
			.subscribe((x: any) => {
				if (!x) return;

				comment.replies = [
					...comment.replies,
					...x.entries
						.map((y: any) => {
							if (!this.users[y.author]) this.users[y.author] = Object.keys(this.users).length + 1;

							return y;
						})
						.sort(
							(a: any, b: any) =>
								b.modificationDate - a.modificationDate || b.creationDate - a.creationDate,
						),
				];

				comment.currentPage++;

				comment.canLoadMore = x.totalSize > comment.replies.length;
				this.cdr.markForCheck();
			});
	}

	// --------------------------------------------------------------------------------------------------
	reply(comment: any) {
		this.form?.get('text')?.setValue(null);
		this.form?.get('reply')?.setValue(comment);
		this.form?.get('edit')?.setValue(null);
		this.focus = true;
	}

	// --------------------------------------------------------------------------------------------------
	edit(comment: any) {
		this.form?.get('text')?.setValue(this.unescapePipe.transform(comment.text));
		this.form?.get('reply')?.setValue(null);
		this.form?.get('edit')?.setValue(comment);
		this.focus = true;
	}

	// --------------------------------------------------------------------------------------------------
	remove(comment: any) {
		this.documentsManagerService.deleteComment(comment.parentId, comment.id).subscribe(() => {
			const ancestorIds = comment.ancestorIds;

			let comments;

			if (ancestorIds.length === 1) comments = this.documentComments;
			else comments = this.documentComments.find((x) => x.id === ancestorIds[1])?.replies;

			const index = comments.findIndex((x: any) => x.id === comment.id);

			if (index >= 0) comments.splice(index, 1);

			this.clear();
			this.cdr.markForCheck();

			this.toastrService.info(
				this.uiCommentsComponentMessages.text(
					'app.notices.your-comment-was-removed-6e4bf3',
					'Your comment was removed.',
				),
				this.uiCommentsComponentMessages.text(
					'app.notices.comment-removed-f80ae1',
					'Comment removed',
				),
				{ enableHtml: false },
			);
		});
	}

	// --------------------------------------------------------------------------------------------------
	save() {
		const parentId =
			this.form?.get('reply')?.value?.id ||
			this.form?.get('edit')?.value?.parentId ||
			this.parentUid;
		const commentId = this.form?.get('edit')?.value?.id;

		this.documentsManagerService
			.leaveComment(parentId, this.form?.get('text')?.value, commentId)
			.subscribe((comment) => {
				if (this.form?.get('edit')?.value) {
					const ancestorIds = this.form?.get('edit')?.value.ancestorIds;

					let parent;

					if (ancestorIds.length === 1)
						parent = this.documentComments.find((x) => x.id === this.form?.get('edit')?.value.id);
					else {
						const ancestor = this.documentComments.find((x) => x.id === ancestorIds[0]);
						parent = ancestor.replies.find((x: any) => x.id === this.form?.get('edit')?.value.id);
					}

					parent.text = this.form?.get('text')?.value;
				} else if (this.form?.get('reply')?.value) {
					const ancestorIds = this.form?.get('reply')?.value.ancestorIds;

					let parent;

					if (ancestorIds.length === 1)
						parent = this.documentComments.find((x) => x.id === this.form?.get('reply')?.value.id);
					else {
						const ancestor = this.documentComments.find((x) => x.id === ancestorIds[1]);
						parent = ancestor.replies.find((x: any) => x.id === this.form?.get('reply')?.value.id);
					}

					parent.replies = parent.replies || [];
					parent.replies.unshift(comment);

					parent.numberOfReplies = (parent.numberOfReplies | 0) + 1;
				} else this.documentComments.unshift(comment);

				this.clear();
				this.cdr.markForCheck();

				this.toastrService.info(
					this.uiCommentsComponentMessages.text(
						'app.notices.your-comment-was-saved-bccb02',
						'Your comment was saved.',
					),
					this.uiCommentsComponentMessages.text(
						'app.notices.comment-saved-dbb46c',
						'Comment saved',
					),
					{ enableHtml: false },
				);
			});
	}

	// --------------------------------------------------------------------------------------------------
	clear() {
		this.form?.get('text')?.setValue(null);
		this.form?.get('reply')?.setValue(null);
		this.form?.get('edit')?.setValue(null);
	}

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy(): void {
		this.destroy$.next(0);
	}
}
