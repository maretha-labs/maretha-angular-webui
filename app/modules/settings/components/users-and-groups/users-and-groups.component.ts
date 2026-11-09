import { inject as injectI18n } from '@angular/core';
import { WebUiIconComponent, WebUiMessages, WebUiNumberPipe } from '@maretha/webui-sdk';
import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	CdkDrag,
	CdkDragDrop,
	CdkDropList,
	CdkDropListGroup,
	CdkDragPreview,
	CdkDragPlaceholder,
} from '@angular/cdk/drag-drop';
import {
	ChangeDetectorRef,
	Component,
	HostListener,
	ChangeDetectionStrategy,
	OnDestroy,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { UserTagComponent } from 'app/modules/shared/components/user-tag/user-tag.component';
import { User } from 'app/models/user';
import { UserGroup } from 'app/models/user-group';
import {
	ConfirmationDialogComponent,
	confirmationDialogOptions,
} from 'app/modules/shared/components/confirmation-dialog/confirmation-dialog.component';
import { BsModalService, ModalOptions } from 'ngx-bootstrap/modal';
import { take, Subject, takeUntil, Observable, merge, EMPTY, finalize } from 'rxjs';
import {
	AdministrationPage,
	ManagedUserGroup,
	UsersAndGroupsService,
} from '../../helpers/users-and-groups.service';
import { UserAndGroupEditorComponent } from '../user-and-group-editor/user-and-group-editor.component';
import { UserAndGroupPermissionsComponent } from '../user-and-group-permissions/user-and-group-permissions.component';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
	BsDropdownDirective,
	BsDropdownToggleDirective,
	BsDropdownMenuDirective,
} from 'ngx-bootstrap/dropdown';

type DirectoryColumn = 'name' | 'id' | 'email';
interface DirectorySort {
	column: DirectoryColumn;
	direction: 'ascending' | 'descending';
}

type AdministrationList = 'users' | 'groups' | 'memberUsers' | 'memberGroups';
interface ListPage extends AdministrationPage<any> {
	loading: boolean;
	error: string;
	query: string;
}
const emptyPage = (): ListPage => ({
	entries: [],
	pageIndex: 0,
	numberOfPages: null,
	hasNext: false,
	loading: false,
	error: '',
	query: '',
});

