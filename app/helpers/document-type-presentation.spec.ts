import {
	documentStatePresentation,
	documentTypeIcon,
	documentTypeLabel,
} from './document-type-presentation';

describe('Core document presentation', () => {
	it('uses lowercase stock message keys and readable core labels', () => {
		expect(documentTypeLabel('OrderedFolder')).toEqual({
			key: 'label.document.type.orderedfolder',
			fallback: 'Ordered Folder',
		});
		expect(documentTypeLabel('CustomerFolder')).toEqual({
			key: 'label.document.type.customerfolder',
			fallback: 'CustomerFolder',
		});
	});
	it('uses folder and media glyphs for core types and preserves custom Folderish fallback', () => {
		for (const type of [
			'Folder',
			'Workspace',
			'Section',
			'WorkspaceRoot',
			'SectionRoot',
			'TemplateRoot',
			'UserWorkspacesRoot',
		])
			expect(documentTypeIcon(type)).toBe('icons:folder');
		expect(documentTypeIcon({ type: 'CustomerFolder', facets: ['Folderish'] })).toBe(
			'icons:folder',
		);
		expect(documentTypeIcon('OrderedFolder')).toBe('icons:folder-ordered');
		expect(documentTypeIcon('Audio')).toBe('av:volume-up');
		expect(documentTypeIcon('Video')).toBe('av:play-circle-outline');
	});
	it('labels the stock 3D type ids like the Polymer chooser', () => {
		expect(documentTypeLabel('NX3D')).toEqual({
			key: 'label.document.type.nx3d',
			fallback: '3D Model',
		});
		expect(documentTypeLabel('ThreeD').fallback).toBe('3D Model');
	});
	it('translates only known core lifecycle labels and preserves custom state values', () => {
		expect(documentStatePresentation('project')).toEqual({
			key: 'label.ui.state.project',
			fallback: 'Project',
		});
		expect(documentStatePresentation('customer-review')).toEqual({ fallback: 'customer-review' });
	});
});
