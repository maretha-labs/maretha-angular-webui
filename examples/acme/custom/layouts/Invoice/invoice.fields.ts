import type { DocumentLayout } from '@maretha/webui-sdk';

/**
 * Fields shared by every Invoice layout mode. The server's `invoice` schema
 * (examples/acme/nuxeo/schemas/invoice.xsd) validates each property. `invoice:contract` is a
 * plain string here; a `widget: 'reference'` field needs a gateway that implements
 * `resolveReference` (SDK README, "Schema-bound scalar layouts").
 */
export const INVOICE_LAYOUT: DocumentLayout = {
	id: 'acme.layout.invoice.fields',
	documentType: 'Invoice',
	fields: [
		{
			property: 'dc:title',
			label: 'Title',
			labelKey: 'acme.field.title',
			required: true,
			maxLength: 200,
		},
		{
			property: 'invoice:number',
			label: 'Invoice number',
			labelKey: 'acme.invoice.number',
			required: true,
			maxLength: 40,
		},
		{
			property: 'invoice:amount',
			label: 'Amount',
			labelKey: 'acme.invoice.amount',
			required: true,
			min: 0,
		},
		{
			property: 'invoice:dueDate',
			label: 'Due date',
			labelKey: 'acme.invoice.due-date',
			required: true,
		},
		{ property: 'invoice:paid', label: 'Paid', labelKey: 'acme.invoice.paid' },
		{
			property: 'invoice:contract',
			label: 'Contract',
			labelKey: 'acme.invoice.contract',
			maxLength: 200,
		},
		{
			property: 'dc:description',
			label: 'Description',
			labelKey: 'acme.field.description',
			maxLength: 4000,
		},
	],
};
