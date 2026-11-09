import { WebUiMessages } from '@maretha/webui-sdk';
import { Injectable, signal, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, Observable } from 'rxjs';

@Injectable({
	providedIn: 'root',
})
export class LayoutService {
	private readonly messages = inject(WebUiMessages);
	private builtInSortLabels = true;
	sortLabel(field: string | undefined, fallback: string | undefined): string {
		const keys: Record<string, string> = {
			'dc:title': 'app.columns.title',
			'dc:description': 'app.columns.description',
			'ecm:primaryType': 'app.columns.type',
		};
		return this.builtInSortLabels && field && keys[field]
			? this.messages.text(keys[field], fallback || '')
			: fallback || '';
	}
	readonly createButtonPlacement = signal<'floating' | 'document-actions'>('floating');
	setCreateButtonPlacement(value: 'floating' | 'document-actions'): void {
		this.createButtonPlacement.set(value);
		try {
			localStorage.setItem('maretha.createButtonPlacement', value);
		} catch {
			/* Session preference still applies. */
		}
	}
	private readonly _defaultPageSize = 40;
	private _pageSize = this._defaultPageSize;
	private _displayMode = LayoutDisplayMode.List;
	private _filters: ILayoutFilter[] = [];
	private _availableSortFields: ILayoutSortField = {};
	private _sortFields: string[] = [];
	private _sortAscending = true;
	private _showInfoPanel = false;
	private _infoPanelCollapsed = true;

	private readonly _settings = signal<ILayoutSettings | null>(null);
	private readonly _infoPanelVisibility = signal<boolean | null>(null);

	readonly settings = this._settings.asReadonly();
	readonly infoPanelVisibility = this._infoPanelVisibility.asReadonly();
	readonly settingsUpdated$: Observable<ILayoutSettings> = toObservable(this._settings).pipe(
		filter((x): x is ILayoutSettings => x !== null),
	);
	readonly infoPanelVisibilityChanged$: Observable<boolean> = toObservable(
		this._infoPanelVisibility,
	).pipe(filter((x): x is boolean => x !== null));

	// --------------------------------------------------------------------------------------------------
	constructor() {
		try {
			if (localStorage.getItem('maretha.createButtonPlacement') === 'document-actions')
				this.createButtonPlacement.set('document-actions');
		} catch {
			// Keep the default placement when browser storage is unavailable.
		}
		// Get settings from localStorage
		try {
			this._pageSize = parseInt(localStorage.getItem('pageSize') || '') || this._defaultPageSize;
		} catch {
			this._pageSize = this._defaultPageSize;
		}

		try {
			this._displayMode =
				parseInt(localStorage.getItem('displayMode') || '') || LayoutDisplayMode.List;
		} catch {
			this._displayMode = LayoutDisplayMode.List;
		}

		const defaultAvailableSortFields = {
			'dc:title': 'Title',
			'dc:description': 'Description',
			'ecm:primaryType': 'Type',
		};

		try {
			const availableSortFields = localStorage.getItem('availableSortFields');
			this.builtInSortLabels = !availableSortFields;
			this._availableSortFields = availableSortFields
				? JSON.parse(availableSortFields)
				: defaultAvailableSortFields;
		} catch {
			this._availableSortFields = defaultAvailableSortFields;
			this.builtInSortLabels = true;
		}

		const defaultSortFields = ['dc:title'];
		try {
			const sortFields = localStorage.getItem('sortFields');
			this._sortFields = sortFields ? JSON.parse(sortFields) : defaultSortFields;
		} catch {
			this._sortFields = defaultSortFields;
		}

		try {
			this._sortAscending = localStorage.getItem('sortAscending')
				? localStorage.getItem('sortAscending') === 'true'
				: true;
		} catch {
			this._sortAscending = true;
		}

		try {
			this._showInfoPanel = localStorage.getItem('showInfoPanel')
				? localStorage.getItem('showInfoPanel') === 'true'
				: false;
		} catch {
			this._showInfoPanel = false;
		}

		try {
			this._infoPanelCollapsed = localStorage.getItem('infoPanelCollapsed')
				? localStorage.getItem('infoPanelCollapsed') === 'true'
				: true;
		} catch {
			this._infoPanelCollapsed = true;
		}
	}

	// --------------------------------------------------------------------------------------------------
	set displayMode(displayMode: LayoutDisplayMode) {
		this._displayMode = displayMode;

		localStorage.setItem('displayMode', this._displayMode.toString());
	}

	// --------------------------------------------------------------------------------------------------
	get displayMode() {
		return this._displayMode;
	}

