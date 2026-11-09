import { WebUiDatePipe, WebUiMessagePipe } from '@maretha/webui-sdk';
import { ChangeDetectorRef, Component, ChangeDetectionStrategy } from '@angular/core';
import {
	ConfirmationDialogComponent,
	confirmationDialogOptions,
} from 'app/modules/shared/components/confirmation-dialog/confirmation-dialog.component';
import { BsModalService, ModalOptions } from 'ngx-bootstrap/modal';
import { first, switchMap } from 'rxjs';
import { CloudServicesService } from '../../helpers/cloud-services.service';
import { CloudAccount } from '../../models/cloud-account';
import { CloudApplication } from '../../models/cloud-application';
import { CloudClient } from '../../models/cloud-client';
import { CloudServiceProvider } from '../../models/cloud-service-provider';
import { CloudAccountEditorComponent } from '../cloud-account-editor/cloud-account-editor.component';
import { CloudApplicationEditorComponent } from '../cloud-application-editor/cloud-application-editor.component';
import { CloudClientEditorComponent } from '../cloud-client-editor/cloud-client-editor.component';
import { CloudServiceProviderEditorComponent } from '../cloud-service-provider-editor/cloud-service-provider-editor.component';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FormsModule } from '@angular/forms';
import {
	BsDropdownDirective,
	BsDropdownToggleDirective,
	BsDropdownMenuDirective,
} from 'ngx-bootstrap/dropdown';

let nextCloudId = 0;