@Component({
	selector: 'nx-users-and-groups',
	templateUrl: './users-and-groups.component.html',
	styleUrls: ['./users-and-groups.component.scss'],
	imports: [
		NgTemplateOutlet,
		WebUiIconComponent,
		UserAndGroupEditorComponent,
		UserTagComponent,
		CdkDropListGroup,
		TooltipDirective,
		FontAwesomeModule,
		BsDropdownDirective,
		BsDropdownToggleDirective,
		BsDropdownMenuDirective,
		CdkDropList,
		CdkDrag,
		CdkDragPreview,
		CdkDragPlaceholder,
		WebUiMessagePipe,
		WebUiNumberPipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersAndGroupsComponent implements OnDestroy {
	readonly i18n = injectI18n(WebUiMessages);
	pageError(kind: AdministrationList): string {
		const error = this.pages[kind].error;
		if (error === 'Unable to load this directory page.')
			return this.i18n.format(
				'app.settingsShared.unable-to-load-this-directory-page-8ae94c',
				{},
				'Unable to load this directory page.',
			);
		if (error === 'Unable to load group members. Retry.')
			return this.i18n.format(
				'app.settingsShared.unable-to-load-group-members-retry-a1725f',
				{},
				'Unable to load group members. Retry.',
			);
		return error;
	}

	private dragCanceled = false;
	private readonly destroy$ = new Subject<void>();
	private readonly selectionChanged$ = new Subject<void>();
	private readonly directoryChanged$ = new Subject<void>();
	private readonly memberRequests = {
		memberUsers: new Subject<void>(),
		memberGroups: new Subject<void>(),
	};
	private directoryLoaded = false;
	selectedType: 'user' | 'group' | null = null;
	selectedId: string | null = null;
	selectionLoading = false;
	private readonly selectionErrorMessageState = localizedText();
	get selectionError(): string {
		return this.selectionErrorMessageState();
	}
	set selectionError(value: string | MessageText) {
		this.selectionErrorMessageState.set(value);
	}
	private readonly directoryErrorMessageState = localizedText();
	get directoryError(): string {
		return this.directoryErrorMessageState();
	}
	set directoryError(value: string | MessageText) {
		this.directoryErrorMessageState.set(value);
	}
	private readonly actionErrorState = localizedText();
	get actionError(): string {
		return this.actionErrorState();
	}
	set actionError(value: string | MessageText) {
		this.actionErrorState.set(value);
	}
	actionBusy = false;
	pendingDelete = false;
	directoryQuery = '';
	recentEntries: any[] = [];
	directorySort: DirectorySort[] = [];
	creating: 'user' | 'group' | null = null;
	readonly directoryKinds: readonly AdministrationList[] = ['users', 'groups'];
	readonly pages: Record<AdministrationList, ListPage> = {
		users: emptyPage(),
		groups: emptyPage(),
		memberUsers: emptyPage(),
		memberGroups: emptyPage(),
	};

	userGroups: any[] = [];
	users: any[] = [];

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly usersAndGroupsService: UsersAndGroupsService,
		private readonly modalService: BsModalService,
		private readonly cdr: ChangeDetectorRef,
		private readonly route: ActivatedRoute,
		private readonly router: Router,
	) {
		this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
			const entity = params.get('entity');
			this.selectedType = entity === 'user' || entity === 'group' ? entity : null;
			this.selectedId = this.selectedType ? params.get('id') : null;
			this.applyRouteSelection();
		});
		this.getUsersAndGroups();
	}

	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
		this.selectionChanged$.complete();
		this.directoryChanged$.complete();
		Object.values(this.memberRequests).forEach((request) => request.complete());
	}

	// --------------------------------------------------------------------------------------------------
	@HostListener('window:keyup', ['$event'])
	handleKeyboardEvent(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			this.dragCanceled = true;
			document.dispatchEvent(new Event('mouseup'));
		}
	}

	// --------------------------------------------------------------------------------------------------
	trackByFn = (user: any) => user.id;

	// --------------------------------------------------------------------------------------------------

	// --------------------------------------------------------------------------------------------------
	getUsersAndGroups() {
		this.directoryChanged$.next();
		this.selectionChanged$.next();
		this.pages.users.loading = this.pages.groups.loading = true;
		this.pages.users.error = this.pages.groups.error = '';
		this.directoryError = '';
		this.usersAndGroupsService
			.getDirectory(
				this.directoryQuery.trim(),
				this.pages.users.pageIndex,
				this.pages.groups.pageIndex,
			)
			.pipe(takeUntil(this.directoryChanged$), takeUntil(this.destroy$))
			.subscribe({
				next: (x) => {
					this.recentEntries = x.recentEntries ?? [];
					this.userGroups = x.groups;
					this.users = x.users;
					Object.assign(this.pages.users, x.usersPage ?? { entries: x.users }, { loading: false });
					Object.assign(this.pages.groups, x.groupsPage ?? { entries: x.groups }, {
						loading: false,
					});
					const usersMoved = this.returnFromEmptyPage(this.pages.users);
					const groupsMoved = this.returnFromEmptyPage(this.pages.groups);
					if (usersMoved || groupsMoved) {
						this.getUsersAndGroups();
						return;
					}
					this.directoryLoaded = true;
					this.directoryError = '';
					this.applyRouteSelection();
				},
				error: () => {
					this.pages.users.loading = this.pages.groups.loading = false;
					this.pages.users.error = this.pages.groups.error = 'Unable to load this directory page.';
					this.directoryLoaded = true;
					this.directoryError = messageText(
						'app.state.unable-to-load-users-and-groups-5ae278',
						'Unable to load users and groups.',
					);
					this.applyRouteSelection();
				},
			});
	}

	directoryRows(): any[] {
		if (this.directoryQuery.trim())
			return [
				...this.userGroups.map((row) => ({ ...row, kind: 'group' })),
				...this.users.map((row) => ({ ...row, kind: 'user' })),
			];
		if (!this.directorySort.length) return this.recentEntries;
		// The recent provider is a single complete list; paged search results retain server order.
		return [...this.recentEntries].sort((a, b) => {
			for (const { column, direction } of this.directorySort) {
				const result = this.directorySortValue(a, column).localeCompare(
					this.directorySortValue(b, column),
					this.i18n.locale(),
					{ sensitivity: 'base' },
				);
				if (result) return direction === 'ascending' ? result : -result;
			}
			return 0;
		});
	}

	sortDirectory(column: DirectoryColumn): void {
		const current = this.directorySort.find((sort) => sort.column === column);
		if (!current) this.directorySort = [...this.directorySort, { column, direction: 'ascending' }];
		else if (current.direction === 'ascending') current.direction = 'descending';
		else this.directorySort = this.directorySort.filter((sort) => sort !== current);
	}

	directorySortDirection(column: DirectoryColumn): 'ascending' | 'descending' | 'none' {
		return this.directorySort.find((sort) => sort.column === column)?.direction ?? 'none';
	}

	directorySortPriority(column: DirectoryColumn): number {
		return this.directorySort.findIndex((sort) => sort.column === column) + 1;
	}

	private directorySortValue(row: any, column: DirectoryColumn): string {
		if (column === 'name') {
			const name =
				row.kind === 'group' ? row.name : [row.firstName, row.lastName].filter(Boolean).join(' ');
			return name || row.id || '';
		}
		return row[column] || '';
	}

	openDirectoryRow(row: any): void {
		this.selectEntity(row.kind, row);
	}
	created(): void {
		this.getUsersAndGroups();
	}

	searchDirectory(query: string) {
		this.directoryQuery = query;
		this.pages.users.pageIndex = this.pages.groups.pageIndex = 0;
		this.getUsersAndGroups();
	}

	page(kind: AdministrationList): ListPage {
		return this.pages[kind];
	}

	private returnFromEmptyPage(page: ListPage): boolean {
		if (page.entries.length || page.pageIndex === 0) return false;
		page.pageIndex = Math.max(
			0,
			Math.min(page.pageIndex - 1, (page.numberOfPages ?? page.pageIndex) - 1),
		);
		return true;
	}

	changePage(kind: AdministrationList, index: number) {
		if (index < 0 || this.pages[kind].loading) return;
		this.pages[kind].pageIndex = index;
		if (kind === 'users' || kind === 'groups') this.getUsersAndGroups();
		else this.loadMembers(kind);
	}

	searchMembers(kind: 'memberUsers' | 'memberGroups', query: string) {
		this.pages[kind].query = query;
		this.pages[kind].pageIndex = 0;
		this.loadMembers(kind);
	}

	private loadMembers(kind: 'memberUsers' | 'memberGroups') {
		this.memberRequests[kind].next();
		if (this.selectedType !== 'group' || !this.selectedId) return;
		const page = this.pages[kind];
		page.loading = true;
		page.error = '';
		this.usersAndGroupsService
			.getGroupMembers(
				this.selectedId,
				kind === 'memberUsers' ? 'user' : 'group',
				page.query,
				page.pageIndex,
			)
			.pipe(
				takeUntil(this.memberRequests[kind]),
				takeUntil(this.selectionChanged$),
				takeUntil(this.destroy$),
			)
			.subscribe({
				next: (result) => {
					Object.assign(page, result, { loading: false });
					// Removing the last entry on a page returns to the preceding page, as in Polymer.
					if (this.returnFromEmptyPage(page)) this.loadMembers(kind);
					this.cdr.markForCheck();
				},
				error: () => {
					page.loading = false;
					page.error = 'Unable to load group members. Retry.';
					this.cdr.markForCheck();
				},
			});
	}

	private refreshMembers() {
		if (this.selectedType !== 'group') return;
		this.loadMembers('memberUsers');
		this.loadMembers('memberGroups');
	}

	private applyRouteSelection() {
		this.selectionChanged$.next();
		this.pages.memberUsers = emptyPage();
		this.pages.memberGroups = emptyPage();
		this.selectionLoading = false;
		this.selectionError = '';
		this.users.forEach((user) => (user.expanded = false));
		this.userGroups.forEach((group) => (group.expanded = false));
		this.cdr.markForCheck();
		if (!this.directoryLoaded || !this.selectedType || !this.selectedId) return;
		const isGroup = this.selectedType === 'group';
		const entries = isGroup ? this.userGroups : this.users;
		const existing = entries.find((entry) => entry.id === this.selectedId);
		if (existing) {
			existing.expanded = true;
			if (!isGroup || Array.isArray(existing.memberGroups)) {
				this.refreshMembers();
				return;
			}
		}
		this.selectionLoading = true;
		const request: Observable<User | UserGroup> = isGroup
			? this.usersAndGroupsService.getGroup(this.selectedId)
			: this.usersAndGroupsService.getUser(this.selectedId);
		request.pipe(takeUntil(this.selectionChanged$), takeUntil(this.destroy$)).subscribe({
			next: (entry) => {
				if (isGroup) {
					const group = entry as UserGroup;
					group.users = group.users.map(
						(user) => this.users.find((value) => value.id === user.id) ?? user,
					);
				} else {
					const user = entry as User;
					user.groups = user.groups.map(
						(group) => this.userGroups.find((value) => value.id === group.id) ?? group,
					);
				}
				if (existing) Object.assign(existing, entry, { expanded: true });
				else entries.unshift({ ...entry, expanded: true });
				this.selectionLoading = false;
				this.refreshMembers();
				this.cdr.markForCheck();
			},
			error: () => {
				this.selectionLoading = false;
				this.selectionError = messageText(
					'app.settingsShared.kind-select-group-unable-to-load-group-id-other-8eaf44',
					'{kind, select, group {Unable to load group {id}.} other {Unable to load user {id}.}}',
					{ kind: this.selectedType, id: this.selectedId },
				);
				this.cdr.markForCheck();
			},
		});
	}

	clearSelection() {
		void this.router.navigate([], {
			relativeTo: this.route,
			queryParams: { entity: null, id: null },
			queryParamsHandling: 'merge',
			preserveFragment: true,
		});
	}

	private selectEntity(type: 'user' | 'group', entry: any) {
		if (entry.expanded) {
			this.clearSelection();
			return;
		}
		void this.router.navigate([], {
			relativeTo: this.route,
			queryParams: { admin: 'users', entity: type, id: entry.id },
			queryParamsHandling: 'merge',
			preserveFragment: true,
		});
	}

	// --------------------------------------------------------------------------------------------------
	showEditor(isUserGroup: boolean, userOrGroup?: User | UserGroup) {
		if (!userOrGroup) {
			this.creating = isUserGroup ? 'group' : 'user';
			this.cdr.markForCheck();
			return;
		}
		const adding = !userOrGroup;
		const initialState: ModalOptions = {
			initialState: {
				isUserGroup,
				add: userOrGroup == undefined,
				userOrGroup,
			},
			class: 'modal-md',
			ignoreBackdropClick: true,
			keyboard: false,
		};

		const bsModalRef = this.modalService.show(UserAndGroupEditorComponent, initialState);
		bsModalRef.content?.save$
			.pipe(takeUntil(bsModalRef.onHidden ?? EMPTY), takeUntil(this.destroy$))
			.subscribe((response) => {
				this.cdr.markForCheck();
				if (response.invited) {
					this.getUsersAndGroups();
					return;
				}
				if (adding) {
					// A new user/group was created
					if (isUserGroup) {
						this.userGroups.push(response);
						this.userGroups.sort((a: any, b: any) => a.id.localeCompare(b.id));

						// Add the created group to the group's users array
						const group = response as UserGroup;
						for (const groupUser of group.users) {
							const user = this.users.find((y) => y.id === groupUser.id);
							if (user) {
								user.groups.push(group);

								user.groups.sort((a: UserGroup, b: UserGroup) => a.name.localeCompare(b.name));
							}
						}
					} else {
						this.users.push(response);
						this.users.sort((a: any, b: any) => a.id.localeCompare(b.id));

						// Add the created user to the user's groups array
						const user = response as User;
						for (const userGroup of user.groups) {
							const group = this.userGroups.find((y) => y.id === userGroup.id);
							if (group) group.users.push(user);
						}
					}

					userOrGroup = response;
				}

				if (isUserGroup) {
					const foundGroup = isUserGroup
						? (this.userGroups.find((y) => y.id === userOrGroup!.id) as UserGroup)
						: undefined;
					if (foundGroup) {
						const group = response as UserGroup;

						foundGroup.name = group.name;
						foundGroup.description = group.description;
						if (Array.isArray((group as ManagedUserGroup).memberGroups))
							(foundGroup as ManagedUserGroup).memberGroups = (
								group as ManagedUserGroup
							).memberGroups;
						foundGroup.users = group.users.map((y) => this.users.find((z) => z.id === y.id) ?? y);

						for (const user of this.users) {
							const existingGroupIndex = user.groups.findIndex((y: any) => y.id === group.id);
							const foundUser = group.users.find((y) => y.id === user.id);
							const memberGroups = (foundGroup as Partial<ManagedUserGroup>).memberGroups;
							const inherited = memberGroups?.some((id) =>
								user.groups.some((membership: UserGroup) => membership.id === id),
							);

							// If the user is part of the current group, but the user was detached from this group, then remove the user from the group
							if (existingGroupIndex >= 0 && !foundUser && !inherited && memberGroups)
								user.groups.splice(existingGroupIndex, 1);
							else if (existingGroupIndex < 0 && (foundUser || inherited)) {
								user.groups.push(group);

								user.groups.sort((a: UserGroup, b: UserGroup) => a.name.localeCompare(b.name));
							}
						}
					}
				} else {
					const foundUser = isUserGroup
						? undefined
						: (this.users.find((y) => y.id === userOrGroup!.id) as User);
					if (foundUser) {
						const user = response as User;

						foundUser.name = user.name;
						foundUser.firstName = user.firstName;
						foundUser.lastName = user.lastName;
						foundUser.email = user.email;
						foundUser.company = user.company;
						foundUser.groups = user.groups.map(
							(y) => this.userGroups.find((z) => z.id === y.id) ?? y,
						);

						for (const userGroup of this.userGroups) {
							const existingUserIndex = userGroup.users.findIndex((y: any) => y.id === user.id);
							const foundGroup = user.groups.find((y) => y.id === userGroup.id);

							// If the group contains the current user, but the user was detached from this group, then remove the user from this group
							if (existingUserIndex >= 0 && !foundGroup)
								userGroup.users.splice(existingUserIndex, 1);
							else if (existingUserIndex < 0 && foundGroup) userGroup.users.push(user);
						}
					}
				}
				this.getUsersAndGroups();
			});
	}

	memberGroupLabel(id: string): string {
		return this.userGroups.find((group) => group.id === id)?.name ?? id;
	}

	// --------------------------------------------------------------------------------------------------
	showPermissions(isUserGroup: boolean, userOrGroup: any) {
		const initialState: ModalOptions = {
			initialState: {
				isUserGroup,
				userOrGroup,
			},
			class: 'modal-lg',
		};

		this.modalService.show(UserAndGroupPermissionsComponent, initialState);
	}

	// --------------------------------------------------------------------------------------------------
	deleteUserOrGroup(isUserGroup: boolean, userOrGroup: User | UserGroup) {
		if (this.actionBusy || this.pendingDelete) return;
		const entries = isUserGroup ? this.userGroups : this.users;
		if (!entries.includes(userOrGroup)) return;
		const kind = isUserGroup ? 'group' : 'user';
		this.pendingDelete = true;
		const modalRef = this.modalService.show(
			ConfirmationDialogComponent,
			confirmationDialogOptions({
				initialState: {
					messageKey: 'principals.deleteConfirm',
					message:
						'{kind, select, user {Are you sure you wish to delete this user?} group {Are you sure you wish to delete this group?} other {Are you sure you wish to delete this entry?}}',
					messageValues: { kind },
					declineButtonTitleKey: 'dialog.keep',
					declineButtonTitle: 'No, keep it',
					confirmButtonTitleKey: 'dialog.delete',
					confirmButtonTitle: 'Yes, delete it',
					defaultButtonConfirm: false,
					titleKey: 'dialog.deleteTitle',
					title: 'Deletion confirmation',
				},
				class: 'modal-md',
			}),
		);
		let confirmed = false;
		if (!modalRef.content) {
			this.pendingDelete = false;
			return;
		}
		modalRef.content.confirm$
			.pipe(
				take(1),
				takeUntil(
					merge<unknown[]>(
						modalRef.content.decline$,
						modalRef.onHidden ?? EMPTY,
						this.selectionChanged$,
						this.destroy$,
					),
				),
				finalize(() => {
					this.pendingDelete = false;
					if (!confirmed) modalRef.hide();
					this.cdr.markForCheck();
				}),
			)
			.subscribe(() => {
				confirmed = true;
				const current = isUserGroup ? this.userGroups : this.users;
				if (!current.includes(userOrGroup)) return;
				const request = isUserGroup
					? this.usersAndGroupsService.deleteGroup(userOrGroup as UserGroup)
					: this.usersAndGroupsService.deleteUser(userOrGroup as User);
				this.performAction(
					request,
					() => {
						if (isUserGroup) {
							this.userGroups = this.userGroups.filter((group) => group.id !== userOrGroup.id);
							this.userGroups.forEach((group) => {
								if (Array.isArray(group.memberGroups))
									group.memberGroups = group.memberGroups.filter(
										(id: string) => id !== userOrGroup.id,
									);
							});
							this.users.forEach(
								(user) =>
									(user.groups = user.groups.filter(
										(group: UserGroup) => group.id !== userOrGroup.id,
									)),
							);
						} else {
							this.users = this.users.filter((user) => user.id !== userOrGroup.id);
							this.userGroups.forEach(
								(group) =>
									(group.users = group.users.filter((user: User) => user.id !== userOrGroup.id)),
							);
						}
						if (this.selectedId === userOrGroup.id && this.selectedType === kind)
							this.clearSelection();
						const page = this.pages[isUserGroup ? 'groups' : 'users'];
						if (!(isUserGroup ? this.userGroups : this.users).length && page.pageIndex > 0)
							page.pageIndex--;
						this.getUsersAndGroups();
					},
					messageText(
						'app.settingsShared.kind-select-group-unable-to-delete-group-id-che-3e6542',
						'{kind, select, group {Unable to delete group {id}. Check permissions and retry.} other {Unable to delete user {id}. Check permissions and retry.}}',
						{ kind, id: userOrGroup.id },
					),
				);
			});
	}

	private performAction(
		request: Observable<unknown>,
		success: () => void,
		failure: string | MessageText,
	) {
		if (this.actionBusy) return;
		this.actionBusy = true;
		this.actionError = '';
		this.cdr.markForCheck();
		request
			.pipe(
				takeUntil(this.destroy$),
				finalize(() => {
					this.actionBusy = false;
					this.cdr.markForCheck();
				}),
			)
			.subscribe({
				next: () => {
					success();
					this.cdr.markForCheck();
				},
				error: () => {
					this.actionError = failure;
					this.cdr.markForCheck();
				},
			});
	}

	// --------------------------------------------------------------------------------------------------
	toggleGroup(group: any) {
		this.selectEntity('group', group);
	}

	// --------------------------------------------------------------------------------------------------
	toggleUser(user: any) {
		this.selectEntity('user', user);
	}

	// --------------------------------------------------------------------------------------------------
	canAttachUserToGroup = (drag: CdkDrag, drop: CdkDropList) =>
		!this.actionBusy && !this.pendingDelete && !drop.data?.some((x: User) => x.id === drag.data.id);

	// --------------------------------------------------------------------------------------------------
	attachUserToGroup(event: CdkDragDrop<any>, group: UserGroup) {
		const canceled = this.dragCanceled;
		this.dragCanceled = false;
		if (canceled || this.actionBusy || this.pendingDelete || !this.userGroups.includes(group))
			return;
		const user = this.users.find((value) => value.id === event.item.data.id);
		if (!user || group.users.some((member) => member.id === user.id)) return;
		this.performAction(
			this.usersAndGroupsService.attachUserToGroup(user.id, group.id),
			() => {
				const currentGroup = this.userGroups.find((value) => value.id === group.id);
				const currentUser = this.users.find((value) => value.id === user.id);
				if (currentGroup && !currentGroup.users.some((member: User) => member.id === user.id))
					currentGroup.users.push(currentUser ?? user);
				if (
					currentUser &&
					!currentUser.groups.some((member: UserGroup) => member.id === group.id)
				) {
					currentUser.groups.push(currentGroup ?? group);
					currentUser.groups.sort((a: UserGroup, b: UserGroup) => a.name.localeCompare(b.name));
				}
				this.refreshMembers();
			},
			messageText(
				'app.settingsShared.unable-to-add-user-to-group-check-permissions-an-d17955',
				'Unable to add {user} to {group}. Check permissions and retry.',
				{ user: user.id, group: group.id },
			),
		);
	}

	detachUserFromGroup(userId: string, groupId: string) {
		if (this.actionBusy || this.pendingDelete || !userId || !groupId) return;
		const user = this.users.find((value) => value.id === userId);
		const group = this.userGroups.find((value) => value.id === groupId);
		if (
			!user?.groups.some((value: UserGroup) => value.id === groupId) &&
			!group?.users.some((value: User) => value.id === userId)
		)
			return;
		this.performAction(
			this.usersAndGroupsService.detachUserFromGroup(userId, groupId),
			() => {
				const currentGroup = this.userGroups.find((value) => value.id === groupId);
				const currentUser = this.users.find((value) => value.id === userId);
				if (currentGroup)
					currentGroup.users = currentGroup.users.filter((member: User) => member.id !== userId);
				if (currentUser)
					currentUser.groups = currentUser.groups.filter(
						(member: UserGroup) => member.id !== groupId,
					);
				this.refreshMembers();
			},
			messageText(
				'app.settingsShared.unable-to-remove-user-from-group-check-permissio-e15a69',
				'Unable to remove {user} from {group}. Check permissions and retry.',
				{ user: userId, group: groupId },
			),
		);
	}
}
