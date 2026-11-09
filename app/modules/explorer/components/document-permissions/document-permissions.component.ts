import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import { WebUiDatePipe } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectorRef,
	Component,
	Input,
	OnChanges,
	OnDestroy,
	QueryList,
	ViewChildren,
	Injector,
	ChangeDetectionStrategy,
} from '@angular/core';
import { PopoverDirective } from 'ngx-bootstrap/popover';
import { Observable, Subject, Subscription, takeUntil } from 'rxjs';
import { DocumentPermissionsService } from '../../helpers/document-permissions.service';
import { DocumentPermissionEditorComponent } from '../document-permission-editor/document-permission-editor.component';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NgTemplateOutlet, NgComponentOutlet } from '@angular/common';
import { ClickOutsideDirective } from '../../../../directives/click-outside.directive';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { DocumentProjectionRegistry, documentProjectionContext } from '@maretha/webui-sdk';

@Component({
	selector: 'nx-document-permissions',
	templateUrl: './document-permissions.component.html',
	styleUrls: ['./document-permissions.component.scss'],
	imports: [
		FontAwesomeModule,
		NgTemplateOutlet,
		NgComponentOutlet,
		PopoverDirective,
		ClickOutsideDirective,
		TooltipDirective,
		WebUiDatePipe,
		TranslateModule,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentPermissionsComponent implements OnChanges, OnDestroy {
	private readonly uiLabels = injectUiMessages(RuntimeUiMessages);
	private destroy$ = new Subject();
	private request?: Subscription;

	@ViewChildren(PopoverDirective) popovers: QueryList<PopoverDirective> | undefined;
	@Input() document: any | null;
	@Input() noEdit = false;
	loading = false;
	private readonly errorMessageState = localizedText(null);
	get error(): string | null {
		return this.errorMessageState();
	}
	set error(value: string | null | MessageText) {
		this.errorMessageState.set(value);
	}
	canManagePermissions = false;
	inheritanceBlocked = false;
	localPermissions: any[] = [];
	sharedPermissions: any[] = [];
	inheritedPermissions: any[] = [];
	externalPermissions: any[] = [];
	permissionEditorComponent = DocumentPermissionEditorComponent;
	localPermissionEditorPopover = false;
	sharedPermissionEditorPopover = false;

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly documentPermissionsService: DocumentPermissionsService,
		public injector: Injector,
		private readonly cdr: ChangeDetectorRef,
		private readonly projections: DocumentProjectionRegistry,
	) {
		documentPermissionsService.permissionsUpdated$.pipe(takeUntil(this.destroy$)).subscribe(() => {
			this.popovers?.forEach((x) => x.hide());

			this.getPermissions();
		});
	}
	aclEmptyProjection(permissions: unknown[]) {
		this.projections.revision();
		return this.projections.resolve('acl.emptyResult', this.aclProjectionContext(permissions));
	}
	aclProjectionContext(permissions: unknown[]) {
		return documentProjectionContext({
			document: this.document,
			noEdit: this.noEdit,
			value: permissions,
		});
	}

	// --------------------------------------------------------------------------------------------------
	get sharedPermissionsTableContext() {
		return {
			title: this.uiLabels.text(
				'app.labels.permissions-for-people-outside-the-organizati-f93d74',
				'1. Permissions for people outside the organization',
			),
			primaryButtonTitle: this.uiLabels.text(
				'app.labels.add-a-new-permission-ddb3e4',
				'Add a new permission',
			),
			primaryButtonTooltip: this.uiLabels.text(
				'app.labels.sharing-to-external-users-does-not-create-new-eca5e2',
				'Sharing to external users does not create new user accounts, instead external users are provided a link to access this document.',
			),
			permissions: this.sharedPermissions,
			isEditorOpen: this.sharedPermissionEditorPopover,
			isEditorOpenFn: this.toggleSharedPermissionEditorPopover.bind(this),
			editorFn: this.openSharedPermissionEditor.bind(this),
			canEdit: true,
		};
	}

	// --------------------------------------------------------------------------------------------------
	toggleSharedPermissionEditorPopover = (toggle: boolean) =>
		(this.sharedPermissionEditorPopover = toggle);

	// --------------------------------------------------------------------------------------------------
	openSharedPermissionEditor(permission?: any) {
		if (!this.canManagePermissions) return;
		this.injector = Injector.create({
			providers: [
				{
					provide: 'document',
					useValue: this.document,
				},
				{
					provide: 'permission',
					useValue: permission,
				},
				{
					provide: 'shared',
					useValue: true,
				},
			],
			parent: this.injector,
		});

		this.sharedPermissionEditorPopover = true;
	}

	// --------------------------------------------------------------------------------------------------
	get localPermissionsTableContext() {
		return {
			title: this.uiLabels.text(
				'app.labels.permissions-specific-to-this-document-a162dc',
				'2. Permissions specific to this document',
			),
			primaryButtonTitle: this.uiLabels.text(
				'app.labels.add-a-new-permission-ddb3e4',
				'Add a new permission',
			),
			permissions: this.localPermissions,
			isEditorOpen: this.localPermissionEditorPopover,
			isEditorOpenFn: this.toggleLocalPermissionEditorPopover.bind(this),
			editorFn: this.openLocalPermissionEditor.bind(this),
			canEdit: true,
		};
	}

	// --------------------------------------------------------------------------------------------------
	toggleLocalPermissionEditorPopover = (toggle: boolean) =>
		(this.localPermissionEditorPopover = toggle);

	// --------------------------------------------------------------------------------------------------
	openLocalPermissionEditor(permission?: any) {
		if (!this.canManagePermissions) return;
		this.injector = Injector.create({
			providers: [
				{
					provide: 'document',
					useValue: this.document,
				},
				{
					provide: 'permission',
					useValue: permission,
				},
				{
					provide: 'shared',
					useValue: false,
				},
			],
			parent: this.injector,
		});

		this.localPermissionEditorPopover = true;
	}

	// --------------------------------------------------------------------------------------------------
	get inheritedPermissionsTableContext() {
		return {
			title: this.uiLabels.text(
				'app.labels.permissions-inherited-from-the-parent-folder-3600b6',
				'3. Permissions inherited from the parent folder',
			),
			primaryButtonTitle: this.inheritanceBlocked
				? this.uiLabels.text(
						'app.labels.enable-permission-inheritance-6da961',
						'Enable permission inheritance',
					)
				: this.uiLabels.text(
						'app.labels.disable-permission-inheritance-946455',
						'Disable permission inheritance',
					),
			permissions: this.inheritedPermissions,
			isEditorOpen: false,
			isEditorOpenFn: () => undefined,
			editorFn: this.togglePermissionInhertance.bind(this),
			canEdit: false,
		};
	}

	// --------------------------------------------------------------------------------------------------
	getPermissions(): void {
		this.request?.unsubscribe();
		this.localPermissions = [];
		this.sharedPermissions = [];
		this.inheritedPermissions = [];
		this.canManagePermissions = false;
		this.inheritanceBlocked = false;
		this.error = null;
		if (!this.document?.uid) {
			this.loading = false;
			return;
		}
		this.loading = true;
		this.request = this.documentPermissionsService
			.getDocumentPermissions(this.document.uid)
			.pipe(takeUntil(this.destroy$))
			.subscribe({
				next: (x: any) => {
					this.loading = false;
					const acls = x?.contextParameters?.acls ?? [];
					this.canManagePermissions =
						!this.noEdit && (x?.contextParameters?.permissions ?? []).includes('WriteSecurity');
					this.inheritanceBlocked = (
						acls.find((acl: any) => acl.name === 'local')?.aces ?? []
					).some(
						(ace: any) =>
							(typeof ace.username === 'string' ? ace.username : ace.username?.id) === 'Everyone' &&
							ace.permission === 'Everything' &&
							ace.granted === false,
					);
					this.inheritedPermissions = this.fixAndSortPermissions(
						acls.find((y: any) => y.name === 'inherited')?.aces,
					);

					const localPermissions = this.fixAndSortPermissions(
						acls.find((y: any) => y.name === 'local')?.aces,
					);

					this.localPermissions = localPermissions.filter((y: any) => !y.externalUser);
					this.sharedPermissions = localPermissions.filter((y: any) => y.externalUser);
					this.cdr.markForCheck();
				},
				error: () => {
					this.loading = false;
					this.error = messageText(
						'app.state.permissions-could-not-be-loaded-check-your-ac-abce21',
						'Permissions could not be loaded. Check your access and try again.',
					);
					this.cdr.markForCheck();
				},
			});
	}

	// --------------------------------------------------------------------------------------------------
	sendLink(permission: any) {
		if (!this.canManagePermissions) return;
		this.mutate(
			this.documentPermissionsService.sendNotificationEmailForPermission(
				this.document.uid,
				permission.id,
				permission.username?.label,
			),
		);
	}

	// --------------------------------------------------------------------------------------------------
	removePermission(permissionId: string) {
		if (!this.canManagePermissions) return;
		this.mutate(this.documentPermissionsService.removePermission(this.document.uid, permissionId));
	}

	// --------------------------------------------------------------------------------------------------
	togglePermissionInhertance() {
		if (!this.canManagePermissions || this.document?.type === 'Root') return;
		this.mutate(
			this.documentPermissionsService[
				this.inheritanceBlocked ? 'unblockInheritance' : 'blockInheritance'
			](this.document.uid),
		);
	}

	private mutate(operation: Observable<unknown>): void {
		operation.pipe(takeUntil(this.destroy$)).subscribe({
			error: () => {
				this.error = messageText(
					'app.state.the-permission-change-could-not-be-completed-ec522e',
					'The permission change could not be completed. Refresh and try again.',
				);
				this.cdr.markForCheck();
			},
		});
	}

	// --------------------------------------------------------------------------------------------------
	private fixAndSortPermissions(permissions: any[]) {
		if (!permissions) return [];

		permissions = permissions.map((ace: any) => {
			const user = typeof ace.username === 'string' ? { id: ace.username } : (ace.username ?? {});
			return {
				...ace,
				username: {
					...user,
					label:
						user.grouplabel ||
						(ace.externalUser ? user.properties?.email : user.properties?.username) ||
						user.label ||
						user.id ||
						this.uiLabels.text('app.labels.unknown-principal-edd139', 'Unknown principal'),
				},
			};
		});

		permissions = permissions.filter(
			(value: any, index: number, self: any) =>
				!(
					value.username.id === 'Everyone' &&
					value.permission === 'Everything' &&
					!value.granted
				) && self.findIndex((s: any) => s.id === value.id) === index,
		);

		// Sort alphabetically
		return permissions.sort(
			(a: any, b: any) =>
				(a.username.grouplabel && a.username.grouplabel.localeCompare(b.username.grouplabel)) ||
				a.externalUser - b.externalUser ||
				a.username.label.localeCompare(b.username.label),
		);
	}

	// --------------------------------------------------------------------------------------------------
	ngOnChanges(): void {
		this.getPermissions();
	}

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy(): void {
		this.destroy$.next(0);
		this.destroy$.complete();
	}
}
