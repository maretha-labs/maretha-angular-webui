import type { DocumentLayout } from '@maretha/webui-sdk';

/**
 * Fields shared by every Contract layout mode. The server's `contract` schema
 * (examples/acme/nuxeo/schemas/contract.xsd) validates each property; the layout only adds
 * presentation constraints. `labelKey` looks the label up in custom/i18n; `label` is the
 * fallback when a locale has no entry.
 */
export const CONTRACT_LAYOUT: DocumentLayout = {
	id: 'acme.layout.contract.fields',
	documentType: 'Contract',
	fields: [
		{
			property: 'dc:title',
			label: 'Title',
			labelKey: 'acme.field.title',
			required: true,
			maxLength: 200,
		},
		{
			property: 'contract:counterparty',
			label: 'Counterparty',
			labelKey: 'acme.contract.counterparty',
			required: true,
			maxLength: 200,
		},
		{
			property: 'contract:amount',
			label: 'Amount',
			labelKey: 'acme.contract.amount',
			required: true,
			min: 0,
		},
		{
			property: 'contract:effectiveDate',
			label: 'Effective date',
			labelKey: 'acme.contract.effective-date',
			required: true,
		},
		{ property: 'contract:active', label: 'Active', labelKey: 'acme.contract.active' },
		{
			property: 'dc:description',
			label: 'Description',
			labelKey: 'acme.field.description',
			maxLength: 4000,
		},
	],
};