@Component({
	selector: 'nx-cloud',
	templateUrl: './cloud.component.html',
	styleUrls: ['./cloud.component.scss'],
	imports: [
		TooltipDirective,
		FontAwesomeModule,
		FormsModule,
		BsDropdownDirective,
		BsDropdownToggleDirective,
		BsDropdownMenuDirective,
		WebUiMessagePipe,
		WebUiDatePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CloudComponent {
	readonly tabId = `nx-cloud-${++nextCloudId}`;
	readonly tabs = ['providers', 'tokens', 'consumers'] as const;
	readonly tabLabels = { providers: 'Providers', tokens: 'Tokens', consumers: 'Consumers' };
	activeTab: (typeof this.tabs)[number] = 'providers';

	cloudTabKeyDown(event: KeyboardEvent, index: number): void {
		const next =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? 2
					: event.key === 'ArrowRight'
						? (index + 1) % 3
						: event.key === 'ArrowLeft'
							? (index + 2) % 3
							: null;
		if (next === null) return;
		event.preventDefault();
		this.activeTab = this.tabs[next];
		const target = event.currentTarget as HTMLElement;
		target.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
	}
	oauthProviders: CloudServiceProvider[] = [];
	clients: CloudClient[] = [];
	applications: CloudApplication[] = [];
	accounts: CloudAccount[] = [];

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly cloudServicesService: CloudServicesService,
		private readonly modalService: BsModalService,
		private readonly cdr: ChangeDetectorRef,
	) {
		cloudServicesService.getProviders().subscribe((x) => {
			this.oauthProviders = x;
			this.cdr.markForCheck();
		});
		cloudServicesService.getClients().subscribe((x) => {
			this.clients = x;
			this.cdr.markForCheck();
		});
		cloudServicesService.getApplications().subscribe((x) => {
			this.applications = x;
			this.cdr.markForCheck();
		});
		cloudServicesService.getAccounts().subscribe((x) => {
			this.accounts = x;
			this.cdr.markForCheck();
		});
	}

	// --------------------------------------------------------------------------------------------------
	editServiceProvider(cloudServiceProvider?: CloudServiceProvider) {
		const initialState: ModalOptions = {
			initialState: {
				cloudServiceProvider,
			},
			class: 'modal-md',
		};

		const bsModalRef = this.modalService.show(CloudServiceProviderEditorComponent, initialState);
		bsModalRef.content?.save$.pipe(first()).subscribe((x) => {
			if (cloudServiceProvider) {
				const index = this.oauthProviders.findIndex(
					(y) => y.serviceName === cloudServiceProvider.serviceName,
				);

				if (~index) this.oauthProviders.splice(index, 1, x);
			} else this.oauthProviders.push(x);
			this.cdr.markForCheck();
		});
	}

	// --------------------------------------------------------------------------------------------------
	deleteServiceProvider(cloudServiceProvider: CloudServiceProvider) {
		const modalConfig = {
			animated: true,
			initialState: {
				messageKey: 'cloud.confirm.provider',
				message:
					'Are you sure you wish to delete this OAuth2 service provider: \u201c{name}\u201d?',
				messageValues: { name: cloudServiceProvider.serviceName },
				defaultButtonConfirm: false,
				titleKey: 'dialog.deleteTitle',
				title: 'Deletion confirmation',
				confirmButtonTitleKey: 'dialog.delete',
				confirmButtonTitle: 'Yes, delete it',
				declineButtonTitleKey: 'dialog.keep',
				declineButtonTitle: 'No, keep it',
			},
		};

		const modalRef = this.modalService.show(
			ConfirmationDialogComponent,
			confirmationDialogOptions(modalConfig),
		);

		modalRef
			.content!.confirm$.pipe(
				first(),
				switchMap(() => this.cloudServicesService.deleteProvider(cloudServiceProvider)),
			)
			.subscribe((_) => {
				this.oauthProviders = this.oauthProviders.filter(
					(x) => x.serviceName !== cloudServiceProvider.serviceName,
				);
				this.cdr.markForCheck();
			});
	}

	// --------------------------------------------------------------------------------------------------
	editClient(cloudClient?: CloudClient) {
		const initialState: ModalOptions = {
			initialState: {
				cloudClient,
			},
			class: 'modal-md',
		};

		const bsModalRef = this.modalService.show(CloudClientEditorComponent, initialState);
		bsModalRef.content?.save$.pipe(first()).subscribe((x) => {
			if (cloudClient) {
				const index = this.clients.findIndex((y) => y.id === cloudClient.id);

				if (~index) this.clients.splice(index, 1, x);
			} else this.clients.push(x);
			this.cdr.markForCheck();
		});
	}

	// --------------------------------------------------------------------------------------------------
	deleteClient(cloudClient: CloudClient) {
		const modalConfig = {
			animated: true,
			initialState: {
				messageKey: 'cloud.confirm.client',
				message: 'Are you sure you wish to delete this OAuth2 client: \u201c{name}\u201d?',
				messageValues: { name: cloudClient.name },
				defaultButtonConfirm: false,
				titleKey: 'dialog.deleteTitle',
				title: 'Deletion confirmation',
				confirmButtonTitleKey: 'dialog.delete',
				confirmButtonTitle: 'Yes, delete it',
				declineButtonTitleKey: 'dialog.keep',
				declineButtonTitle: 'No, keep it',
			},
		};

		const modalRef = this.modalService.show(
			ConfirmationDialogComponent,
			confirmationDialogOptions(modalConfig),
		);

		modalRef
			.content!.confirm$.pipe(
				first(),
				switchMap(() => this.cloudServicesService.deleteClient(cloudClient)),
			)
			.subscribe((_) => {
				this.clients = this.clients.filter((x) => x.name !== cloudClient.name);
				this.cdr.markForCheck();
			});
	}

	// --------------------------------------------------------------------------------------------------
	editApplication(cloudApplication?: CloudApplication) {
		const initialState: ModalOptions = {
			initialState: {
				cloudApplication,
			},
			class: 'modal-md',
		};

		const _bsModalRef = this.modalService.show(CloudApplicationEditorComponent, initialState);
	}

	// --------------------------------------------------------------------------------------------------
	revokeApplication(cloudApplication: CloudApplication) {
		const modalConfig = {
			animated: true,
			initialState: {
				messageKey: 'cloud.confirm.token',
				message:
					'Are you sure you wish to revoke this cloud application token: \u201c{name}\u201d?',
				messageValues: { name: cloudApplication.nuxeoLogin },
				defaultButtonConfirm: false,
				titleKey: 'dialog.deleteTitle',
				title: 'Deletion confirmation',
				confirmButtonTitleKey: 'dialog.revoke',
				confirmButtonTitle: 'Yes, revoke it',
				declineButtonTitleKey: 'dialog.keep',
				declineButtonTitle: 'No, keep it',
			},
		};

		const modalRef = this.modalService.show(
			ConfirmationDialogComponent,
			confirmationDialogOptions(modalConfig),
		);

		modalRef
			.content!.confirm$.pipe(
				first(),
				switchMap(() => this.cloudServicesService.revokeApplication(cloudApplication)),
			)
			.subscribe((_) => {
				this.applications = this.applications.filter(
					(x) => x.nuxeoLogin !== cloudApplication.nuxeoLogin,
				);
				this.cdr.markForCheck();
			});
	}

	// --------------------------------------------------------------------------------------------------
	editAccount(cloudAccount?: CloudAccount) {
		const initialState: ModalOptions = {
			initialState: {
				cloudAccount,
			},
			class: 'modal-md',
		};

		const _bsModalRef = this.modalService.show(CloudAccountEditorComponent, initialState);
	}

	// --------------------------------------------------------------------------------------------------
	deleteAccount(cloudAccount: CloudAccount) {
		const modalConfig = {
			animated: true,
			initialState: {
				messageKey: 'cloud.confirm.account',
				message: 'Are you sure you wish to delete this cloud account: \u201c{name}\u201d?',
				messageValues: { name: cloudAccount.nuxeoLogin },
				defaultButtonConfirm: false,
				titleKey: 'dialog.deleteTitle',
				title: 'Deletion confirmation',
				confirmButtonTitleKey: 'dialog.delete',
				confirmButtonTitle: 'Yes, delete it',
				declineButtonTitleKey: 'dialog.keep',
				declineButtonTitle: 'No, keep it',
			},
		};

		const modalRef = this.modalService.show(
			ConfirmationDialogComponent,
			confirmationDialogOptions(modalConfig),
		);

		modalRef
			.content!.confirm$.pipe(
				first(),
				switchMap(() => this.cloudServicesService.deleteAccount(cloudAccount)),
			)
			.subscribe((_) => {
				this.accounts = this.accounts.filter((x) => x.nuxeoLogin !== cloudAccount.nuxeoLogin);
				this.cdr.markForCheck();
			});
	}

	// --------------------------------------------------------------------------------------------------
	toggleProvider(oauthProvider: CloudServiceProvider) {
		this.cloudServicesService.updateProvider(oauthProvider.serviceName, oauthProvider).subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	toggleClient(oauthClient: CloudClient) {
		this.cloudServicesService.updateClient(oauthClient).subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	toggleClientAutoGrant(oauthClient: CloudClient) {
		this.cloudServicesService.updateClient(oauthClient).subscribe();
	}
}
