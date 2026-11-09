import { WebUiIcon } from '@maretha/webui-sdk';
/** Material icons used by stock Nuxeo document types and controls; Apache 2.0, Polymer iron-icons. */
export const CORE_PRESENTATION_ICONS: Readonly<Record<string, WebUiIcon>> = {
	'av:volume-up': {
		viewBox: '0 0 24 24',
		nodes: [
			{
				tag: 'path',
				attributes: {
					d: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z',
				},
			},
		],
	},
	'av:play-circle-outline': {
		viewBox: '0 0 24 24',
		nodes: [
			{
				tag: 'path',
				attributes: {
					d: 'M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z',
				},
			},
		],
	},
	'av:note': {
		viewBox: '0 0 24 24',
		nodes: [
			{
				tag: 'path',
				attributes: {
					d: 'M22 10l-6-6H4c-1.1 0-2 .9-2 2v12.01c0 1.1.9 1.99 2 1.99l16-.01c1.1 0 2-.89 2-1.99v-8zm-7-4.5l5.5 5.5H15V5.5z',
				},
			},
		],
	},
	'icons:folder': {
		viewBox: '0 0 24 24',
		nodes: [
			{
				tag: 'path',
				attributes: {
					d: 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
				},
			},
		],
	},
	'icons:folder-ordered': {
		viewBox: '0 0 24 24',
		nodes: [
			{
				tag: 'path',
				attributes: {
					'fill-rule': 'evenodd',
					d: 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2zM7 10.5h10V12H7zm0 3h10v1.5H7zm0 3h7V18H7z',
				},
			},
		],
	},
	'icons:description': {
		viewBox: '0 0 24 24',
		nodes: [
			{
				tag: 'path',
				attributes: {
					d: 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
				},
			},
		],
	},
	'icons:bookmark': {
		viewBox: '0 0 24 24',
		nodes: [
			{
				tag: 'path',
				attributes: {
					d: 'M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z',
				},
			},
		],
	},
	// Stock nuxeo-favorites-toggle-button: filled when the document is a favorite, outline otherwise.
	'icons:star': {
		viewBox: '0 0 24 24',
		nodes: [
			{
				tag: 'path',
				attributes: {
					d: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
				},
			},
		],
	},
	'icons:star-border': {
		viewBox: '0 0 24 24',
		nodes: [
			{
				tag: 'path',
				attributes: {
					d: 'M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z',
				},
			},
		],
	},
	'icons:filter-list': {
		viewBox: '0 0 24 24',
		nodes: [
			{
				tag: 'path',
				attributes: {
					d: 'M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z',
				},
			},
		],
	},
	'icons:settings': {
		viewBox: '0 0 24 24',
		nodes: [
			{
				tag: 'path',
				attributes: {
					d: 'M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z',
				},
			},
		],
	},
	'editor:publish': {
		viewBox: '0 0 24 24',
		nodes: [{ tag: 'path', attributes: { d: 'M5 4v2h14V4H5zm0 10h4v6h6v-6h4l-7-7-7 7z' } }],
	},
	// Stock nuxeo-checkbox-aggregation collapse toggle.
	'hardware:keyboard-arrow-down': {
		viewBox: '0 0 24 24',
		nodes: [{ tag: 'path', attributes: { d: 'M7.41 7.84L12 12.42l4.59-4.58L18 9.25l-6 6-6-6z' } }],
	},
	'hardware:keyboard-arrow-up': {
		viewBox: '0 0 24 24',
		nodes: [{ tag: 'path', attributes: { d: 'M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z' } }],
	},
	// Stock nuxeo-document-info-bar trash bar.
	'icons:info': {
		viewBox: '0 0 24 24',
		nodes: [
			{
				tag: 'path',
				attributes: {
					d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
				},
			},
		],
	},
	// Stock nuxeo-document-info-bar running-workflow and pending-task bars.
	'icons:perm-data-setting': {
		viewBox: '0 0 24 24',
		nodes: [
			{
				tag: 'path',
				attributes: {
					d: 'M18.99 11.5c.34 0 .67.03 1 .07L20 0 0 20h11.56c-.04-.33-.07-.66-.07-1 0-4.14 3.36-7.5 7.5-7.5zm3.71 7.99c.02-.16.04-.32.04-.49 0-.17-.01-.33-.04-.49l1.06-.83c.09-.08.12-.21.06-.32l-1-1.73c-.06-.11-.19-.15-.31-.11l-1.24.5c-.26-.2-.54-.37-.85-.49l-.19-1.32c-.01-.12-.12-.21-.24-.21h-2c-.12 0-.23.09-.25.21l-.19 1.32c-.3.13-.59.29-.85.49l-1.24-.5c-.11-.04-.24 0-.31.11l-1 1.73c-.06.11-.04.24.06.32l1.06.83c-.02.16-.03.32-.03.49 0 .17.01.33.03.49l-1.06.83c-.09.08-.12.21-.06.32l1 1.73c.06.11.19.15.31.11l1.24-.5c.26.2.54.37.85.49l.19 1.32c.02.12.12.21.25.21h2c.12 0 .23-.09.25-.21l.19-1.32c.3-.13.59-.29.84-.49l1.25.5c.11.04.24 0 .31-.11l1-1.73c.06-.11.03-.24-.06-.32l-1.07-.83zm-3.71 1.01c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
				},
			},
		],
	},
	'icons:assignment-turned-in': {
		viewBox: '0 0 24 24',
		nodes: [
			{
				tag: 'path',
				attributes: {
					d: 'M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z',
				},
			},
		],
	},
};