	// // --------------------------------------------------------------------------------------------------
	// addFilter(filter: ILayoutFilter)
	// {
	// 	if (this._filters.find(x => x.fieldName === filter.fieldName))
	// 		return;

	// 	this._filters.push(filter);
	// }

	// // --------------------------------------------------------------------------------------------------
	// updateFilter(fieldName: string, fieldValue: any)
	// {
	// 	const index = this._filters.findIndex(x => x.fieldName === fieldName);

	// 	if (index < 0)
	// 		return;

	// 	const filter = this._filters[index];
	// 	filter.fieldValue = fieldValue;

	// 	this._filters.splice(index, 1, filter);
	// }

	// // --------------------------------------------------------------------------------------------------
	// removeFilter(fieldName: string)
	// {
	// 	if (!fieldName)
	// 		return;

	// 	this._filters = this._filters.filter(x => x.fieldName !== fieldName);
	// }

	// // --------------------------------------------------------------------------------------------------
	// clearFilters()
	// {
	// 	this._filters = [];
	// }

	// // --------------------------------------------------------------------------------------------------
	// get filters()
	// {
	// 	return this._filters;
	// }

	// --------------------------------------------------------------------------------------------------
	set availableSortFields(availableSortFields: ILayoutSortField) {
		this._availableSortFields = availableSortFields;
		this.builtInSortLabels = false;

		localStorage.setItem('availableSortFields', JSON.stringify(availableSortFields));
	}

	// --------------------------------------------------------------------------------------------------
	get availableSortFields(): ILayoutSortField {
		return this._availableSortFields;
	}

	// --------------------------------------------------------------------------------------------------
	set sortFields(sortFields: string[]) {
		this._sortFields = sortFields;

		localStorage.setItem('sortFields', JSON.stringify(sortFields));
	}

	// --------------------------------------------------------------------------------------------------
	get sortFields() {
		return this._sortFields;
	}

	// --------------------------------------------------------------------------------------------------
	set sortAscending(sortAscending: boolean) {
		this._sortAscending = sortAscending;

		localStorage.setItem('sortAscending', JSON.stringify(sortAscending));
	}

	// --------------------------------------------------------------------------------------------------
	get sortAscending() {
		return this._sortAscending;
	}

	// --------------------------------------------------------------------------------------------------
	set showInfoPanel(showInfoPanel: boolean) {
		this._showInfoPanel = showInfoPanel;

		localStorage.setItem('showInfoPanel', JSON.stringify(showInfoPanel));
	}

	// --------------------------------------------------------------------------------------------------
	get showInfoPanel() {
		return this._showInfoPanel;
	}

	// --------------------------------------------------------------------------------------------------
	set infoPanelCollapsed(infoPanelCollapsed: boolean) {
		this._infoPanelCollapsed = infoPanelCollapsed;

		localStorage.setItem('infoPanelCollapsed', JSON.stringify(infoPanelCollapsed));
	}

	// --------------------------------------------------------------------------------------------------
	get infoPanelCollapsed() {
		return this._infoPanelCollapsed;
	}

	// --------------------------------------------------------------------------------------------------
	toggleInfoPanel() {
		this.infoPanelCollapsed = !this.infoPanelCollapsed;

		this._infoPanelVisibility.set(this._infoPanelCollapsed);
	}

	// --------------------------------------------------------------------------------------------------
	emitUpdateEvents() {
		this._settings.set({
			displayMode: this._displayMode,
			pageSize: this._pageSize,
			sortFields: this._sortFields,
			sortAscending: this._sortAscending,
			showInfoPanel: this._showInfoPanel,
			infoPanelCollapsed: this._infoPanelCollapsed,
		});
	}

	// --------------------------------------------------------------------------------------------------
	set pageSize(pageSize: number) {
		this._pageSize = pageSize > 0 ? pageSize : this._defaultPageSize;

		localStorage.setItem('pageSize', this._pageSize.toString());
	}

	// --------------------------------------------------------------------------------------------------
	get pageSize() {
		return this._pageSize;
	}
}

export enum LayoutDisplayMode {
	List = 1,
	Grid = 2,
	Table = 3,
	Coverflow = 4,
}

export interface ILayoutFilter {
	fieldName: string;
	fieldLabel: string;
	fieldValue: any;
	fieldType: string;
}

export type ILayoutSortField = Record<string, string>;

export interface ILayoutSettings {
	displayMode: LayoutDisplayMode;
	pageSize: number;
	sortFields: string[];
	sortAscending: boolean;
	showInfoPanel: boolean;
	infoPanelCollapsed: boolean;
}
