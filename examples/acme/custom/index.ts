import { makeEnvironmentProviders } from '@angular/core';
import {
	ADMINISTRATION_MENU_SLOT,
	ADMINISTRATION_PAGES_SLOT,
	ANALYTICS_ITEMS_SLOT,
	ANALYTICS_PAGES_SLOT,
	BLOB_ACTIONS_SLOT,
	COLLECTION_ACTIONS_SLOT,
	CREATE_POPUP_ITEMS_SLOT,
	CREATE_POPUP_PAGES_SLOT,
	defineContribution,
	defineDocumentView,
	definePage,
	definePairedView,
	defineWebUiTheme,
	DOCUMENT_ACTIONS_SLOT,
	DOCUMENT_CREATE_ACTIONS_SLOT,
	DOCUMENT_INFO_BAR_SLOT,
	DRAWER_ITEMS_SLOT,
	DRAWER_PAGES_SLOT,
	DrawerItemComponent,
	FILE_UPLOAD_ACTIONS_SLOT,
	nuxeoFilter,
	provideDocumentLayoutExtensions,
	provideResultsProjections,
	provideWebUiExtensions,
	provideWebUiMessages,
	PUBLISH_ITEMS_SLOT,
	PUBLISH_PAGES_SLOT,
	QUICK_SEARCH_ACTIONS_SLOT,
	RESULTS_ACTIONS_SLOT,
	RESULTS_SELECTION_ACTIONS_SLOT,
	type ResultsProjectionContext,
	SHELL_ACTIONS_SLOT,
	TRASH_RESULTS_SELECTION_ACTIONS_SLOT,
	USER_MENU_SLOT,
} from '@maretha/webui-sdk';
import { ACME_THEME_CORPORATE_THEME } from './contributions/themes/acme.theme.corporate.theme';
import en from './i18n/en.json';
import fr from './i18n/fr.json';
import { ContractCreateLayoutComponent } from './layouts/Contract/contract.create.layout';
import { ContractEditLayoutComponent } from './layouts/Contract/contract.edit.layout';
import { ContractViewLayoutComponent } from './layouts/Contract/contract.view.layout';
import { ContractMetadataLayoutComponent } from './layouts/Contract/contract.metadata.layout';
import { ContractImportLayoutComponent } from './layouts/Contract/contract.import.layout';
import { InvoiceCreateLayoutComponent } from './layouts/Invoice/invoice.create.layout';
import { InvoiceEditLayoutComponent } from './layouts/Invoice/invoice.edit.layout';
import { InvoiceViewLayoutComponent } from './layouts/Invoice/invoice.view.layout';
import { InvoiceMetadataLayoutComponent } from './layouts/Invoice/invoice.metadata.layout';
import { InvoiceImportLayoutComponent } from './layouts/Invoice/invoice.import.layout';
import { AcmeContractCardComponent } from './projections/acme.contract-card.component';
// <custom:imports>

/** A document property from a slot context's `document`, or undefined. */
const property = (document: Readonly<Record<string, unknown>> | null | undefined, name: string) =>
	(document?.['properties'] as Readonly<Record<string, unknown>> | undefined)?.[name];

/**
 * ACME's customization: one contribution per slot, Contract and Invoice layouts in every mode,
 * labels in two locales, a theme and a grid card. The generators wrote the registrations; the
 * `when` predicates, the visibility rule, the overrides, the labels and the projection were
 * added by hand. The only file core imports from custom/; keep the marker comments.
 */
