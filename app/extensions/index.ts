export { defineContribution, defineSlot } from './contribution';
export type {
	ContributionDefinition,
	ContributionOverride,
	ContributionRegistration,
	ExtensionDiagnostic,
	ResolvedContribution,
	SlotDefinition,
	SlotResolution,
	WebUiExtension,
	VisibilityRuleDefinition,
} from './contribution';
export { ExtensionRegistry } from './extension-registry.service';
export { provideWebUiExtensions } from './provide-webui-extensions';
export { DOCUMENT_ACTIONS_SLOT, POLYMER_SLOTS } from './slots';
export type { DocumentActionContext } from './slots';
export { WebUiSlotComponent } from './webui-slot.component';

export {
	defineDocumentView,
	definePairedView,
	defineDocumentViewVariants,
	documentViewParameter,
	resolveDocumentViews,
	DOCUMENT_VIEWS_ITEMS_SLOT,
	DOCUMENT_VIEWS_PAGES_SLOT,
	DocumentViewTabComponent,
} from './document-view';
export type {
	DocumentViewDefinition,
	DocumentViewVariant,
	DocumentViewContext,
	DocumentViewItemContext,
	DocumentViewChange,
	ResolvedDocumentView,
} from './document-view';
export { DocumentViewsComponent } from './document-views.component';
export { ViewNavigation, documentViewsNavigationGuard } from './view-navigation';
export type { GuardedView, ViewDeparture } from './view-navigation';
export { USER_MENU_SLOT } from './user-menu';
export { WebUiAppState } from './app-state';
export { WebUiMessages, WebUiMessagePipe, provideWebUiMessages } from './webui-messages';
export type { WebUiMessageCatalog } from './webui-messages';
export { WebUiLocale, SUPPORTED_WEB_UI_LOCALES, normalizeWebUiLocale } from './i18n/webui-locale';
export type { SupportedWebUiLocale } from './i18n/webui-locale';
export {
	WebUiDatePipe,
	WebUiNumberPipe,
	WebUiCurrencyPipe,
	WebUiPercentPipe,
} from './i18n/format-pipes';
export { formatWebUiMessage } from './i18n/message-format';
export { LocalizedUiError, localizedState } from './i18n/localized-state';
export type { LocalizedState } from './i18n/localized-state';
export type { WebUiMessageValues } from './i18n/message-format';
export { WebUiIcons, WebUiIconComponent, provideWebUiIcons } from './webui-icons';
export type { WebUiIcon, WebUiSvgNode } from './webui-icons';
export { NUXEO_ICONS } from './nuxeo-icons.generated';
export { POLYMER_THEME_TOKENS } from './polymer-theme-tokens.generated';
export { POLYMER_MESSAGES } from './polymer-messages.generated';
export type {
	ApplicationUser,
	ApplicationContext,
	UserMenuLanguage,
	UserMenuContext,
} from './user-menu';

export {
	THEMES_SLOT,
	defineWebUiTheme,
	WebUiThemes,
	WebUiThemePickerComponent,
	provideWebUiThemeApplication,
} from './webui-themes';
export type { WebUiThemeContext, WebUiThemeDefinition } from './webui-themes';

export * from './document-layout';
export * from './document-layout-registry';
export * from './document-layout-host';
export { NUXEO_FILTERS, nuxeoFilter } from './nuxeo-filter';
export { gridLocale } from './i18n/grid-locale';
export type {
	NuxeoFilterConditions,
	NuxeoFilterContext,
	NuxeoFilterDocument,
	NuxeoFilters,
} from './nuxeo-filter';
export * from './workflow-layout';
export * from './directory-layout';
export { SchemaLayoutComponent } from './schema-layout.component';
export { SchemaFieldComponent } from './schema-field.component';

export { TRASH_RESULTS_SELECTION_ACTIONS_SLOT } from './results';
export type { ResultsSelectionContext } from './results';

export * from './document-info-bar';

export * from './publishing';

export * from './administration';

export * from './drawer';

export { ContributionOutletComponent } from './contribution-outlet.component';

export * from './analytics';

export * from './pages';

export * from './files';

export * from './toolbar';

export * from './quick-search';

export * from './comparison-layout';
export * from './bulk-layout';
export { DefaultBulkLayoutComponent } from './default-bulk-layout.component';

export * from './primitives/projection-primitives';
export * from './results-projection';
export * from './results-paging-settings';
export * from './suggestion-settings';
export { ResultsProjectionComponent } from './results-projection.component';
export type { ResultsProjectionMode } from './results-projection.component';
export {
	AgGridProjectionActionsComponent,
	AgGridProjectionCellComponent,
	AgGridProjectionCheckboxComponent,
	AgGridProjectionColumnSettingsComponent,
	AgGridProjectionFullWidthComponent,
	AgGridProjectionSelectAllComponent,
} from './ag-grid-projection-cells.component';
export * from './results-projection-registry';
export * from './document-projection-registry';
export * from './document-field-extensions';
export * from './saved-search-gateway';