export function provideCustomExtensions() {
	return makeEnvironmentProviders([
		// Labels by locale: `labelKey` and the `webuiMessage` pipe look keys up here, then in the
		// base language, then in en-US, then use the literal fallback.
		provideWebUiMessages('acme.labels', { 'en-US': en, fr }),
		provideWebUiExtensions({
			id: 'custom.webui',
			contributions: [
				defineContribution(DRAWER_ITEMS_SLOT, {
					id: 'acme.drawer.contracts',
					pairKey: 'acme.drawer.contracts',
					order: 120,
					component: DrawerItemComponent,
					inputs: {
						pageId: 'acme.drawer.contracts',
						label: 'Contracts',
						labelKey: 'acme.drawer.contracts',
						icon: 'nuxeo:edit',
					},
				}),
				defineContribution(DRAWER_PAGES_SLOT, {
					id: 'acme.drawer.contracts',
					pairKey: 'acme.drawer.contracts',
					loadComponent: () =>
						import('./contributions/drawer-items/acme.drawer.contracts.component').then(
							(m) => m.AcmeDrawerContractsComponent,
						),
				}),
				defineContribution(DRAWER_ITEMS_SLOT, {
					id: 'acme.drawer.invoices',
					pairKey: 'acme.drawer.invoices',
					order: 130,
					component: DrawerItemComponent,
					inputs: {
						pageId: 'acme.drawer.invoices',
						label: 'Invoices',
						labelKey: 'acme.drawer.invoices',
						icon: 'nuxeo:edit',
					},
				}),
				defineContribution(DRAWER_PAGES_SLOT, {
					id: 'acme.drawer.invoices',
					pairKey: 'acme.drawer.invoices',
					loadComponent: () =>
						import('./contributions/drawer-pages/acme.drawer.invoices.component').then(
							(m) => m.AcmeDrawerInvoicesComponent,
						),
				}),
				definePage({
					id: 'acme.page.contract-register',
					pageId: 'acme.page.contract-register',
					loadComponent: () =>
						import('./contributions/pages/acme.page.contract-register.component').then(
							(m) => m.AcmePageContractRegisterComponent,
						),
				}),
				defineContribution(USER_MENU_SLOT, {
					id: 'acme.user.contract-register',
					order: 45,
					loadComponent: () =>
						import('./contributions/user-menu/acme.user.contract-register.component').then(
							(m) => m.AcmeUserContractRegisterComponent,
						),
				}),
				...definePairedView(
					{ items: ADMINISTRATION_MENU_SLOT, pages: ADMINISTRATION_PAGES_SLOT },
					{
						id: 'acme.admin.contract-settings',
						viewId: 'acme.admin.contract-settings',
						label: 'Contract settings',
						order: 100,
						loadComponent: () =>
							import('./contributions/administration-menu/acme.admin.contract-settings.component').then(
								(m) => m.AcmeAdminContractSettingsComponent,
							),
					},
				),
				...definePairedView(
					{ items: ADMINISTRATION_MENU_SLOT, pages: ADMINISTRATION_PAGES_SLOT },
					{
						id: 'acme.admin.invoice-settings',
						viewId: 'acme.admin.invoice-settings',
						label: 'Invoice settings',
						order: 110,
						loadComponent: () =>
							import('./contributions/administration-pages/acme.admin.invoice-settings.component').then(
								(m) => m.AcmeAdminInvoiceSettingsComponent,
							),
					},
				),
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: 'acme.contract.approve',
					order: 15,
					// A Polymer <nuxeo-filter type="Contract" permission="Write"> maps attribute for
					// attribute; the expression replaces `this.isTrashed(document)`.
					when: nuxeoFilter({
						type: 'Contract',
						permission: 'Write',
						expression: (document, _user, filters) => !filters.isTrashed(document),
					}),
					loadComponent: () =>
						import('./contributions/document-actions/acme.contract.approve.component').then(
							(m) => m.AcmeContractApproveComponent,
						),
				}),
				...defineDocumentView({
					id: 'acme.contract.terms',
					viewId: 'acme.contract.terms',
					label: 'Terms',
					labelKey: 'acme.contract.terms',
					order: 20,
					when: nuxeoFilter({ type: 'Contract' }),
					loadComponent: () =>
						import('./contributions/document-views-items/acme.contract.terms.component').then(
							(m) => m.AcmeContractTermsComponent,
						),
				}),
				...defineDocumentView({
					id: 'acme.invoice.lines',
					viewId: 'acme.invoice.lines',
					label: 'Invoice lines',
					labelKey: 'acme.invoice.lines',
					order: 20,
					when: nuxeoFilter({ type: 'Invoice' }),
					loadComponent: () =>
						import('./contributions/document-views-pages/acme.invoice.lines.component').then(
							(m) => m.AcmeInvoiceLinesComponent,
						),
				}),
				defineContribution(DOCUMENT_INFO_BAR_SLOT, {
					id: 'acme.contract.review-notice',
					order: 100,
					// A plain predicate over the context: an inactive Contract is under review.
					when: (context) =>
						context.document?.['type'] === 'Contract' &&
						property(context.document, 'contract:active') === false,
					loadComponent: () =>
						import('./contributions/document-info-bar/acme.contract.review-notice.component').then(
							(m) => m.AcmeContractReviewNoticeComponent,
						),
				}),
				defineContribution(BLOB_ACTIONS_SLOT, {
					id: 'acme.blob.send-to-archive',
					order: 100,
					loadComponent: () =>
						import('./contributions/blob-actions/acme.blob.send-to-archive.component').then(
							(m) => m.AcmeBlobSendToArchiveComponent,
						),
				}),
				defineContribution(RESULTS_ACTIONS_SLOT, {
					id: 'acme.results.export-register',
					order: 100,
					loadComponent: () =>
						import('./contributions/results-actions/acme.results.export-register.component').then(
							(m) => m.AcmeResultsExportRegisterComponent,
						),
				}),
				defineContribution(RESULTS_SELECTION_ACTIONS_SLOT, {
					id: 'acme.selection.mark-reviewed',
					order: 100,
					loadComponent: () =>
						import('./contributions/results-selection-actions/acme.selection.mark-reviewed.component').then(
							(m) => m.AcmeSelectionMarkReviewedComponent,
						),
				}),
				defineContribution(TRASH_RESULTS_SELECTION_ACTIONS_SLOT, {
					id: 'acme.trash.report-deletion',
					order: 100,
					loadComponent: () =>
						import('./contributions/trash-results-selection-actions/acme.trash.report-deletion.component').then(
							(m) => m.AcmeTrashReportDeletionComponent,
						),
				}),
				defineContribution(COLLECTION_ACTIONS_SLOT, {
					id: 'acme.collection.share-with-legal',
					order: 100,
					loadComponent: () =>
						import('./contributions/collection-actions/acme.collection.share-with-legal.component').then(
							(m) => m.AcmeCollectionShareWithLegalComponent,
						),
				}),
				defineContribution(DOCUMENT_CREATE_ACTIONS_SLOT, {
					id: 'acme.create.contract',
					order: 100,
					when: (context) => context.types.some((type) => type.name === 'Contract'),
					loadComponent: () =>
						import('./contributions/document-create-actions/acme.create.contract.component').then(
							(m) => m.AcmeCreateContractComponent,
						),
				}),
				...definePairedView(
					{ items: CREATE_POPUP_ITEMS_SLOT, pages: CREATE_POPUP_PAGES_SLOT },
					{
						id: 'acme.create.from-template',
						viewId: 'acme.create.from-template',
						label: 'From template',
						order: 100,
						loadComponent: () =>
							import('./contributions/create-popup-items/acme.create.from-template.component').then(
								(m) => m.AcmeCreateFromTemplateComponent,
							),
					},
				),
				...definePairedView(
					{ items: CREATE_POPUP_ITEMS_SLOT, pages: CREATE_POPUP_PAGES_SLOT },
					{
						id: 'acme.create.invoice-batch',
						viewId: 'acme.create.invoice-batch',
						label: 'Invoice batch',
						order: 110,
						loadComponent: () =>
							import('./contributions/create-popup-pages/acme.create.invoice-batch.component').then(
								(m) => m.AcmeCreateInvoiceBatchComponent,
							),
					},
				),
				defineContribution(FILE_UPLOAD_ACTIONS_SLOT, {
					id: 'acme.upload.from-archive',
					order: 100,
					loadComponent: () =>
						import('./contributions/file-upload-actions/acme.upload.from-archive.component').then(
							(m) => m.AcmeUploadFromArchiveComponent,
						),
				}),
				...definePairedView(
					{ items: PUBLISH_ITEMS_SLOT, pages: PUBLISH_PAGES_SLOT },
					{
						id: 'acme.publish.partner-portal',
						viewId: 'acme.publish.partner-portal',
						label: 'Partner portal',
						order: 100,
						loadComponent: () =>
							import('./contributions/publish-items/acme.publish.partner-portal.component').then(
								(m) => m.AcmePublishPartnerPortalComponent,
							),
					},
				),
				...definePairedView(
					{ items: PUBLISH_ITEMS_SLOT, pages: PUBLISH_PAGES_SLOT },
					{
						id: 'acme.publish.public-register',
						viewId: 'acme.publish.public-register',
						label: 'Public register',
						order: 110,
						loadComponent: () =>
							import('./contributions/publish-pages/acme.publish.public-register.component').then(
								(m) => m.AcmePublishPublicRegisterComponent,
							),
					},
				),
				...definePairedView(
					{ items: ANALYTICS_ITEMS_SLOT, pages: ANALYTICS_PAGES_SLOT },
					{
						id: 'acme.analytics.contract-volume',
						viewId: 'acme.analytics.contract-volume',
						label: 'Contract volume',
						order: 100,
						loadComponent: () =>
							import('./contributions/analytics-items/acme.analytics.contract-volume.component').then(
								(m) => m.AcmeAnalyticsContractVolumeComponent,
							),
					},
				),
				...definePairedView(
					{ items: ANALYTICS_ITEMS_SLOT, pages: ANALYTICS_PAGES_SLOT },
					{
						id: 'acme.analytics.invoice-aging',
						viewId: 'acme.analytics.invoice-aging',
						label: 'Invoice aging',
						order: 110,
						loadComponent: () =>
							import('./contributions/analytics-pages/acme.analytics.invoice-aging.component').then(
								(m) => m.AcmeAnalyticsInvoiceAgingComponent,
							),
					},
				),
				defineWebUiTheme(ACME_THEME_CORPORATE_THEME),
				defineContribution(QUICK_SEARCH_ACTIONS_SLOT, {
					id: 'acme.quick-search.contracts',
					order: 100,
					when: (context) => /^contracts?$/i.test(context.searchTerm.trim()),
					loadComponent: () =>
						import('./contributions/quick-search-actions/acme.quick-search.contracts.component').then(
							(m) => m.AcmeQuickSearchContractsComponent,
						),
				}),
				defineContribution(SHELL_ACTIONS_SLOT, {
					id: 'acme.shell.contract-register',
					order: 100,
					loadComponent: () =>
						import('./contributions/shell-actions/acme.shell.contract-register.component').then(
							(m) => m.AcmeShellContractRegisterComponent,
						),
				}),
				// <custom:contributions>
			],
			// Named rules restrict visibility; Nuxeo still decides permissions on the server.
			visibilityRules: [
				{
					id: 'acme.rules.legal-team',
					evaluate: (context) =>
						DOCUMENT_ACTIONS_SLOT.isContext(context) &&
						(context.user?.groups ?? []).includes('legal'),
				},
			],
			overrides: [
				// Hide a default action; its id comes from the "Defaults" line of the slot catalog.
				{ slot: 'DOCUMENT_ACTIONS', id: 'maretha.document.purge', disabled: true },
				// Move a default entry: the Themes entry goes below the language choice.
				{ slot: 'USER_MENU', id: 'maretha.user.themes', order: 65 },
				// Narrow our own action with the named rule; it combines with the `when` above.
				{
					slot: 'DOCUMENT_ACTIONS',
					id: 'acme.contract.approve',
					visibilityRule: 'acme.rules.legal-team',
				},
			],
		}),
		provideDocumentLayoutExtensions({
			id: 'custom.layouts',
			layouts: [
				{
					id: 'acme.layout.contract.create',
					documentType: 'Contract',
					mode: 'create',
					priority: 10,
					component: ContractCreateLayoutComponent,
				},
				{
					id: 'acme.layout.contract.edit',
					documentType: 'Contract',
					mode: 'edit',
					priority: 10,
					component: ContractEditLayoutComponent,
				},
				{
					id: 'acme.layout.contract.view',
					documentType: 'Contract',
					mode: 'view',
					priority: 10,
					component: ContractViewLayoutComponent,
				},
				{
					id: 'acme.layout.contract.metadata',
					documentType: 'Contract',
					mode: 'metadata',
					priority: 10,
					component: ContractMetadataLayoutComponent,
				},
				{
					id: 'acme.layout.contract.import',
					documentType: 'Contract',
					mode: 'import',
					priority: 10,
					component: ContractImportLayoutComponent,
				},
				{
					id: 'acme.layout.invoice.create',
					documentType: 'Invoice',
					mode: 'create',
					priority: 10,
					component: InvoiceCreateLayoutComponent,
				},
				{
					id: 'acme.layout.invoice.edit',
					documentType: 'Invoice',
					mode: 'edit',
					priority: 10,
					component: InvoiceEditLayoutComponent,
				},
				{
					id: 'acme.layout.invoice.view',
					documentType: 'Invoice',
					mode: 'view',
					priority: 10,
					component: InvoiceViewLayoutComponent,
				},
				{
					id: 'acme.layout.invoice.metadata',
					documentType: 'Invoice',
					mode: 'metadata',
					priority: 10,
					component: InvoiceMetadataLayoutComponent,
				},
				{
					id: 'acme.layout.invoice.import',
					documentType: 'Invoice',
					mode: 'import',
					priority: 10,
					component: InvoiceImportLayoutComponent,
				},
				// <custom:layouts>
			],
		}),
		// A grid card per document type: the card replaces the host's `item` template for
		// Contract rows in grid mode and receives the same context.
		provideResultsProjections({
			id: 'acme.contract.card',
			projection: 'item',
			mode: 'grid',
			when: (context) => (context as ResultsProjectionContext).row.type === 'Contract',
			component: AcmeContractCardComponent,
		}),
	]);
}
