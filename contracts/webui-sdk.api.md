# WebUI SDK public API

Review changes to this report before updating it. Generated from the built package, including types referenced by its public entrypoint and Angular component metadata.

## Package entrypoints and peers

```json
{
  "name": "@maretha/webui-sdk",
  "exports": {
    "./package.json": {
      "default": "./package.json"
    },
    ".": {
      "types": "./types/maretha-webui-sdk.d.ts",
      "default": "./fesm2022/maretha-webui-sdk.mjs"
    }
  },
  "peerDependencies": {
    "@angular/common": "^21.2.0",
    "@angular/cdk": "^21.2.0",
    "@angular/core": "^21.2.0",
    "@angular/forms": "^21.2.0",
    "@angular/router": "^21.2.0",
    "ag-grid-angular": "^36.2.0",
    "ag-grid-community": "^36.2.0",
    "rxjs": "^7.5.0"
  }
}
```

## TypeScript declarations

```typescript
import * as _angular_core from '@angular/core';
import {
  Type,
  EnvironmentProviders,
  PipeTransform,
  OnChanges,
  SimpleChanges,
  InjectionToken,
  Provider,
  Signal,
  WritableSignal,
  OnDestroy,
  TemplateRef,
  AfterViewInit,
  ElementRef,
  StaticProvider,
} from '@angular/core';
import * as _maretha_webui_sdk from '@maretha/webui-sdk';
import { CanActivateFn } from '@angular/router';
import * as ag_stack from 'ag-stack';
import * as ag_grid_community from 'ag-grid-community';
import {
  ICellRendererParams,
  IHeaderParams,
  SelectionChangedEvent,
  SortChangedEvent,
  ColumnMovedEvent,
  ColumnResizedEvent,
  GridReadyEvent,
  Module,
  ColDef,
  RowClickedEvent,
  BodyScrollEndEvent,
} from 'ag-grid-community';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import { OperatorFunction } from 'rxjs';
interface SlotDefinition<C> {
  readonly name: string;
  readonly isContext: (value: unknown) => value is C;
}
type ComponentSource =
  | {
      readonly component: Type<unknown>;
      readonly loadComponent?: never;
    }
  | {
      readonly component?: never;
      readonly loadComponent: () => Promise<Type<unknown>>;
    };
type ContributionDefinition<C> = ComponentSource & {
  readonly id: string;
  readonly pairKey?: string;
  readonly retain?: boolean;
  readonly pageHeading?: 'component' | 'host';
  readonly order?: number;
  readonly priority?: number;
  readonly disabled?: boolean;
  readonly when?: (context: C) => boolean;
  readonly requiredVisibilityRule?: string;
  readonly inputs?: Readonly<Record<string, unknown>>;
};
type ContributionRegistration = ComponentSource & {
  readonly id: string;
  readonly slot: string;
  readonly pairKey?: string;
  readonly retain?: boolean;
  readonly pageHeading?: 'component' | 'host';
  readonly order?: number;
  readonly priority?: number;
  readonly disabled?: boolean;
  readonly inputs?: Readonly<Record<string, unknown>>;
  readonly isContext: (value: unknown) => boolean;
  readonly when?: (context: unknown) => boolean;
  readonly requiredVisibilityRule?: string;
};
interface VisibilityRuleDefinition {
  readonly id: string;
  readonly evaluate: (context: unknown) => boolean;
}
interface ContributionOverride {
  readonly visibilityRule?: string;
  readonly slot: string;
  readonly id: string;
  readonly disabled?: boolean;
  readonly order?: number;
}
interface WebUiExtension {
  readonly id: string;
  readonly contributions?: readonly ContributionRegistration[];
  readonly overrides?: readonly ContributionOverride[];
  readonly visibilityRules?: readonly VisibilityRuleDefinition[];
}
interface ExtensionDiagnostic {
  readonly code:
    | 'condition-failed'
    | 'invalid-context'
    | 'invalid-pair'
    | 'render-failed'
    | 'unknown-target'
    | 'unknown-visibility-rule'
    | 'visibility-rule-failed';
  readonly extensionId: string;
  readonly slot: string;
  readonly contributionId: string;
  readonly message: string;
}
type ResolvedContribution = ContributionRegistration & {
  readonly key: string;
  readonly extensionId: string;
  readonly order: number;
  readonly priority: number;
  readonly disabled: boolean;
  readonly visibilityRule?: string;
};
interface SlotResolution {
  readonly items: readonly ResolvedContribution[];
  readonly diagnostics: readonly ExtensionDiagnostic[];
}
declare function defineSlot<C>(
  name: string,
  isContext: (value: unknown) => value is C,
): SlotDefinition<C>;
declare function defineContribution<C>(
  slot: SlotDefinition<C>,
  definition: ContributionDefinition<C>,
): ContributionRegistration;
interface RegistrySnapshot {
  readonly visibilityRules: readonly VisibilityRuleDefinition[];
  readonly contributions: readonly ResolvedContribution[];
  readonly diagnostics: readonly ExtensionDiagnostic[];
}
declare class ExtensionRegistry {
  private layers;
  private layerOrder;
  private readonly state;
  readonly snapshot: _angular_core.Signal<RegistrySnapshot>;
  visibilityRuleIds(): readonly string[];
  isVisibilityRuleRegistered(id: string): boolean;
  register(extension: WebUiExtension): () => void;
  resolve(slot: string, context: unknown): SlotResolution;
  private copyAndValidate;
  private build;
  private diagnostic;
  private validateId;
  private validateNumber;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<ExtensionRegistry, never>;
  static ɵprov: _angular_core.ɵɵInjectableDeclaration<ExtensionRegistry>;
}
declare function provideWebUiExtensions(
  ...extensions: readonly WebUiExtension[]
): EnvironmentProviders;
type WebUiMessageValues = Readonly<
  Record<string, boolean | Date | null | number | string | undefined>
>;
declare function formatWebUiMessage(
  message: string,
  values: WebUiMessageValues,
  locale: string,
): string;
interface ApplicationUser {
  readonly id: string;
  readonly displayName: string;
  readonly isAdministrator: boolean;
  readonly groups: readonly string[];
}
interface ApplicationContext {
  readonly user: ApplicationUser | null;
  readonly locale: string;
  readonly route: string;
  readonly document: null | Readonly<Record<string, unknown>>;
}
interface UserMenuLanguage {
  readonly key: string;
  readonly label: string;
}
interface UserMenuContext extends ApplicationContext {
  readonly languages: readonly UserMenuLanguage[];
  readonly close: () => void;
  readonly openProfile: () => void;
  readonly changeLanguage: (key: string) => void;
  readonly signOut: () => void;
}
declare const USER_MENU_SLOT: _maretha_webui_sdk.SlotDefinition<UserMenuContext>;
declare const POLYMER_SLOTS: Readonly<{
  readonly DRAWER_ITEMS: 'DRAWER_ITEMS';
  readonly DRAWER_PAGES: 'DRAWER_PAGES';
  readonly PAGES: 'PAGES';
  readonly USER_MENU: 'USER_MENU';
  readonly ADMINISTRATION_MENU: 'ADMINISTRATION_MENU';
  readonly ADMINISTRATION_PAGES: 'ADMINISTRATION_PAGES';
  readonly DOCUMENT_ACTIONS: 'DOCUMENT_ACTIONS';
  readonly DOCUMENT_VIEWS_ITEMS: 'DOCUMENT_VIEWS_ITEMS';
  readonly DOCUMENT_VIEWS_PAGES: 'DOCUMENT_VIEWS_PAGES';
  readonly DOCUMENT_INFO_BAR: 'DOCUMENT_INFO_BAR';
  readonly BLOB_ACTIONS: 'BLOB_ACTIONS';
  readonly RESULTS_ACTIONS: 'RESULTS_ACTIONS';
  readonly RESULTS_SELECTION_ACTIONS: 'RESULTS_SELECTION_ACTIONS';
  readonly TRASH_RESULTS_SELECTION_ACTIONS: 'TRASH_RESULTS_SELECTION_ACTIONS';
  readonly COLLECTION_ACTIONS: 'COLLECTION_ACTIONS';
  readonly DOCUMENT_CREATE_ACTIONS: 'DOCUMENT_CREATE_ACTIONS';
  readonly CREATE_POPUP_ITEMS: 'CREATE_POPUP_ITEMS';
  readonly CREATE_POPUP_PAGES: 'CREATE_POPUP_PAGES';
  readonly FILE_UPLOAD_ACTIONS: 'FILE_UPLOAD_ACTIONS';
  readonly PUBLISH_ITEMS: 'PUBLISH_ITEMS';
  readonly PUBLISH_PAGES: 'PUBLISH_PAGES';
  readonly ANALYTICS_ITEMS: 'ANALYTICS_ITEMS';
  readonly ANALYTICS_PAGES: 'ANALYTICS_PAGES';
  readonly THEMES: 'THEMES';
}>;
interface DocumentActionContext {
  readonly document: null | Readonly<Record<string, unknown>>;
  readonly noEdit: boolean;
  readonly user?: ApplicationUser | null;
  readonly collection?: null | Readonly<Record<string, unknown>>;
  readonly refreshDocument?: () => void;
  readonly reportMessage?: (key: string, fallback: string, values?: WebUiMessageValues) => void;
  readonly standardHeaderActions?: boolean;
}
declare const DOCUMENT_ACTIONS_SLOT: _maretha_webui_sdk.SlotDefinition<DocumentActionContext>;
declare class WebUiSlotComponent {
  readonly name: _angular_core.InputSignal<string>;
  readonly context: _angular_core.InputSignal<unknown>;
  private readonly user;
  readonly slotContext: _angular_core.Signal<unknown>;
  readonly layout: _angular_core.InputSignal<'inline' | 'stack'>;
  readonly includeIds: _angular_core.InputSignal<null | readonly string[]>;
  readonly excludeIds: _angular_core.InputSignal<readonly string[]>;
  private readonly registry;
  readonly resolution: _angular_core.Signal<_maretha_webui_sdk.SlotResolution>;
  readonly visibleItems: _angular_core.Signal<_maretha_webui_sdk.ResolvedContribution[]>;
  private readonly outlets;
  readonly diagnostics: _angular_core.Signal<_maretha_webui_sdk.ExtensionDiagnostic[]>;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<WebUiSlotComponent, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    WebUiSlotComponent,
    'nx-webui-slot',
    never,
    {
      name: {
        alias: 'name';
        required: true;
        isSignal: true;
      };
      context: {
        alias: 'context';
        required: false;
        isSignal: true;
      };
      layout: {
        alias: 'layout';
        required: false;
        isSignal: true;
      };
      includeIds: {
        alias: 'includeIds';
        required: false;
        isSignal: true;
      };
      excludeIds: {
        alias: 'excludeIds';
        required: false;
        isSignal: true;
      };
    },
    {},
    never,
    never,
    true,
    never
  >;
}
type WebUiMessageCatalog = Readonly<Record<string, Readonly<Record<string, string>>>>;
declare class WebUiMessages {
  readonly locale: _angular_core.WritableSignal<string>;
  private readonly layers;
  private readonly catalog;
  text(key: string | undefined, fallback: string, locale?: string): string;
  format(key: string, values?: WebUiMessageValues, fallback?: string, locale?: string): string;
  register(owner: string, catalog: WebUiMessageCatalog, priority?: number): () => void;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<WebUiMessages, never>;
  static ɵprov: _angular_core.ɵɵInjectableDeclaration<WebUiMessages>;
}
declare function provideWebUiMessages(
  owner: string,
  catalog: WebUiMessageCatalog,
): _angular_core.EnvironmentProviders;
declare class WebUiMessagePipe implements PipeTransform {
  private readonly messages;
  transform(key: string, fallback?: string, ...values: readonly unknown[]): string;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<WebUiMessagePipe, never>;
  static ɵpipe: _angular_core.ɵɵPipeDeclaration<WebUiMessagePipe, 'webuiMessage', true>;
}
type DocumentViewContext = DocumentActionContext;
interface DocumentViewItemContext extends DocumentViewContext {
  readonly viewId: string;
  readonly selected: boolean;
  readonly tabId: string;
  readonly panelId: string;
  readonly tabIndex: number;
  readonly select: () => void;
}
interface DocumentViewChange {
  readonly viewId: null | string;
  readonly replaceUrl: boolean;
}
declare const DOCUMENT_VIEWS_ITEMS_SLOT: SlotDefinition<DocumentActionContext>;
declare const DOCUMENT_VIEWS_PAGES_SLOT: SlotDefinition<DocumentActionContext>;
declare class DocumentViewTabComponent {
  readonly context: _angular_core.InputSignal<DocumentViewItemContext>;
  readonly label: _angular_core.InputSignal<string>;
  readonly labelKey: _angular_core.InputSignal<string | undefined>;
  readonly icon: _angular_core.InputSignal<string | undefined>;
  readonly messages: WebUiMessages;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<DocumentViewTabComponent, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    DocumentViewTabComponent,
    'nx-document-view-tab',
    never,
    {
      context: {
        alias: 'context';
        required: true;
        isSignal: true;
      };
      label: {
        alias: 'label';
        required: true;
        isSignal: true;
      };
      labelKey: {
        alias: 'labelKey';
        required: false;
        isSignal: true;
      };
      icon: {
        alias: 'icon';
        required: false;
        isSignal: true;
      };
    },
    {},
    never,
    never,
    true,
    never
  >;
}
type DocumentViewDefinition = ContributionDefinition<DocumentViewContext> & {
  readonly viewId: string;
  readonly label: string;
  readonly labelKey?: string;
  readonly icon?: string;
};
declare function defineDocumentView(
  definition: DocumentViewDefinition,
): readonly ContributionRegistration[];
declare function definePairedView<C extends DocumentViewContext>(
  slots: {
    items: SlotDefinition<C>;
    pages: SlotDefinition<C>;
  },
  definition: ContributionDefinition<C> &
    Pick<DocumentViewDefinition, 'icon' | 'label' | 'labelKey' | 'viewId'>,
): readonly ContributionRegistration[];
interface ResolvedDocumentView {
  readonly viewId: string;
  readonly item: ResolvedContribution;
  readonly page: ResolvedContribution;
}
declare function resolveDocumentViews<C extends DocumentViewContext>(
  registry: ExtensionRegistry,
  context: C,
  slots?: {
    items: string;
    pages: string;
  },
): {
  views: readonly ResolvedDocumentView[];
  diagnostics: readonly ExtensionDiagnostic[];
};
type DocumentViewVariant = ContributionDefinition<DocumentViewContext>;
declare function defineDocumentViewVariants(
  definition: Pick<
    DocumentViewDefinition,
    'icon' | 'id' | 'label' | 'labelKey' | 'order' | 'viewId'
  >,
  variants: readonly DocumentViewVariant[],
): readonly ContributionRegistration[];
declare function documentViewParameter(params: { get(name: string): null | string }): null | string;
interface ViewDeparture {
  readonly reason: 'navigation' | 'tab';
  readonly nextViewId: null | string;
  readonly nextUrl?: string;
}
interface GuardedView {
  canDeactivate(departure: ViewDeparture): boolean | Promise<boolean>;
  hasPendingChanges?(): boolean;
}
declare class ViewNavigation {
  private readonly guards;
  private lastNavigation?;
  register(guard: (url: string) => Promise<boolean>): () => void;
  canNavigate(url: string, navigationId: number): Promise<boolean>;
  canLeave(url: string): Promise<boolean>;
  private check;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<ViewNavigation, never>;
  static ɵprov: _angular_core.ɵɵInjectableDeclaration<ViewNavigation>;
}
declare const documentViewsNavigationGuard: CanActivateFn;
declare class DocumentViewsComponent implements OnChanges {
  private readonly messages;
  private readonly locale;
  private labelProvided;
  ngOnChanges(changes: SimpleChanges): void;
  effectiveLabel(): string;
  readonly context: _angular_core.InputSignal<_maretha_webui_sdk.DocumentActionContext>;
  private readonly user;
  readonly slotContext: _angular_core.Signal<_maretha_webui_sdk.DocumentActionContext>;
  readonly itemSlot: _angular_core.InputSignal<string>;
  readonly pageSlot: _angular_core.InputSignal<string>;
  readonly label: _angular_core.InputSignal<string>;
  readonly orientation: _angular_core.InputSignal<'horizontal' | 'vertical'>;
  readonly presentation: _angular_core.InputSignal<'administration' | 'default'>;
  readonly navigationParameter: _angular_core.InputSignal<string>;
  readonly navigationVisible: _angular_core.InputSignal<boolean>;
  readonly selectedView: _angular_core.ModelSignal<null | string>;
  readonly navigationPath: _angular_core.InputSignal<null | string>;
  readonly viewChange: _angular_core.OutputEmitterRef<DocumentViewChange>;
  readonly pending: _angular_core.WritableSignal<boolean>;
  readonly departureMessage: _maretha_webui_sdk.LocalizedState<null>;
  private readonly guardViewId;
  readonly visibleViewId: _angular_core.Signal<null | string>;
  private readonly injector;
  private readonly registry;
  private readonly element;
  private readonly destroyRef;
  private readonly focusedView;
  private readonly acceptedView;
  private readonly visited;
  private lastScope;
  private requestId;
  private approved?;
  private readonly hostId;
  private readonly outlets;
  readonly resolution: _angular_core.Signal<{
    views: readonly ResolvedDocumentView[];
    diagnostics: readonly _maretha_webui_sdk.ExtensionDiagnostic[];
  }>;
  readonly scope: _angular_core.Signal<string>;
  readonly active: _angular_core.Signal<null | ResolvedDocumentView>;
  readonly activeLabel: _angular_core.Signal<string>;
  readonly pages: _angular_core.Signal<
    {
      renderKey: string;
      viewId: string;
      item: _maretha_webui_sdk.ResolvedContribution;
      page: _maretha_webui_sdk.ResolvedContribution;
    }[]
  >;
  protected readonly panels: _angular_core.Signal<
    {
      renderKey: string;
      mounted: boolean;
      viewId: string;
      item: _maretha_webui_sdk.ResolvedContribution;
      page: _maretha_webui_sdk.ResolvedContribution;
    }[]
  >;
  readonly tabs: _angular_core.Signal<
    {
      context: {
        viewId: string;
        selected: boolean;
        tabId: string;
        panelId: string;
        tabIndex: number;
        select: () => void;
        document: null | Readonly<Record<string, unknown>>;
        noEdit: boolean;
        user?: _maretha_webui_sdk.ApplicationUser | null;
        collection?: null | Readonly<Record<string, unknown>>;
        refreshDocument?: () => void;
        reportMessage?: (
          key: string,
          fallback: string,
          values?: _maretha_webui_sdk.WebUiMessageValues,
        ) => void;
        standardHeaderActions?: boolean;
      };
      viewId: string;
      item: _maretha_webui_sdk.ResolvedContribution;
      page: _maretha_webui_sdk.ResolvedContribution;
    }[]
  >;
  readonly diagnostics: _angular_core.Signal<_maretha_webui_sdk.ExtensionDiagnostic[]>;
  constructor();
  select(viewId: string): Promise<boolean>;
  private change;
  private commit;
  canDeactivate(departure: ViewDeparture): Promise<boolean>;
  private canNavigate;
  private checkDeparture;
  protected onTabFocus(event: FocusEvent): void;
  keyDown(event: KeyboardEvent): void;
  tabId(viewId: string): string;
  panelId(viewId: string): string;
  private focus;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<DocumentViewsComponent, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    DocumentViewsComponent,
    'nx-document-views, nx-paired-views',
    never,
    {
      context: {
        alias: 'context';
        required: true;
        isSignal: true;
      };
      itemSlot: {
        alias: 'itemSlot';
        required: false;
        isSignal: true;
      };
      pageSlot: {
        alias: 'pageSlot';
        required: false;
        isSignal: true;
      };
      label: {
        alias: 'label';
        required: false;
        isSignal: true;
      };
      orientation: {
        alias: 'orientation';
        required: false;
        isSignal: true;
      };
      presentation: {
        alias: 'presentation';
        required: false;
        isSignal: true;
      };
      navigationParameter: {
        alias: 'navigationParameter';
        required: false;
        isSignal: true;
      };
      navigationVisible: {
        alias: 'navigationVisible';
        required: false;
        isSignal: true;
      };
      selectedView: {
        alias: 'selectedView';
        required: false;
        isSignal: true;
      };
      navigationPath: {
        alias: 'navigationPath';
        required: false;
        isSignal: true;
      };
    },
    {
      selectedView: 'selectedViewChange';
      viewChange: 'viewChange';
    },
    never,
    ['[paired-views-header]'],
    true,
    never
  >;
}
type WorkflowLayoutMode = 'abandon' | 'delegate' | 'process' | 'reassign';
interface WorkflowTask {
  readonly id: string;
  readonly name: string;
  readonly variables?: Readonly<Record<string, unknown>>;
  readonly taskInfo?: {
    readonly taskActions?: readonly WorkflowTaskAction[];
    readonly allowTaskReassignment?: boolean;
    readonly layoutResource?: {
      readonly name?: string;
    };
  };
}
interface WorkflowTaskAction {
  readonly name: string;
  readonly label?: string;
  readonly validate?: boolean;
}
interface WorkflowLayoutContext {
  readonly document: Readonly<Record<string, unknown>>;
  readonly task: WorkflowTask;
  readonly taskKey: string;
  readonly variables: Readonly<Record<string, unknown>>;
  readonly mode: WorkflowLayoutMode;
  readonly readOnly: boolean;
  readonly noEdit: boolean;
  readonly busy: boolean;
  readonly errors: Readonly<Record<string, string>>;
  readonly commit: (variables: Readonly<Record<string, unknown>>) => void;
}
interface WorkflowLayout {
  readonly id: string;
  readonly taskKey: string;
  readonly component: Type<unknown>;
  readonly priority?: number;
}
declare const WORKFLOW_LAYOUTS: InjectionToken<readonly WorkflowLayout[]>;
declare function provideWorkflowLayout(layout: WorkflowLayout): Provider;
declare abstract class WebUiAppState {
  abstract readonly user: Signal<ApplicationUser | null>;
  abstract readonly locale: Signal<string>;
  abstract readonly route: Signal<string>;
  abstract readonly query: Signal<Readonly<Record<string, string>>>;
  abstract readonly clipboard: Signal<readonly Readonly<Record<string, unknown>>[]>;
  abstract readonly taskCount: Signal<number>;
  abstract readonly currentTask: Signal<null | WorkflowTask>;
  abstract readonly userWorkspace: Signal<null | string>;
  abstract readonly nuxeoUrl: string;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<WebUiAppState, never>;
  static ɵprov: _angular_core.ɵɵInjectableDeclaration<WebUiAppState>;
}
declare const SUPPORTED_WEB_UI_LOCALES: readonly [
  {
    readonly key: 'en-US';
    readonly label: 'English';
    readonly direction: 'ltr';
  },
  {
    readonly key: 'es';
    readonly label: 'Español';
    readonly direction: 'ltr';
  },
  {
    readonly key: 'fr';
    readonly label: 'Français';
    readonly direction: 'ltr';
  },
  {
    readonly key: 'ar';
    readonly label: 'العربية';
    readonly direction: 'rtl';
  },
  {
    readonly key: 'ro';
    readonly label: 'Română';
    readonly direction: 'ltr';
  },
  {
    readonly key: 'pt-PT';
    readonly label: 'Português';
    readonly direction: 'ltr';
  },
  {
    readonly key: 'it';
    readonly label: 'Italiano';
    readonly direction: 'ltr';
  },
];
type SupportedWebUiLocale = (typeof SUPPORTED_WEB_UI_LOCALES)[number]['key'];
declare function normalizeWebUiLocale(value: unknown): SupportedWebUiLocale | undefined;
declare class WebUiLocale {
  private readonly document;
  private initialized;
  readonly locale: _angular_core.WritableSignal<string>;
  readonly direction: _angular_core.Signal<'ltr' | 'rtl'>;
  constructor();
  initialize(): void;
  setLocale(value: string): void;
  private initialLocale;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<WebUiLocale, never>;
  static ɵprov: _angular_core.ɵɵInjectableDeclaration<WebUiLocale>;
}
declare class WebUiDatePipe implements PipeTransform {
  private readonly locale;
  private readonly formatter;
  transform(
    value: Date | null | number | string | undefined,
    format?: string,
    timezone?: string,
    locale?: string,
  ): null | string;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<WebUiDatePipe, never>;
  static ɵpipe: _angular_core.ɵɵPipeDeclaration<WebUiDatePipe, 'webuiDate', true>;
}
declare class WebUiNumberPipe implements PipeTransform {
  private readonly locale;
  private readonly formatter;
  transform(
    value: null | number | string | undefined,
    digitsInfo?: string,
    locale?: string,
  ): null | string;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<WebUiNumberPipe, never>;
  static ɵpipe: _angular_core.ɵɵPipeDeclaration<WebUiNumberPipe, 'webuiNumber', true>;
}
declare class WebUiCurrencyPipe implements PipeTransform {
  private readonly locale;
  private readonly formatter;
  transform(
    value: null | number | string | undefined,
    currencyCode?: string,
    display?: boolean | string,
    digitsInfo?: string,
    locale?: string,
  ): null | string;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<WebUiCurrencyPipe, never>;
  static ɵpipe: _angular_core.ɵɵPipeDeclaration<WebUiCurrencyPipe, 'webuiCurrency', true>;
}
declare class WebUiPercentPipe implements PipeTransform {
  private readonly locale;
  private readonly formatter;
  transform(
    value: null | number | string | undefined,
    digitsInfo?: string,
    locale?: string,
  ): null | string;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<WebUiPercentPipe, never>;
  static ɵpipe: _angular_core.ɵɵPipeDeclaration<WebUiPercentPipe, 'webuiPercent', true>;
}
declare class LocalizedUiError extends Error {
  readonly key: string;
  readonly fallback: string;
  readonly values: WebUiMessageValues;
  constructor(key: string, fallback: string, values?: WebUiMessageValues);
}
type LocalizedState<T extends null | string> = WritableSignal<string | T> & {
  setMessage(key: string, fallback: string, values?: WebUiMessageValues): void;
  setError(error: unknown, key: string, fallback: string): void;
};
declare function localizedState<T extends null | string>(initial: T): LocalizedState<T>;
interface WebUiSvgNode {
  readonly tag: string;
  readonly attributes?: Readonly<Record<string, string>>;
  readonly text?: string;
  readonly children?: readonly WebUiSvgNode[];
}
interface WebUiIcon {
  readonly viewBox: string;
  readonly nodes: readonly WebUiSvgNode[];
}
declare class WebUiIcons {
  private readonly layers;
  readonly catalog: _angular_core.Signal<Readonly<Record<string, WebUiIcon>>>;
  register(owner: string, icons: Readonly<Record<string, WebUiIcon>>): () => void;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<WebUiIcons, never>;
  static ɵprov: _angular_core.ɵɵInjectableDeclaration<WebUiIcons>;
}
declare function provideWebUiIcons(
  owner: string,
  icons: Readonly<Record<string, WebUiIcon>>,
): _angular_core.EnvironmentProviders;
declare class WebUiIconComponent {
  readonly name: _angular_core.InputSignal<string>;
  readonly label: _angular_core.InputSignal<string>;
  private readonly icons;
  readonly icon: _angular_core.Signal<undefined | WebUiIcon>;
  private readonly svg;
  constructor();
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<WebUiIconComponent, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    WebUiIconComponent,
    'nx-webui-icon',
    never,
    {
      name: {
        alias: 'name';
        required: true;
        isSignal: true;
      };
      label: {
        alias: 'label';
        required: false;
        isSignal: true;
      };
    },
    {},
    never,
    never,
    true,
    never
  >;
}
declare const NUXEO_ICONS: Readonly<Record<string, WebUiIcon>>;
declare const POLYMER_THEME_TOKENS: Readonly<Record<string, Readonly<Record<string, string>>>>;
declare const POLYMER_MESSAGES: Readonly<Record<string, Readonly<Record<string, string>>>>;
interface WebUiThemeContext {
  readonly selected: string;
  readonly select: (id: string) => void;
  readonly user?: ApplicationUser | null;
}
declare const THEMES_SLOT: _maretha_webui_sdk.SlotDefinition<WebUiThemeContext>;
interface WebUiThemeDefinition {
  readonly id: string;
  readonly label: string;
  readonly labelKey?: string;
  readonly tokens: Readonly<Record<string, string>>;
  readonly order?: number;
}
declare function defineWebUiTheme(
  theme: WebUiThemeDefinition,
): _maretha_webui_sdk.ContributionRegistration;
declare class WebUiThemes {
  private readonly registry;
  private readonly user;
  private readonly document;
  private readonly enabled;
  private readonly requested;
  private readonly originals;
  private readonly applied;
  readonly context: _angular_core.Signal<WebUiThemeContext>;
  readonly choices: _angular_core.Signal<readonly ResolvedContribution[]>;
  readonly selected: _angular_core.Signal<ResolvedContribution | undefined>;
  constructor();
  activate(): void;
  select(id: string): void;
  private restore;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<WebUiThemes, never>;
  static ɵprov: _angular_core.ɵɵInjectableDeclaration<WebUiThemes>;
}
declare function provideWebUiThemeApplication(): _angular_core.EnvironmentProviders;
declare class WebUiThemePickerComponent {
  readonly themes: WebUiThemes;
  readonly context: _angular_core.Signal<WebUiThemeContext>;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<WebUiThemePickerComponent, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    WebUiThemePickerComponent,
    'nx-webui-theme-picker',
    never,
    {},
    {},
    never,
    never,
    true,
    never
  >;
}
type LayoutMode = 'create' | 'edit' | 'import' | 'metadata' | 'view';
type SchemaFieldType =
  | 'blob'
  | 'boolean'
  | 'complex'
  | 'date'
  | 'directory'
  | 'double'
  | 'integer'
  | 'long'
  | 'reference'
  | 'string';
interface LayoutField {
  readonly property: string;
  readonly label: string;
  readonly labelKey?: string;
  readonly required?: boolean;
  readonly readOnly?: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly maxLength?: number;
  readonly widget?: string;
  readonly directoryName?: string;
}
interface DocumentLayout {
  readonly id: string;
  readonly documentType: string;
  readonly preserveSchemaConstraints?: boolean;
  readonly fields: readonly LayoutField[];
  readonly sections?: readonly {
    readonly id: string;
    readonly label: string;
    readonly labelKey?: string;
    readonly properties: readonly string[];
    readonly columns?: 1 | 2 | 3;
  }[];
}
interface SchemaFieldMetadata {
  readonly type?: string;
  readonly fields?: Readonly<Record<string, SchemaFieldMetadata | string>>;
  readonly constraints?: readonly unknown[];
  readonly itemConstraints?: readonly unknown[];
  readonly required?: boolean;
  readonly readOnly?: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly maxLength?: number;
  readonly directoryName?: string;
}
interface SchemaMetadata {
  readonly name: string;
  readonly prefix?: string;
  readonly '@prefix'?: string;
  readonly fields: Readonly<Record<string, SchemaFieldMetadata | string>>;
}
interface DocumentTypeMetadata {
  readonly name: string;
  readonly schemas: readonly SchemaMetadata[];
}
interface LayoutDocument {
  readonly uid: string;
  readonly type: string;
  readonly changeToken?: string;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly contextParameters?: {
    readonly permissions?: readonly string[];
  };
}
interface BlobValue {
  readonly 'upload-batch'?: string;
  readonly 'upload-fileId'?: string;
  readonly name?: string;
  readonly _name?: string;
  readonly mimeType?: string;
  readonly length?: number;
  readonly data?: string;
  readonly downloadUrl?: string;
}
interface ReferenceValue {
  readonly id: string;
  readonly label?: string;
}
interface DocumentLayoutGateway {
  readType(type: string): Promise<DocumentTypeMetadata>;
  read(uid: string): Promise<LayoutDocument>;
  update(
    document: LayoutDocument,
    properties: Readonly<Record<string, unknown>>,
  ): Promise<LayoutDocument>;
  create(
    parentId: string,
    type: string,
    name: string,
    properties: Readonly<Record<string, unknown>>,
  ): Promise<LayoutDocument>;
  uploadBlob?(file: File): Promise<BlobValue>;
  releaseBlob?(blob: BlobValue): Promise<void>;
  resolveReference?(field: ResolvedLayoutField, value: string): Promise<null | ReferenceValue>;
  searchReferences?(field: ResolvedLayoutField, query: string): Promise<readonly ReferenceValue[]>;
}
declare const DOCUMENT_LAYOUT_GATEWAY: InjectionToken<DocumentLayoutGateway>;
interface ResolvedLayoutField extends LayoutField {
  readonly type: SchemaFieldType;
  readonly multiple: boolean;
  readonly itemType?: SchemaFieldType;
  readonly fields?: Readonly<Record<string, SchemaFieldMetadata | string>>;
}
interface WidgetProps {
  readonly field: ResolvedLayoutField;
  readonly value: unknown;
  readonly disabled: boolean;
  readonly mode: LayoutMode;
  readonly identity: string;
  readonly revision?: number;
  readonly error: null | string;
  readonly labels?: Readonly<Record<string, string>>;
  readonly commit: (value: unknown) => void;
  readonly upload?: (file: File) => Promise<BlobValue>;
  readonly search?: (
    field: ResolvedLayoutField,
    query: string,
  ) => Promise<readonly ReferenceValue[]>;
}
interface DocumentLayoutWidget {
  readonly id: string;
  readonly component: Type<unknown>;
}
declare const DOCUMENT_LAYOUT_WIDGETS: InjectionToken<readonly DocumentLayoutWidget[]>;
declare function provideDocumentLayoutWidget(widget: DocumentLayoutWidget): Provider;
declare function resolveLayoutFields(
  layout: DocumentLayout,
  metadata: DocumentTypeMetadata,
): readonly ResolvedLayoutField[];
declare function cloneLayoutValue<T>(value: T): T;
declare function layoutFieldError(
  field: ResolvedLayoutField,
  value: unknown,
  format?: (
    key: string,
    values: Readonly<Record<string, number | string>>,
    fallback: string,
  ) => string,
): null | string;
declare function layoutPropertyValue(field: ResolvedLayoutField, value: unknown): unknown;
type DocumentLayoutMode = 'create' | 'edit' | 'import' | 'metadata' | 'view';
interface DocumentLayoutContext {
  readonly documentType: null | string;
  readonly mode: DocumentLayoutMode;
  readonly document: null | Readonly<Record<string, unknown>>;
  readonly parentDocument: null | Readonly<Record<string, unknown>>;
  readonly noEdit: boolean;
}
interface DocumentLayoutDefinition {
  readonly id: string;
  readonly documentType?: string;
  readonly mode: DocumentLayoutMode;
  readonly component?: Type<unknown>;
  readonly source?: string;
  readonly priority?: number;
  readonly disabled?: boolean;
  readonly when?: (context: DocumentLayoutContext) => boolean;
}
interface DocumentLayoutOverride {
  readonly id: string;
  readonly disabled?: boolean;
  readonly priority?: number;
}
interface DocumentLayoutExtension {
  readonly id: string;
  readonly layouts?: readonly DocumentLayoutDefinition[];
  readonly overrides?: readonly DocumentLayoutOverride[];
}
interface ResolvedDocumentLayout extends DocumentLayoutDefinition {
  readonly extensionId: string;
  readonly priority: number;
  readonly disabled: boolean;
}
declare function documentLayoutContext(input: {
  documentType?: unknown;
  mode: DocumentLayoutMode;
  document?: unknown;
  parentDocument?: unknown;
  noEdit?: boolean;
}): DocumentLayoutContext;
declare class DocumentLayoutRegistry {
  private readonly layers;
  private readonly revisionState;
  readonly revision: _angular_core.Signal<number>;
  register(extension: DocumentLayoutExtension): () => void;
  resolve(context: DocumentLayoutContext): ResolvedDocumentLayout | undefined;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<DocumentLayoutRegistry, never>;
  static ɵprov: _angular_core.ɵɵInjectableDeclaration<DocumentLayoutRegistry>;
}
declare function provideDocumentLayoutExtensions(
  ...extensions: readonly DocumentLayoutExtension[]
): EnvironmentProviders;
interface DocumentLayoutHost {
  complete(documents: readonly LayoutDocument[]): void;
  cancel(): void;
}
declare const DOCUMENT_LAYOUT_HOST: InjectionToken<DocumentLayoutHost>;
interface DocumentImportDraft {
  readonly file: File;
  readonly properties: Readonly<Record<string, unknown>>;
  update(properties: Readonly<Record<string, unknown>>): void;
  setValid(valid: boolean): void;
}
declare const DOCUMENT_IMPORT_DRAFT: InjectionToken<DocumentImportDraft>;
type NuxeoFilterDocument = null | Readonly<Record<string, unknown>> | undefined;
declare const NUXEO_FILTERS: Readonly<{
  isFavorite: (doc: NuxeoFilterDocument) => boolean;
  isSubscribed: (doc: NuxeoFilterDocument) => boolean;
  isCollectionMember: (doc: NuxeoFilterDocument) => boolean;
  isTrashed: (doc: NuxeoFilterDocument) => boolean;
  canSetRetention: (doc: NuxeoFilterDocument) => boolean;
  canSetLegalHold: (doc: NuxeoFilterDocument) => boolean;
  isRetentionDateIndeterminate: (doc: NuxeoFilterDocument) => boolean;
  isVersion: (doc: NuxeoFilterDocument) => boolean;
  isImmutable: (doc: NuxeoFilterDocument) => boolean;
  isUnderRetentionOrLegalHold: (doc: NuxeoFilterDocument) => boolean;
  isRecord: (doc: NuxeoFilterDocument) => boolean;
  hasType: (doc: NuxeoFilterDocument, type: string) => boolean;
  isProxy: (doc: NuxeoFilterDocument) => boolean;
  pathMatches: (doc: NuxeoFilterDocument, pattern: string) => boolean;
  pathStartsWith: (doc: NuxeoFilterDocument, path: string) => boolean;
  hasState: (doc: NuxeoFilterDocument, state: string) => boolean;
  hasFacet: (doc: NuxeoFilterDocument, facet: string) => boolean;
  hasPermission: (doc: NuxeoFilterDocument, permission: string) => boolean;
  hasContent: (doc: NuxeoFilterDocument, xpath?: string) => boolean;
  hasAttachments: (doc: NuxeoFilterDocument) => boolean;
  hasVersions: (doc: NuxeoFilterDocument) => boolean;
  hasCollections: (doc: NuxeoFilterDocument) => boolean;
  hasSchema: (doc: NuxeoFilterDocument, schema: string) => boolean;
  isMember: (user: unknown, group: string) => boolean;
  isPublishable: (doc: NuxeoFilterDocument) => boolean;
  isPublication: (doc: NuxeoFilterDocument) => boolean;
  isTaggable: (doc: NuxeoFilterDocument) => boolean;
  hasAdministrationPermissions: (user: unknown) => boolean;
  hasRunningWorkflows: (doc: NuxeoFilterDocument) => boolean;
  hasRunnableWorkflows: (doc: NuxeoFilterDocument) => boolean;
}>;
type NuxeoFilters = typeof NUXEO_FILTERS;
interface NuxeoFilterContext {
  readonly document?: NuxeoFilterDocument;
  readonly user?: unknown;
}
interface NuxeoFilterConditions {
  readonly type?: string;
  readonly facet?: string;
  readonly schema?: string;
  readonly state?: string;
  readonly path?: string;
  readonly permission?: string;
  readonly group?: string;
  readonly expression?: (
    document: NuxeoFilterDocument,
    user: unknown,
    filters: NuxeoFilters,
  ) => boolean;
}
declare function nuxeoFilter(
  conditions: NuxeoFilterConditions,
): (context: NuxeoFilterContext) => boolean;
declare function gridLocale(messages: WebUiMessages): Record<string, string>;
interface DirectoryLayoutContext {
  readonly directory: {
    readonly name: string;
    readonly schema: string;
    readonly parent?: string;
  };
  readonly draft: {
    readonly id: string;
    readonly directoryName: string;
    readonly properties: Readonly<Record<string, unknown>>;
  };
  readonly isNew: boolean;
  readonly noEdit: boolean;
  readonly readOnly: boolean;
  readonly busy: boolean;
  readonly dirty: boolean;
  readonly commit: (draft: {
    id: string;
    directoryName: string;
    properties: Record<string, unknown>;
  }) => boolean;
  readonly cancel: () => boolean;
}
interface DirectoryLayoutComponent {
  context: DirectoryLayoutContext;
}
interface DirectoryLayoutRegistration {
  readonly schema: string;
  readonly component: Type<DirectoryLayoutComponent>;
}
declare const DIRECTORY_LAYOUTS: InjectionToken<readonly DirectoryLayoutRegistration[]>;
declare function provideDirectoryLayouts(...layouts: DirectoryLayoutRegistration[]): {
  provide: InjectionToken<readonly DirectoryLayoutRegistration[]>;
  useValue: DirectoryLayoutRegistration[];
  multi: boolean;
};
declare class SchemaLayoutComponent implements GuardedView {
  readonly layout: _angular_core.InputSignal<DocumentLayout>;
  readonly documentId: _angular_core.InputSignal<string | undefined>;
  readonly parentId: _angular_core.InputSignal<string | undefined>;
  readonly name: _angular_core.InputSignal<string>;
  readonly mode: _angular_core.InputSignal<LayoutMode>;
  readonly noEdit: _angular_core.InputSignal<boolean>;
  readonly draftOnly: _angular_core.InputSignal<boolean>;
  readonly initialValues: _angular_core.InputSignal<Readonly<Record<string, unknown>>>;
  readonly valueChanged: _angular_core.OutputEmitterRef<Readonly<Record<string, unknown>>>;
  private disposed;
  readonly saved: _angular_core.OutputEmitterRef<LayoutDocument>;
  private readonly messages;
  private readonly gateway;
  private readonly widgets;
  private readonly tasks;
  private readonly id;
  private nextUploadId;
  private readonly transientBlobs;
  private nextWriteId;
  private readonly pendingWriteBatches;
  private generation;
  private baseline;
  private departure?;
  readonly departurePending: WritableSignal<boolean>;
  readonly loading: WritableSignal<boolean>;
  readonly saving: WritableSignal<boolean>;
  readonly ready: WritableSignal<boolean>;
  readonly error: _maretha_webui_sdk.LocalizedState<''>;
  readonly status: _maretha_webui_sdk.LocalizedState<''>;
  readonly document: WritableSignal<LayoutDocument | null>;
  readonly fields: WritableSignal<readonly ResolvedLayoutField[]>;
  readonly values: WritableSignal<Readonly<Record<string, unknown>>>;
  private readonly vocabularyLabels;
  private readonly vocabularyRequests;
  readonly sections: _angular_core.Signal<
    | {
        fields: ResolvedLayoutField[];
        id: string;
        label: string;
        labelKey?: string;
        properties: readonly string[];
        columns?: 1 | 2 | 3;
      }[]
    | {
        id: string;
        label: string;
        labelKey: string | undefined;
        columns: number;
        fields: readonly ResolvedLayoutField[];
      }[]
  >;
  idForSection(id: string): string;
  sectionLabel(section: { label: string; labelKey?: string }): string;
  private readonly structuredErrorValues;
  readonly structuredErrors: WritableSignal<Readonly<Record<string, string>>>;
  readonly uploading: WritableSignal<Readonly<Record<string, readonly string[]>>>;
  readonly dirty: WritableSignal<boolean>;
  private readonly revision;
  readonly invalid: _angular_core.Signal<boolean>;
  readonly readOnly: _angular_core.Signal<boolean>;
  constructor();
  private load;
  reload(): Promise<void>;
  fieldId(field: ResolvedLayoutField): string;
  inputType(field: ResolvedLayoutField): string;
  inputValue(field: ResolvedLayoutField): string;
  display(field: ResolvedLayoutField): string;
  customWidget(field: ResolvedLayoutField): DocumentLayoutWidget | undefined;
  widgetProps(field: ResolvedLayoutField): WidgetProps;
  private blobDisplay;
  fieldLabel(field: ResolvedLayoutField): string;
  private createStructuredErrors;
  private structuredError;
  fieldError(field: ResolvedLayoutField): null | string;
  update(field: ResolvedLayoutField, event: Event): void;
  validateReference(field: ResolvedLayoutField): Promise<void>;
  private commit;
  draftProperties(): Readonly<Record<string, unknown>>;
  protectDraft(): (outcome: 'committed' | 'failed' | 'uncertain') => void;
  submit(event: Event): Promise<void>;
  discard(): void;
  hasPendingChanges(): boolean;
  hasUploads(): boolean;
  canDeactivate(): boolean | Promise<boolean>;
  resolveDeparture(allow: boolean): void;
  discardAndLeave(): void;
  private cloneValues;
  private same;
  private trackBlob;
  private releaseTransientBlobs;
  private releaseWhenSafe;
  private releaseOrphanedBlobs;
  private currentBatchIds;
  private isBatchProtected;
  private collectBatchIds;
  private releaseBlob;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<SchemaLayoutComponent, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    SchemaLayoutComponent,
    'nx-schema-layout',
    never,
    {
      layout: {
        alias: 'layout';
        required: true;
        isSignal: true;
      };
      documentId: {
        alias: 'documentId';
        required: false;
        isSignal: true;
      };
      parentId: {
        alias: 'parentId';
        required: false;
        isSignal: true;
      };
      name: {
        alias: 'name';
        required: false;
        isSignal: true;
      };
      mode: {
        alias: 'mode';
        required: false;
        isSignal: true;
      };
      noEdit: {
        alias: 'noEdit';
        required: false;
        isSignal: true;
      };
      draftOnly: {
        alias: 'draftOnly';
        required: false;
        isSignal: true;
      };
      initialValues: {
        alias: 'initialValues';
        required: false;
        isSignal: true;
      };
    },
    {
      valueChanged: 'valueChanged';
      saved: 'saved';
    },
    never,
    never,
    true,
    never
  >;
}
declare class SchemaFieldComponent implements OnDestroy {
  private readonly messages;
  private readonly element;
  readonly props: _angular_core.InputSignal<WidgetProps>;
  readonly options: _angular_core.WritableSignal<
    readonly {
      id: string;
      label?: string;
    }[]
  >;
  readonly lookupLoading: _angular_core.WritableSignal<boolean>;
  readonly lookupError: _maretha_webui_sdk.LocalizedState<''>;
  readonly lookupComplete: _angular_core.WritableSignal<boolean>;
  readonly lookupHint: _angular_core.WritableSignal<string>;
  private readonly suggestionSettings;
  private readonly suggestionScope;
  readonly limits: _angular_core.Signal<_maretha_webui_sdk.SuggestionLimits>;
  readonly query: _angular_core.WritableSignal<string>;
  readonly directoryOpen: _angular_core.WritableSignal<boolean>;
  private readonly directoryLabels;
  private directoryLabelScope?;
  private lookupGeneration;
  private lookupTimer?;
  private listState?;
  private nextItemKey;
  private lookupScope?;
  private lookupLocale?;
  private readonly instance;
  constructor();
  ngOnDestroy(): void;
  id(): string;
  errorId(): string;
  describedBy(): null | string;
  field(): ResolvedLayoutField;
  fieldLabel(): string;
  currentError(): null | string;
  list(): readonly unknown[];
  itemIdentity(_item: unknown, index: number): string;
  itemField(): ResolvedLayoutField;
  children(): readonly ResolvedLayoutField[];
  private childField;
  childProps(field: ResolvedLayoutField): WidgetProps;
  itemProps(item: unknown, index: number): WidgetProps;
  inputType(): string;
  text(value: unknown): string;
  blobName(): string;
  scalar(event: Event): void;
  add(): void;
  remove(index: number): void;
  move(index: number, delta: number): void;
  clearBlob(): void;
  pick(event: Event): Promise<void>;
  lookup(event: Event): void;
  directoryLabel(value: unknown): string;
  directoryInputValue(): string;
  directorySelected(id: string): boolean;
  openDirectory(event?: Event): void;
  toggleDirectory(): void;
  closeDirectory(event?: Event): void;
  directoryBlur(event: FocusEvent): void;
  clearDirectory(): void;
  private search;
  choose(id: string): void;
  private defaultValue;
  private object;
  private listKeys;
  private rememberList;
  private newItemKey;
  private sameList;
  private cancelLookup;
  private lookupToken;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<SchemaFieldComponent, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    SchemaFieldComponent,
    'nx-schema-field',
    never,
    {
      props: {
        alias: 'props';
        required: true;
        isSignal: true;
      };
    },
    {},
    never,
    never,
    true,
    never
  >;
}
interface ResultsProjectionRow {
  readonly uid: string;
  readonly title?: string;
  readonly type?: string;
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly [key: string]: unknown;
}
interface ResultsProjectionColumn<R extends ResultsProjectionRow = ResultsProjectionRow> {
  readonly id: string;
  readonly label: string;
  readonly labelKey?: string;
  readonly value?: (row: R) => unknown;
  readonly hidden?: boolean;
  readonly sortable?: boolean;
  readonly width?: number;
  readonly minWidth?: number;
  readonly flex?: number;
  readonly headerComponent?: Type<unknown>;
  readonly headerComponentParams?: Readonly<Record<string, unknown>>;
}
interface ResultsColumnLayout {
  readonly id: string;
  readonly width?: number;
}
interface ResultsProjectionContext<R extends ResultsProjectionRow = ResultsProjectionRow> {
  readonly searchId?: string;
  readonly row: R;
  readonly index: number;
  readonly selected: boolean;
  readonly selection: ReadonlySet<string>;
  readonly readonly: boolean;
  readonly loading: boolean;
  readonly columns: readonly ResultsProjectionColumn<R>[];
  readonly column?: ResultsProjectionColumn<R>;
  readonly value?: unknown;
  readonly scope: unknown;
  readonly toggleSelection: () => void;
  readonly selectRow: (event: Event) => void;
  readonly activateRow: () => void;
  readonly invokeAction: (action: string, argument?: unknown) => void;
}
interface ResultsProjectionHostContext<R extends ResultsProjectionRow = ResultsProjectionRow> {
  readonly searchId?: string;
  readonly rows: readonly R[];
  readonly selection: ReadonlySet<string>;
  readonly readonly: boolean;
  readonly loading: boolean;
  readonly columns: readonly ResultsProjectionColumn<R>[];
  readonly scope: unknown;
  readonly toggleAll: () => void;
  readonly clearSelection: () => void;
  readonly invokeAction: (action: string, argument?: unknown) => void;
}
type ResultsProjectionTemplateName =
  | 'action'
  | 'actions'
  | 'cell'
  | 'checkbox'
  | 'default'
  | 'detail'
  | 'empty'
  | 'form'
  | 'item'
  | 'rowdetail'
  | 'selectionActions'
  | 'selectiontoolbar'
  | 'settings'
  | `cell:${string}`;
type ResultsProjectionRowTemplateName = Exclude<
  ResultsProjectionTemplateName,
  'actions' | 'default' | 'empty' | 'form' | 'selectionActions' | 'selectiontoolbar'
>;
type ResultsProjectionHostTemplateName = Extract<
  ResultsProjectionTemplateName,
  'actions' | 'default' | 'empty' | 'form' | 'selectionActions' | 'selectiontoolbar'
>;
type ResultsProjectionComponentLoader = () => Promise<Type<unknown>>;
type ResultsProjectionComponents = Readonly<
  Partial<Record<'cell' | 'item' | `cell:${string}`, ResultsProjectionComponentLoader>>
>;
declare class ResultsProjectionTemplateDirective<
  R extends ResultsProjectionRow = ResultsProjectionRow,
> {
  readonly template: TemplateRef<ResultsProjectionContext<R>>;
  nxResultsTemplate: ResultsProjectionRowTemplateName;
  constructor(template: TemplateRef<ResultsProjectionContext<R>>);
  static ngTemplateContextGuard<R extends ResultsProjectionRow>(
    _dir: ResultsProjectionTemplateDirective<R>,
    _context: unknown,
  ): _context is ResultsProjectionContext<R>;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<ResultsProjectionTemplateDirective<any>, never>;
  static ɵdir: _angular_core.ɵɵDirectiveDeclaration<
    ResultsProjectionTemplateDirective<any>,
    'ng-template[nxResultsTemplate]',
    never,
    {
      nxResultsTemplate: {
        alias: 'nxResultsTemplate';
        required: true;
      };
    },
    {},
    never,
    never,
    true,
    never
  >;
}
declare class ResultsProjectionHostTemplateDirective<
  R extends ResultsProjectionRow = ResultsProjectionRow,
> {
  readonly template: TemplateRef<ResultsProjectionHostContext<R>>;
  nxResultsHostTemplate: ResultsProjectionHostTemplateName;
  constructor(template: TemplateRef<ResultsProjectionHostContext<R>>);
  static ngTemplateContextGuard<R extends ResultsProjectionRow>(
    _dir: ResultsProjectionHostTemplateDirective<R>,
    _context: unknown,
  ): _context is ResultsProjectionHostContext<R>;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<
    ResultsProjectionHostTemplateDirective<any>,
    never
  >;
  static ɵdir: _angular_core.ɵɵDirectiveDeclaration<
    ResultsProjectionHostTemplateDirective<any>,
    'ng-template[nxResultsHostTemplate]',
    never,
    {
      nxResultsHostTemplate: {
        alias: 'nxResultsHostTemplate';
        required: true;
      };
    },
    {},
    never,
    never,
    true,
    never
  >;
}
interface ProjectionCellParams<
  R extends ResultsProjectionRow = ResultsProjectionRow,
> extends ICellRendererParams<R> {
  readonly host: ResultsProjectionComponent<R>;
  readonly projectionColumn?: ResultsProjectionColumn<R>;
}
declare abstract class ProjectionCell<
  R extends ResultsProjectionRow,
> implements ICellRendererAngularComp {
  private readonly changeDetector;
  params: ProjectionCellParams<R>;
  agInit(params: ProjectionCellParams<R>): void;
  refresh(params: ProjectionCellParams<R>): boolean;
  get row(): R;
  get index(): number;
  get column(): ResultsProjectionColumn<R>;
  context(
    column?: ResultsProjectionColumn<R> | undefined,
  ): _maretha_webui_sdk.ResultsProjectionContext<R>;
  component(name: string): null | Type<unknown>;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<ProjectionCell<any>, never>;
  static ɵdir: _angular_core.ɵɵDirectiveDeclaration<
    ProjectionCell<any>,
    never,
    never,
    {
      params: {
        alias: 'params';
        required: false;
      };
    },
    {},
    never,
    never,
    true,
    never
  >;
}
declare class AgGridProjectionCellComponent<
  R extends ResultsProjectionRow = ResultsProjectionRow,
> extends ProjectionCell<R> {
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<AgGridProjectionCellComponent<any>, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    AgGridProjectionCellComponent<any>,
    'nx-ag-grid-projection-cell',
    never,
    {},
    {},
    never,
    never,
    true,
    never
  >;
}
declare class AgGridProjectionCheckboxComponent<
  R extends ResultsProjectionRow = ResultsProjectionRow,
> extends ProjectionCell<R> {
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<AgGridProjectionCheckboxComponent<any>, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    AgGridProjectionCheckboxComponent<any>,
    'nx-ag-grid-projection-checkbox',
    never,
    {},
    {},
    never,
    never,
    true,
    never
  >;
}
declare class AgGridProjectionSelectAllComponent<
  R extends ResultsProjectionRow = ResultsProjectionRow,
> {
  private readonly changeDetector;
  params: IHeaderParams & {
    host: ResultsProjectionComponent<R>;
  };
  agInit(
    params: IHeaderParams & {
      host: ResultsProjectionComponent<R>;
    },
  ): void;
  refresh(
    params: IHeaderParams & {
      host: ResultsProjectionComponent<R>;
    },
  ): boolean;
  readonly isRowSelected: (row: R) => boolean;
  get host(): ResultsProjectionComponent<R>;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<AgGridProjectionSelectAllComponent<any>, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    AgGridProjectionSelectAllComponent<any>,
    'nx-ag-grid-projection-select-all',
    never,
    {},
    {},
    never,
    never,
    true,
    never
  >;
}
declare class AgGridProjectionColumnSettingsComponent<
  R extends ResultsProjectionRow = ResultsProjectionRow,
> implements OnDestroy {
  private readonly changeDetector;
  private readonly gear;
  params: IHeaderParams & {
    host: ResultsProjectionComponent<R>;
  };
  private cell?;
  private readonly forwardFocus;
  agInit(
    params: IHeaderParams & {
      host: ResultsProjectionComponent<R>;
    },
  ): void;
  refresh(
    params: IHeaderParams & {
      host: ResultsProjectionComponent<R>;
    },
  ): boolean;
  ngOnDestroy(): void;
  open(event: Event): void;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<
    AgGridProjectionColumnSettingsComponent<any>,
    never
  >;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    AgGridProjectionColumnSettingsComponent<any>,
    'nx-ag-grid-projection-column-settings',
    never,
    {},
    {},
    never,
    never,
    true,
    never
  >;
}
declare class AgGridProjectionActionsComponent<
  R extends ResultsProjectionRow = ResultsProjectionRow,
> extends ProjectionCell<R> {
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<AgGridProjectionActionsComponent<any>, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    AgGridProjectionActionsComponent<any>,
    'nx-ag-grid-projection-actions',
    never,
    {},
    {},
    never,
    never,
    true,
    never
  >;
}
declare class AgGridProjectionFullWidthComponent<
  R extends ResultsProjectionRow = ResultsProjectionRow,
>
  extends ProjectionCell<R>
  implements AfterViewInit, OnDestroy
{
  private readonly element;
  private observer?;
  ngAfterViewInit(): void;
  ngOnDestroy(): void;
  cellComponent(column: ResultsProjectionColumn<R>): null | Type<unknown>;
  cellGridColumns(): string;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<AgGridProjectionFullWidthComponent<any>, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    AgGridProjectionFullWidthComponent<any>,
    'nx-ag-grid-projection-full-width',
    never,
    {},
    {},
    never,
    never,
    true,
    never
  >;
}
type ResultsProjectionMode = 'grid' | 'list' | 'table';
declare class ResultsProjectionComponent<R extends ResultsProjectionRow = ResultsProjectionRow> {
  readonly rows: _angular_core.InputSignal<readonly R[]>;
  readonly selection: _angular_core.InputSignal<readonly string[]>;
  readonly mode: _angular_core.InputSignal<ResultsProjectionMode>;
  readonly virtualized: _angular_core.InputSignal<boolean>;
  readonly remoteSort: _angular_core.InputSignal<boolean>;
  readonly sortChange: _angular_core.OutputEmitterRef<{
    columnId: string;
    direction: 'asc' | 'desc' | null;
  }>;
  readonly columns: _angular_core.InputSignal<readonly ResultsProjectionColumn<R>[]>;
  readonly rowActivation: _angular_core.InputSignal<boolean>;
  readonly rowActivationDisabled: _angular_core.InputSignal<boolean>;
  readonly rowActivated: _angular_core.OutputEmitterRef<R>;
  readonly columnLayoutEnabled: _angular_core.InputSignal<boolean>;
  readonly columnLayoutChange: _angular_core.OutputEmitterRef<readonly ResultsColumnLayout[]>;
  readonly columnChooser: _angular_core.InputSignal<boolean>;
  readonly columnChooserOpen: _angular_core.OutputEmitterRef<HTMLElement>;
  readonly readOnly: _angular_core.InputSignal<boolean>;
  readonly selectionEnabled: _angular_core.InputSignal<boolean>;
  readonly loading: _angular_core.InputSignal<boolean>;
  readonly pageScroll: _angular_core.InputSignal<boolean>;
  readonly tableHeaderHeight: _angular_core.InputSignal<number>;
  readonly tableRowHeight: _angular_core.InputSignal<number>;
  readonly selectionColumnWidth: _angular_core.InputSignal<number>;
  readonly scope: _angular_core.InputSignal<unknown>;
  readonly hostId: _angular_core.InputSignal<string>;
  readonly searchId: _angular_core.InputSignal<string | undefined>;
  readonly components: _angular_core.InputSignal<
    Readonly<Partial<Record<'cell' | 'item' | `cell:${string}`, ResultsProjectionComponentLoader>>>
  >;
  private readonly loadedComponents;
  private readonly componentLoads;
  private readonly componentTasks;
  private readonly componentErrors;
  private readonly loadComponents;
  readonly contextEpoch: _angular_core.InputSignal<number>;
  readonly rowDisabled: _angular_core.InputSignal<(row: R) => boolean>;
  readonly selectionChange: _angular_core.OutputEmitterRef<readonly string[]>;
  readonly loadMore: _angular_core.OutputEmitterRef<void>;
  readonly action: _angular_core.OutputEmitterRef<{
    readonly action: string;
    readonly row?: R;
    readonly argument?: unknown;
  }>;
  private readonly templates;
  private readonly hostTemplates;
  readonly locale: WebUiLocale;
  private readonly messages;
  readonly gridMessages: _angular_core.Signal<Record<string, string>>;
  private readonly registry;
  private readonly paging;
  readonly visibleColumns: _angular_core.Signal<ResultsProjectionColumn<R>[]>;
  private readonly agApi;
  readonly gridViews: _angular_core.Signal<
    {
      language: string;
      state: ag_grid_community.GridState | undefined;
    }[]
  >;
  readonly agSelectionOptions: {
    mode: 'multiRow';
    checkboxes: boolean;
    headerCheckbox: boolean;
    enableClickSelection: false;
    isRowSelectable: (node: { data?: R }) => boolean;
  };
  readonly agHeight: _angular_core.Signal<string>;
  agSelectionChanged(event: SelectionChangedEvent<R>): void;
  onSortChanged(event: SortChangedEvent<R>): void;
  onColumnLayoutChanged(event: ColumnMovedEvent<R> | ColumnResizedEvent<R>): void;
  onGridReady(event: GridReadyEvent<R>): void;
  private readonly syncGridSelection;
  readonly agGridModules: Module[];
  readonly agTheme: ag_stack.Theme<ag_grid_community.ThemeDefaultParams>;
  private bottomReached;
  private bottomKey;
  readonly agRowId: (params: { data: R }) => string;
  readonly agIsFullWidthRow: (params: {
    rowNode: {
      data?: R;
    };
  }) => boolean;
  readonly agFullWidthRenderer: typeof AgGridProjectionFullWidthComponent;
  readonly agFullWidthRendererParams: {
    host: ResultsProjectionComponent<R>;
  };
  readonly agRows: _angular_core.Signal<R[]>;
  readonly agColumns: _angular_core.Signal<ColDef<R, any>[]>;
  readonly selected: _angular_core.Signal<Set<string>>;
  readonly allSelected: _angular_core.Signal<boolean>;
  readonly trackByRow: (_index: number, row: R) => string;
  private hasActions;
  hasRowActions(row: R, index: number): boolean;
  hasDetails(): boolean;
  hasDetail(row: R, index: number): boolean;
  detailComponent(row: R, index: number): null | Type<unknown>;
  detailTemplate(): null | TemplateRef<unknown>;
  shouldVirtualize(): boolean;
  readonly gridColumns = 15;
  gridRows(): readonly (readonly R[])[];
  readonly trackByGridRow: (index: number) => number;
  private hasRegisteredDetail;
  template(name: ResultsProjectionTemplateName): null | TemplateRef<unknown>;
  projectionComponent(name: string, context: unknown): null | Type<unknown>;
  cellComponent(
    context: ResultsProjectionContext<R>,
    columnId?: string | undefined,
  ): null | Type<unknown>;
  private registeredComponent;
  componentInputs(context: unknown): Record<string, unknown>;
  cellTemplate(column?: ResultsProjectionColumn<R>): null | TemplateRef<unknown>;
  disabled(row?: R): boolean;
  selectionDisabled(row?: R): boolean;
  isSelected(row: R): boolean;
  label(row: R): string;
  value(row: R, column: ResultsProjectionColumn<R>): unknown;
  toggle(row: R): void;
  toggleAll(): void;
  keyDown(event: KeyboardEvent, row: R): void;
  private activateRow;
  rowClick(event: MouseEvent, row: R): void;
  agRowClicked(event: RowClickedEvent<R>): void;
  agCellKeyDown(event: { event?: Event | null; data?: R }): void;
  agBodyScrollEnd(event: BodyScrollEndEvent<R>): void;
  selectRow(event: Event, row: R): void;
  rowContext(
    row: R,
    index: number,
    column?: ResultsProjectionColumn<R>,
  ): ResultsProjectionContext<R>;
  hostContext(): ResultsProjectionHostContext<R>;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<ResultsProjectionComponent<any>, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    ResultsProjectionComponent<any>,
    'nx-results-projection',
    never,
    {
      rows: {
        alias: 'rows';
        required: true;
        isSignal: true;
      };
      selection: {
        alias: 'selection';
        required: false;
        isSignal: true;
      };
      mode: {
        alias: 'mode';
        required: false;
        isSignal: true;
      };
      virtualized: {
        alias: 'virtualized';
        required: false;
        isSignal: true;
      };
      remoteSort: {
        alias: 'remoteSort';
        required: false;
        isSignal: true;
      };
      columns: {
        alias: 'columns';
        required: false;
        isSignal: true;
      };
      rowActivation: {
        alias: 'rowActivation';
        required: false;
        isSignal: true;
      };
      rowActivationDisabled: {
        alias: 'rowActivationDisabled';
        required: false;
        isSignal: true;
      };
      columnLayoutEnabled: {
        alias: 'columnLayoutEnabled';
        required: false;
        isSignal: true;
      };
      columnChooser: {
        alias: 'columnChooser';
        required: false;
        isSignal: true;
      };
      readOnly: {
        alias: 'readOnly';
        required: false;
        isSignal: true;
      };
      selectionEnabled: {
        alias: 'selectionEnabled';
        required: false;
        isSignal: true;
      };
      loading: {
        alias: 'loading';
        required: false;
        isSignal: true;
      };
      pageScroll: {
        alias: 'pageScroll';
        required: false;
        isSignal: true;
      };
      tableHeaderHeight: {
        alias: 'tableHeaderHeight';
        required: false;
        isSignal: true;
      };
      tableRowHeight: {
        alias: 'tableRowHeight';
        required: false;
        isSignal: true;
      };
      selectionColumnWidth: {
        alias: 'selectionColumnWidth';
        required: false;
        isSignal: true;
      };
      scope: {
        alias: 'scope';
        required: false;
        isSignal: true;
      };
      hostId: {
        alias: 'hostId';
        required: false;
        isSignal: true;
      };
      searchId: {
        alias: 'searchId';
        required: false;
        isSignal: true;
      };
      components: {
        alias: 'components';
        required: false;
        isSignal: true;
      };
      contextEpoch: {
        alias: 'contextEpoch';
        required: false;
        isSignal: true;
      };
      rowDisabled: {
        alias: 'rowDisabled';
        required: false;
        isSignal: true;
      };
    },
    {
      sortChange: 'sortChange';
      rowActivated: 'rowActivated';
      columnLayoutChange: 'columnLayoutChange';
      columnChooserOpen: 'columnChooserOpen';
      selectionChange: 'selectionChange';
      loadMore: 'loadMore';
      action: 'action';
    },
    ['templates', 'hostTemplates'],
    never,
    true,
    never
  >;
}
interface ResultsQueryScope {
  readonly repository: string;
  readonly providerName: string;
  readonly queryParams: readonly string[];
  readonly namedParameters: Readonly<Record<string, string>>;
}
interface ResultsColumn {
  readonly field: string;
  readonly label: string;
  readonly labelKey?: string;
}
interface ResultsToolbarContext extends ResultsSelectionContext {
  readonly queryToken?: number;
  readonly routeToken?: number;
  readonly queryExclusions?: readonly string[];
  readonly loadedCount: number;
  readonly totalCount: number;
  readonly allSelected: boolean;
  readonly availableCommands: readonly string[];
  readonly workflows: readonly {
    name: string;
    title: string;
  }[];
  readonly execute: (command: string, argument?: string) => Promise<void>;
}
declare const RESULTS_ACTIONS_SLOT: _maretha_webui_sdk.SlotDefinition<ResultsToolbarContext>;
declare const RESULTS_SELECTION_ACTIONS_SLOT: _maretha_webui_sdk.SlotDefinition<ResultsToolbarContext>;
declare const COLLECTION_ACTIONS_SLOT: _maretha_webui_sdk.SlotDefinition<ResultsToolbarContext>;
interface DocumentCreateContext extends DocumentActionContext {
  readonly destinationPicker?: boolean;
  readonly busy?: boolean;
  readonly selectedFiles?: readonly File[];
  readonly removeSelectedFile?: (index: number) => void;
  readonly types: readonly {
    name: string;
    label: string;
    file: boolean;
    folder: boolean;
  }[];
  readonly create: (type: string, bulk?: boolean) => void;
  readonly importFiles: () => void;
  readonly importSelection?: (files: readonly File[]) => void;
  readonly open: () => void;
}
declare const DOCUMENT_CREATE_ACTIONS_SLOT: _maretha_webui_sdk.SlotDefinition<DocumentCreateContext>;
declare const CREATE_POPUP_ITEMS_SLOT: _maretha_webui_sdk.SlotDefinition<DocumentCreateContext>;
declare const CREATE_POPUP_PAGES_SLOT: _maretha_webui_sdk.SlotDefinition<DocumentCreateContext>;
interface ResultsSelectionContext extends DocumentActionContext {
  readonly selectedDocuments: readonly Readonly<Record<string, unknown>>[];
  readonly items?: readonly Readonly<Record<string, unknown>>[];
  readonly displayMode?: ResultsProjectionMode;
  readonly columns?: readonly ResultsColumn[];
  readonly queryScope?: ResultsQueryScope;
  readonly busy: boolean;
  readonly setBusy: (busy: boolean) => void;
  readonly refresh: (removedIds?: readonly string[]) => Promise<void>;
  readonly reportError: (message: string) => void;
}
declare const TRASH_RESULTS_SELECTION_ACTIONS_SLOT: _maretha_webui_sdk.SlotDefinition<ResultsSelectionContext>;
interface DocumentInfoBarContext extends DocumentActionContext {
  readonly loading: boolean;
  readonly searchActive: boolean;
}
declare const DOCUMENT_INFO_BAR_SLOT: _maretha_webui_sdk.SlotDefinition<DocumentInfoBarContext>;
interface PublishContext extends DocumentActionContext {
  readonly selectedDocuments?: readonly Readonly<Record<string, unknown>>[];
}
declare const PUBLISH_ITEMS_SLOT: _maretha_webui_sdk.SlotDefinition<PublishContext>;
declare const PUBLISH_PAGES_SLOT: _maretha_webui_sdk.SlotDefinition<PublishContext>;
interface AdministrationContext extends DocumentActionContext {
  readonly user: ApplicationUser | null;
  readonly features: {
    readonly retention: boolean;
  };
}
declare const ADMINISTRATION_MENU_SLOT: _maretha_webui_sdk.SlotDefinition<AdministrationContext>;
declare const ADMINISTRATION_PAGES_SLOT: _maretha_webui_sdk.SlotDefinition<AdministrationContext>;
interface DrawerContext extends ApplicationContext, DocumentActionContext {
  readonly user: ApplicationUser | null;
  readonly activeKey: null | string;
  readonly opened: boolean;
  readonly open: (key: string) => void;
  readonly close: () => void;
  readonly navigate: (path: string) => void;
  readonly recentDocuments: readonly any[];
  readonly collections: readonly any[];
  readonly clipboard: readonly any[];
  readonly tasks: Readonly<Record<string, readonly any[]>>;
  readonly taskCount: number;
  readonly clearHistory: () => void;
  readonly clearClipboard: () => void;
}
declare const DRAWER_ITEMS_SLOT: _maretha_webui_sdk.SlotDefinition<DrawerContext>;
declare const DRAWER_PAGES_SLOT: _maretha_webui_sdk.SlotDefinition<DrawerContext>;
declare class DrawerItemComponent {
  readonly context: _angular_core.InputSignal<DrawerContext>;
  readonly pageId: _angular_core.InputSignal<string>;
  readonly label: _angular_core.InputSignal<string>;
  readonly labelKey: _angular_core.InputSignal<string | undefined>;
  readonly icon: _angular_core.InputSignal<string>;
  readonly route: _angular_core.InputSignal<string | undefined>;
  readonly messages: WebUiMessages;
  activate(): void;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<DrawerItemComponent, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    DrawerItemComponent,
    'nx-drawer-item',
    never,
    {
      context: {
        alias: 'context';
        required: true;
        isSignal: true;
      };
      pageId: {
        alias: 'pageId';
        required: true;
        isSignal: true;
      };
      label: {
        alias: 'label';
        required: true;
        isSignal: true;
      };
      labelKey: {
        alias: 'labelKey';
        required: false;
        isSignal: true;
      };
      icon: {
        alias: 'icon';
        required: true;
        isSignal: true;
      };
      route: {
        alias: 'route';
        required: false;
        isSignal: true;
      };
    },
    {},
    never,
    never,
    true,
    never
  >;
}
declare class ContributionOutletComponent {
  readonly contribution: _angular_core.InputSignal<ResolvedContribution>;
  readonly context: _angular_core.InputSignal<unknown>;
  readonly diagnostic: _angular_core.WritableSignal<ExtensionDiagnostic | null>;
  private readonly outlet;
  private readonly tasks;
  private readonly rendered;
  private readonly definition;
  constructor();
  canDeactivate(departure: ViewDeparture): Promise<boolean>;
  hasPendingChanges(): boolean;
  private destroy;
  private fail;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<ContributionOutletComponent, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    ContributionOutletComponent,
    'nx-contribution-outlet',
    never,
    {
      contribution: {
        alias: 'contribution';
        required: true;
        isSignal: true;
      };
      context: {
        alias: 'context';
        required: false;
        isSignal: true;
      };
    },
    {},
    never,
    never,
    true,
    never
  >;
}
declare const ANALYTICS_ITEMS_SLOT: _maretha_webui_sdk.SlotDefinition<_maretha_webui_sdk.AdministrationContext>;
declare const ANALYTICS_PAGES_SLOT: _maretha_webui_sdk.SlotDefinition<_maretha_webui_sdk.AdministrationContext>;
interface PageContext extends ApplicationContext, DocumentActionContext {
  readonly user: ApplicationUser | null;
  readonly pageId: string;
  readonly params: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
}
declare const PAGES_SLOT: _maretha_webui_sdk.SlotDefinition<PageContext>;
declare function definePage(
  definition: ContributionDefinition<PageContext> & {
    pageId: string;
  },
): _maretha_webui_sdk.ContributionRegistration;
declare class WebUiPageComponent {
  readonly context: _angular_core.InputSignal<PageContext>;
  private readonly registry;
  private readonly outlet;
  readonly resolution: _angular_core.Signal<_maretha_webui_sdk.SlotResolution>;
  readonly page: _angular_core.Signal<_maretha_webui_sdk.ResolvedContribution | null>;
  constructor();
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<WebUiPageComponent, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    WebUiPageComponent,
    'nx-webui-page',
    never,
    {
      context: {
        alias: 'context';
        required: true;
        isSignal: true;
      };
    },
    {},
    never,
    never,
    true,
    never
  >;
}
interface BlobActionContext extends DocumentActionContext {
  readonly blob: Readonly<Record<string, unknown>>;
  readonly xpath: string;
  readonly draft: boolean;
  readonly allowedMimeTypes: readonly string[];
  readonly download?: () => void;
  readonly replace?: (file: File) => void;
  readonly remove?: () => void;
}
declare const BLOB_ACTIONS_SLOT: _maretha_webui_sdk.SlotDefinition<BlobActionContext>;
interface FileUploadContext {
  readonly disabled: boolean;
  readonly multiple: boolean;
  readonly allowedMimeTypes: readonly string[];
  readonly label: string;
  readonly className?: string;
  readonly placeholder?: null | TemplateRef<unknown>;
  readonly chooseFiles: () => void;
  readonly user?: ApplicationUser | null;
  readonly addFiles?: (files: readonly File[]) => void;
}
declare const FILE_UPLOAD_ACTIONS_SLOT: _maretha_webui_sdk.SlotDefinition<FileUploadContext>;
declare class ChooseFilesActionComponent {
  readonly context: _angular_core.InputSignal<FileUploadContext>;
  readonly messages: WebUiMessages;
  choose(): void;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<ChooseFilesActionComponent, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    ChooseFilesActionComponent,
    'nx-choose-files-action',
    never,
    {
      context: {
        alias: 'context';
        required: true;
        isSignal: true;
      };
    },
    {},
    never,
    never,
    true,
    never
  >;
}
interface ShellActionContext extends ApplicationContext {
  readonly navigate: (url: string) => Promise<boolean>;
}
interface QuickSearchContext extends ShellActionContext {
  readonly searchTerm: string;
  readonly close: () => void;
}
declare const SHELL_ACTIONS_SLOT: _maretha_webui_sdk.SlotDefinition<ShellActionContext>;
declare const QUICK_SEARCH_ACTIONS_SLOT: _maretha_webui_sdk.SlotDefinition<QuickSearchContext>;
declare class QuickSearchCommandComponent {
  readonly context: _angular_core.InputSignal<QuickSearchContext>;
  readonly label: _angular_core.InputSignal<string>;
  readonly icon: _angular_core.InputSignal<string>;
  readonly run: _angular_core.InputSignal<
    (context: QuickSearchContext) => boolean | Promise<boolean | void> | void
  >;
  readonly busy: _angular_core.WritableSignal<boolean>;
  readonly focused: _angular_core.WritableSignal<boolean>;
  readonly error: _maretha_webui_sdk.LocalizedState<''>;
  execute(): Promise<void>;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<QuickSearchCommandComponent, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    QuickSearchCommandComponent,
    'nx-quick-search-command',
    never,
    {
      context: {
        alias: 'context';
        required: true;
        isSignal: true;
      };
      label: {
        alias: 'label';
        required: true;
        isSignal: true;
      };
      icon: {
        alias: 'icon';
        required: false;
        isSignal: true;
      };
      run: {
        alias: 'run';
        required: true;
        isSignal: true;
      };
    },
    {},
    never,
    never,
    true,
    never
  >;
}
type ComparisonValueKind =
  | 'blob'
  | 'date'
  | 'default'
  | 'directoryEntry'
  | 'directoryEntry[]'
  | 'document'
  | 'document[]'
  | 'user'
  | 'user[]';
interface ComparisonValueContext {
  readonly property: string;
  readonly label: string;
  readonly kind: ComparisonValueKind;
  readonly value: unknown;
  readonly baseline: unknown;
  readonly changed: boolean;
  readonly missing: boolean;
  readonly document: Readonly<Record<string, unknown>>;
}
interface ComparisonLayout {
  readonly id: string;
  readonly component: Type<unknown>;
  readonly property?: string;
  readonly type?: ComparisonValueKind;
}
declare const COMPARISON_LAYOUTS: InjectionToken<readonly ComparisonLayout[]>;
declare function provideComparisonLayout(layout: ComparisonLayout): Provider;
declare function resolveComparisonLayout(
  layouts: readonly ComparisonLayout[],
  property: string,
  kind: ComparisonValueKind,
): ComparisonLayout | undefined;
interface ProjectionContext<T = unknown, H = unknown> {
  readonly $implicit: T;
  readonly host: H;
}
interface ActionsMenuContext<T> extends ProjectionContext<T, NuxeoActionsMenuComponent<T>> {
  readonly close: () => void;
  readonly isCurrentScope: () => boolean;
}
interface TreeNodeContext<T> extends ProjectionContext<T, NuxeoTreeNodeComponent<T>> {
  readonly item: T;
  readonly depth: number;
  readonly opened: boolean;
  readonly isLeaf: boolean;
  readonly toggle: () => void;
  readonly select: () => void;
}
type BulkUpdateMode = 'addValues' | 'keep' | 'remove' | 'replace';
declare class NuxeoPageComponent<T = unknown> {
  readonly value: _angular_core.InputSignal<T>;
  readonly header: _angular_core.Signal<
    TemplateRef<ProjectionContext<T, NuxeoPageComponent<T>>> | undefined
  >;
  readonly tabs: _angular_core.Signal<
    TemplateRef<ProjectionContext<T, NuxeoPageComponent<T>>> | undefined
  >;
  readonly body: _angular_core.Signal<
    TemplateRef<ProjectionContext<T, NuxeoPageComponent<T>>> | undefined
  >;
  context: () => ProjectionContext<T, NuxeoPageComponent<T>>;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<NuxeoPageComponent<any>, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    NuxeoPageComponent<any>,
    'nx-page',
    never,
    {
      value: {
        alias: 'value';
        required: false;
        isSignal: true;
      };
    },
    {},
    ['header', 'tabs', 'body'],
    never,
    true,
    never
  >;
}
declare class NuxeoCardComponent<T = unknown> {
  readonly heading: _angular_core.InputSignal<string>;
  readonly collapsible: _angular_core.InputSignalWithTransform<boolean, unknown>;
  readonly opened: _angular_core.ModelSignal<boolean>;
  readonly content: _angular_core.Signal<
    TemplateRef<ProjectionContext<T, NuxeoCardComponent<T>>> | undefined
  >;
  readonly value: _angular_core.InputSignal<T>;
  context: () => ProjectionContext<T, NuxeoCardComponent<T>>;
  toggle(): void;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<NuxeoCardComponent<any>, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    NuxeoCardComponent<any>,
    'nx-card',
    never,
    {
      heading: {
        alias: 'heading';
        required: false;
        isSignal: true;
      };
      collapsible: {
        alias: 'collapsible';
        required: false;
        isSignal: true;
      };
      opened: {
        alias: 'opened';
        required: false;
        isSignal: true;
      };
      value: {
        alias: 'value';
        required: false;
        isSignal: true;
      };
    },
    {
      opened: 'openedChange';
    },
    ['content'],
    never,
    true,
    never
  >;
}
declare class NuxeoDialogComponent<T = unknown> implements OnChanges {
  private readonly messages;
  private labelProvided;
  ngOnChanges(changes: SimpleChanges): void;
  effectiveLabel(): string;
  readonly label: _angular_core.InputSignal<string>;
  readonly value: _angular_core.InputSignal<T>;
  readonly content: _angular_core.Signal<
    TemplateRef<ProjectionContext<T, NuxeoDialogComponent<T>>> | undefined
  >;
  readonly dialog: _angular_core.Signal<ElementRef<HTMLDialogElement>>;
  readonly closed: _angular_core.OutputEmitterRef<void>;
  context: () => ProjectionContext<T, NuxeoDialogComponent<T>>;
  open(): void;
  close(): void;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<NuxeoDialogComponent<any>, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    NuxeoDialogComponent<any>,
    'nx-dialog',
    never,
    {
      label: {
        alias: 'label';
        required: false;
        isSignal: true;
      };
      value: {
        alias: 'value';
        required: false;
        isSignal: true;
      };
    },
    {
      closed: 'closed';
    },
    ['content'],
    never,
    true,
    never
  >;
}
declare class NuxeoConfirmButtonComponent<T = unknown> implements OnChanges {
  private readonly messages;
  private readonly providedLabels;
  effectiveTitle(): string;
  effectiveConfirm(): string;
  effectiveDismiss(): string;
  readonly value: _angular_core.InputSignal<T>;
  readonly scope: _angular_core.InputSignal<unknown>;
  readonly dialogTitle: _angular_core.InputSignal<string>;
  readonly dialogConfirm: _angular_core.InputSignal<string>;
  readonly dialogDismiss: _angular_core.InputSignal<string>;
  readonly disabled: _angular_core.InputSignalWithTransform<boolean, unknown>;
  readonly busy: _angular_core.InputSignalWithTransform<boolean, unknown>;
  readonly trigger: _angular_core.Signal<
    TemplateRef<ProjectionContext<T, NuxeoConfirmButtonComponent<T>>> | undefined
  >;
  readonly dialog: _angular_core.Signal<NuxeoDialogComponent<T>>;
  readonly confirm: _angular_core.OutputEmitterRef<T>;
  readonly dismiss: _angular_core.OutputEmitterRef<T>;
  private scopeVersion;
  private target;
  private confirming;
  context: () => ProjectionContext<T, NuxeoConfirmButtonComponent<T>>;
  ngOnChanges(changes: SimpleChanges): void;
  openDialog(): void;
  confirmDialog(): void;
  onClosed(): void;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<NuxeoConfirmButtonComponent<any>, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    NuxeoConfirmButtonComponent<any>,
    'nx-confirm-button',
    never,
    {
      value: {
        alias: 'value';
        required: false;
        isSignal: true;
      };
      scope: {
        alias: 'scope';
        required: false;
        isSignal: true;
      };
      dialogTitle: {
        alias: 'dialogTitle';
        required: false;
        isSignal: true;
      };
      dialogConfirm: {
        alias: 'dialogConfirm';
        required: false;
        isSignal: true;
      };
      dialogDismiss: {
        alias: 'dialogDismiss';
        required: false;
        isSignal: true;
      };
      disabled: {
        alias: 'disabled';
        required: false;
        isSignal: true;
      };
      busy: {
        alias: 'busy';
        required: false;
        isSignal: true;
      };
    },
    {
      confirm: 'confirm';
      dismiss: 'dismiss';
    },
    ['trigger'],
    never,
    true,
    never
  >;
}
declare class NuxeoPopupConfirmComponent<T = unknown> implements OnChanges {
  private readonly messages;
  private messageProvided;
  ngOnChanges(changes: SimpleChanges): void;
  effectiveMessage(): string;
  readonly value: _angular_core.InputSignal<T>;
  readonly scope: _angular_core.InputSignal<unknown>;
  readonly message: _angular_core.InputSignal<string>;
  readonly disabled: _angular_core.InputSignalWithTransform<boolean, unknown>;
  readonly busy: _angular_core.InputSignalWithTransform<boolean, unknown>;
  readonly projectedTrigger: _angular_core.Signal<
    TemplateRef<ProjectionContext<T, NuxeoPopupConfirmComponent<T>>> | undefined
  >;
  readonly confirmed: _angular_core.OutputEmitterRef<T>;
  readonly dismissed: _angular_core.OutputEmitterRef<T>;
  context: () => ProjectionContext<T, NuxeoPopupConfirmComponent<T>>;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<NuxeoPopupConfirmComponent<any>, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    NuxeoPopupConfirmComponent<any>,
    'nx-popup-confirm',
    never,
    {
      value: {
        alias: 'value';
        required: false;
        isSignal: true;
      };
      scope: {
        alias: 'scope';
        required: false;
        isSignal: true;
      };
      message: {
        alias: 'message';
        required: false;
        isSignal: true;
      };
      disabled: {
        alias: 'disabled';
        required: false;
        isSignal: true;
      };
      busy: {
        alias: 'busy';
        required: false;
        isSignal: true;
      };
    },
    {
      confirmed: 'confirm';
      dismissed: 'dismiss';
    },
    ['projectedTrigger'],
    never,
    true,
    never
  >;
}
declare class NuxeoSelectComponent<T extends string = string> {
  readonly label: _angular_core.InputSignal<string>;
  readonly value: _angular_core.ModelSignal<T>;
  readonly disabled: _angular_core.InputSignalWithTransform<boolean, unknown>;
  readonly required: _angular_core.InputSignalWithTransform<boolean, unknown>;
  readonly options: _angular_core.Signal<
    TemplateRef<ProjectionContext<T, NuxeoSelectComponent<T>>> | undefined
  >;
  readonly changed: _angular_core.OutputEmitterRef<T>;
  context: () => ProjectionContext<T, NuxeoSelectComponent<T>>;
  change(value: T): boolean;
  validate(): boolean;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<NuxeoSelectComponent<any>, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    NuxeoSelectComponent<any>,
    'nx-select',
    never,
    {
      label: {
        alias: 'label';
        required: false;
        isSignal: true;
      };
      value: {
        alias: 'value';
        required: false;
        isSignal: true;
      };
      disabled: {
        alias: 'disabled';
        required: false;
        isSignal: true;
      };
      required: {
        alias: 'required';
        required: false;
        isSignal: true;
      };
    },
    {
      value: 'valueChange';
      changed: 'changed';
    },
    ['options'],
    never,
    true,
    never
  >;
}
declare class NuxeoTagComponent<T = unknown> {
  readonly value: _angular_core.InputSignal<T>;
  readonly content: _angular_core.Signal<
    TemplateRef<ProjectionContext<T, NuxeoTagComponent<T>>> | undefined
  >;
  context: () => ProjectionContext<T, NuxeoTagComponent<T>>;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<NuxeoTagComponent<any>, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    NuxeoTagComponent<any>,
    'nx-tag',
    never,
    {
      value: {
        alias: 'value';
        required: false;
        isSignal: true;
      };
    },
    {},
    ['content'],
    never,
    true,
    never
  >;
}
declare class NuxeoTooltipComponent<T = unknown> {
  private describedTarget?;
  private descriptionAdded;
  private hovered;
  constructor();
  private removeDescription;
  readonly value: _angular_core.InputSignal<T>;
  readonly trigger: _angular_core.Signal<
    TemplateRef<ProjectionContext<T, NuxeoTooltipComponent<T>>> | undefined
  >;
  readonly content: _angular_core.Signal<
    TemplateRef<ProjectionContext<T, NuxeoTooltipComponent<T>>> | undefined
  >;
  readonly anchor: _angular_core.Signal<ElementRef<HTMLElement>>;
  readonly visible: _angular_core.ModelSignal<boolean>;
  readonly id: string;
  context: () => ProjectionContext<T, NuxeoTooltipComponent<T>>;
  show(): void;
  hide(): void;
  onPointerEnter(): void;
  onPointerLeave(): void;
  onFocusIn(event: FocusEvent): void;
  onFocusOut(event: FocusEvent): void;
  onKeydown(event: KeyboardEvent): void;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<NuxeoTooltipComponent<any>, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    NuxeoTooltipComponent<any>,
    'nx-tooltip',
    never,
    {
      value: {
        alias: 'value';
        required: false;
        isSignal: true;
      };
      visible: {
        alias: 'visible';
        required: false;
        isSignal: true;
      };
    },
    {
      visible: 'visibleChange';
    },
    ['trigger', 'content'],
    never,
    true,
    never
  >;
}
declare class NuxeoActionsMenuComponent<T = unknown> implements OnChanges {
  private readonly messages;
  protected readonly accessibleLabel: _angular_core.Signal<string>;
  readonly label: _angular_core.InputSignal<string>;
  readonly value: _angular_core.InputSignal<T>;
  readonly scope: _angular_core.InputSignal<unknown>;
  readonly disabled: _angular_core.InputSignalWithTransform<boolean, unknown>;
  readonly open: _angular_core.ModelSignal<boolean>;
  readonly content: _angular_core.Signal<TemplateRef<ActionsMenuContext<T>> | undefined>;
  readonly dropdown: _angular_core.Signal<TemplateRef<ActionsMenuContext<T>> | undefined>;
  readonly trigger: _angular_core.Signal<ElementRef<HTMLButtonElement> | undefined>;
  readonly menu: _angular_core.Signal<ElementRef<HTMLElement> | undefined>;
  private readonly element;
  private readonly destroyRef;
  private readonly injector;
  private focusVersion;
  private scopeVersion;
  constructor();
  readonly menuId: string;
  ngOnChanges(changes: SimpleChanges): void;
  context: () => ActionsMenuContext<T>;
  toggle(): void;
  openMenu(focus?: 'first' | 'last' | null): void;
  close(returnFocus?: boolean): void;
  onTriggerKeydown(event: KeyboardEvent): void;
  onMenuKeydown(event: KeyboardEvent): void;
  onDocumentPointerDown(event: PointerEvent): void;
  private prepareMenuItems;
  private menuItems;
  private focusMenuItem;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<NuxeoActionsMenuComponent<any>, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    NuxeoActionsMenuComponent<any>,
    'nx-actions-menu',
    never,
    {
      label: {
        alias: 'label';
        required: false;
        isSignal: true;
      };
      value: {
        alias: 'value';
        required: false;
        isSignal: true;
      };
      scope: {
        alias: 'scope';
        required: false;
        isSignal: true;
      };
      disabled: {
        alias: 'disabled';
        required: false;
        isSignal: true;
      };
      open: {
        alias: 'open';
        required: false;
        isSignal: true;
      };
    },
    {
      open: 'openChange';
    },
    ['content', 'dropdown'],
    never,
    true,
    never
  >;
}
declare class NuxeoTreeNodeComponent<T = unknown> {
  private readonly locale;
  protected readonly labelId: string;
  readonly item: _angular_core.InputSignal<T>;
  readonly scope: _angular_core.InputSignal<unknown>;
  readonly depth: _angular_core.InputSignal<number>;
  readonly isLeaf: _angular_core.InputSignalWithTransform<boolean, unknown>;
  readonly opened: _angular_core.ModelSignal<boolean>;
  readonly selectedItem: _angular_core.ModelSignal<null | T>;
  readonly content: _angular_core.Signal<TemplateRef<TreeNodeContext<T>> | undefined>;
  readonly selected: _angular_core.OutputEmitterRef<T>;
  toggle(): void;
  select(): void;
  isSelected(): boolean;
  protected onToggle(event: MouseEvent): void;
  onNodeClick(event: MouseEvent): void;
  onKeydown(event: KeyboardEvent): void;
  context: () => TreeNodeContext<T>;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<NuxeoTreeNodeComponent<any>, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    NuxeoTreeNodeComponent<any>,
    'nx-tree-node',
    never,
    {
      item: {
        alias: 'item';
        required: true;
        isSignal: true;
      };
      scope: {
        alias: 'scope';
        required: false;
        isSignal: true;
      };
      depth: {
        alias: 'depth';
        required: false;
        isSignal: true;
      };
      isLeaf: {
        alias: 'isLeaf';
        required: false;
        isSignal: true;
      };
      opened: {
        alias: 'opened';
        required: false;
        isSignal: true;
      };
      selectedItem: {
        alias: 'selectedItem';
        required: false;
        isSignal: true;
      };
    },
    {
      opened: 'openedChange';
      selectedItem: 'selectedItemChange';
      selected: 'selected';
    },
    ['content'],
    ['*'],
    true,
    never
  >;
}
declare class NuxeoTreeComponent {
  readonly label: _angular_core.InputSignal<string>;
  protected readonly messages: WebUiMessages;
  private readonly locale;
  private readonly element;
  private current;
  private ancestors;
  private previousItems;
  private ownedFocus;
  private search;
  private searchedAt;
  constructor();
  private tree;
  private items;
  private parents;
  private reconcile;
  protected onFocus(event: FocusEvent): void;
  protected onBlur(event: FocusEvent): void;
  protected onKeydown(event: KeyboardEvent): void;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<NuxeoTreeComponent, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    NuxeoTreeComponent,
    'nx-tree',
    never,
    {
      label: {
        alias: 'label';
        required: false;
        isSignal: true;
      };
    },
    {},
    never,
    ['*'],
    true,
    never
  >;
}
declare class NuxeoBulkWidgetComponent<T = unknown> {
  private readonly messages;
  readonly label: _angular_core.InputSignal<string>;
  readonly value: _angular_core.InputSignal<T>;
  readonly required: _angular_core.InputSignalWithTransform<boolean, unknown>;
  readonly multivalued: _angular_core.InputSignalWithTransform<boolean, unknown>;
  readonly mode: _angular_core.ModelSignal<BulkUpdateMode>;
  readonly message: _angular_core.InputSignal<string>;
  readonly error: _angular_core.InputSignalWithTransform<boolean, unknown>;
  readonly content: _angular_core.Signal<
    TemplateRef<ProjectionContext<T, NuxeoBulkWidgetComponent<T>>> | undefined
  >;
  readonly modeChanged: _angular_core.OutputEmitterRef<BulkUpdateMode>;
  context: () => ProjectionContext<T, NuxeoBulkWidgetComponent<T>>;
  isModeAllowed(mode: string): mode is BulkUpdateMode;
  setMode(mode: string): boolean;
  validate(): boolean;
  effectiveMessage(): string;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<NuxeoBulkWidgetComponent<any>, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    NuxeoBulkWidgetComponent<any>,
    'nx-bulk-widget',
    never,
    {
      label: {
        alias: 'label';
        required: false;
        isSignal: true;
      };
      value: {
        alias: 'value';
        required: false;
        isSignal: true;
      };
      required: {
        alias: 'required';
        required: false;
        isSignal: true;
      };
      multivalued: {
        alias: 'multivalued';
        required: false;
        isSignal: true;
      };
      mode: {
        alias: 'mode';
        required: false;
        isSignal: true;
      };
      message: {
        alias: 'message';
        required: false;
        isSignal: true;
      };
      error: {
        alias: 'error';
        required: false;
        isSignal: true;
      };
    },
    {
      mode: 'modeChange';
      modeChanged: 'modeChanged';
    },
    ['content'],
    never,
    true,
    never
  >;
}
declare class NuxeoVersionsListComponent<T = unknown> {
  readonly value: _angular_core.InputSignal<T>;
  readonly items: _angular_core.Signal<
    TemplateRef<ProjectionContext<T, NuxeoVersionsListComponent<T>>> | undefined
  >;
  readonly actions: _angular_core.Signal<
    TemplateRef<ProjectionContext<T, NuxeoVersionsListComponent<T>>> | undefined
  >;
  context: () => ProjectionContext<T, NuxeoVersionsListComponent<T>>;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<NuxeoVersionsListComponent<any>, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    NuxeoVersionsListComponent<any>,
    'nx-versions-list',
    never,
    {
      value: {
        alias: 'value';
        required: false;
        isSignal: true;
      };
    },
    {},
    ['items', 'actions'],
    never,
    true,
    never
  >;
}
declare class NuxeoAclTableComponent<T = unknown> {
  readonly value: _angular_core.InputSignal<T>;
  readonly empty: _angular_core.InputSignalWithTransform<boolean, unknown>;
  readonly emptyResult: _angular_core.Signal<
    TemplateRef<ProjectionContext<T, NuxeoAclTableComponent<T>>> | undefined
  >;
  context: () => ProjectionContext<T, NuxeoAclTableComponent<T>>;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<NuxeoAclTableComponent<any>, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    NuxeoAclTableComponent<any>,
    'nx-acl-table',
    never,
    {
      value: {
        alias: 'value';
        required: false;
        isSignal: true;
      };
      empty: {
        alias: 'empty';
        required: false;
        isSignal: true;
      };
    },
    {},
    ['emptyResult'],
    ['*'],
    true,
    never
  >;
}
interface BulkFieldChange {
  readonly property: string;
  readonly mode: BulkUpdateMode;
  readonly value?: unknown;
  readonly required?: boolean;
}
declare const bulkValidationMessages: {
  readonly 'unsupported-mode': 'Unsupported bulk mode: {mode}';
  readonly 'clear-required': 'Cannot clear required property: {property}';
  readonly 'add-scalar': 'Cannot add values to scalar property: {property}';
  readonly 'add-values-list': 'Use a list value for addValues: {property}';
};
declare class BulkValidationError extends Error {
  readonly code: keyof typeof bulkValidationMessages;
  readonly parameters: Readonly<Record<string, string>>;
  readonly messageKey: string;
  readonly fallback: string;
  constructor(
    code: keyof typeof bulkValidationMessages,
    parameters: Readonly<Record<string, string>>,
  );
}
interface BulkLayoutContext {
  readonly documents: readonly Readonly<Record<string, unknown>>[];
  readonly changes: readonly BulkFieldChange[];
  readonly commit: (changes: readonly BulkFieldChange[]) => void;
}
interface BulkLayoutComponent {
  context: BulkLayoutContext;
}
interface BulkLayoutRegistration {
  readonly name: string;
  readonly component: Type<BulkLayoutComponent>;
}
declare const BULK_LAYOUTS: InjectionToken<readonly BulkLayoutRegistration[]>;
declare function provideBulkLayouts(...layouts: BulkLayoutRegistration[]): Provider[];
declare class BulkLayoutResolver {
  private readonly layouts;
  resolve(name?: string): BulkLayoutRegistration | undefined;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<BulkLayoutResolver, never>;
  static ɵprov: _angular_core.ɵɵInjectableDeclaration<BulkLayoutResolver>;
}
declare function buildBulkDocumentChanges(
  documents: readonly Readonly<Record<string, any>>[],
  changes: readonly BulkFieldChange[],
): {
  uid: any;
  changeToken: any;
  properties: Record<string, unknown>;
}[];
declare class DefaultBulkLayoutComponent {
  private readonly messages;
  context: BulkLayoutContext;
  options: Record<
    string,
    readonly {
      id: string;
      label: string;
    }[]
  >;
  fields: {
    property: string;
    label: string;
    labelKey?: string;
    multiple: boolean;
    date: boolean;
    mode: BulkUpdateMode;
    value: string | string[];
  }[];
  mode(field: (typeof this.fields)[number], mode: BulkUpdateMode): void;
  value(field: (typeof this.fields)[number], value: string | string[]): void;
  fieldError(field: (typeof this.fields)[number]): string;
  fieldLabel(field: (typeof this.fields)[number]): string;
  private emit;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<DefaultBulkLayoutComponent, never>;
  static ɵcmp: _angular_core.ɵɵComponentDeclaration<
    DefaultBulkLayoutComponent,
    'nx-default-bulk-layout',
    never,
    {
      context: {
        alias: 'context';
        required: true;
      };
      options: {
        alias: 'options';
        required: false;
      };
    },
    {},
    never,
    never,
    true,
    never
  >;
}
interface ResultsPagingOptions {
  readonly scrollPagingEnabled?: boolean;
}
declare const RESULTS_PAGING_OPTIONS: InjectionToken<ResultsPagingOptions>;
declare class ResultsPagingSettings {
  private readonly enabled;
  readonly scrollPagingEnabled: _angular_core.Signal<boolean>;
  apply(options?: null | ResultsPagingOptions): void;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<ResultsPagingSettings, never>;
  static ɵprov: _angular_core.ɵɵInjectableDeclaration<ResultsPagingSettings>;
}
type SuggestionWidget = 'directory' | 'document' | 'tag' | 'user';
interface SuggestionLimitsConfig {
  readonly minChars?: number;
  readonly pauseMs?: number;
}
interface SuggestionRules extends SuggestionLimitsConfig {
  readonly widgets?: Readonly<Partial<Record<SuggestionWidget, SuggestionLimitsConfig>>>;
  readonly fields?: Readonly<Record<string, SuggestionLimitsConfig>>;
}
interface SuggestionConfig extends SuggestionRules {
  readonly layouts?: Readonly<Record<string, SuggestionRules>>;
}
interface SuggestionLimits {
  readonly minChars: number;
  readonly pauseMs: number;
}
interface SuggestionTarget {
  readonly widget: SuggestionWidget;
  readonly layout?: null | string;
  readonly field?: null | string;
}
declare const DEFAULT_SUGGESTION_CONFIG: SuggestionConfig;
declare const SUGGESTION_OPTIONS: InjectionToken<SuggestionConfig>;
declare class SuggestionSettings {
  private readonly config;
  readonly current: Signal<SuggestionConfig>;
  apply(config: unknown): boolean;
  resolve(target: SuggestionTarget): SuggestionLimits;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<SuggestionSettings, never>;
  static ɵprov: _angular_core.ɵɵInjectableDeclaration<SuggestionSettings>;
}
declare class SuggestionScope {
  readonly layout: _angular_core.WritableSignal<null | string>;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<SuggestionScope, never>;
  static ɵprov: _angular_core.ɵɵInjectableDeclaration<SuggestionScope>;
}
declare function provideSuggestionScope(layout?: null | string): StaticProvider;
declare function suggestionLimits(
  widget: (() => SuggestionWidget) | SuggestionWidget,
  field?: () => null | string | undefined,
): Signal<SuggestionLimits>;
declare function suggestionTerms(
  limits: () => SuggestionLimits,
): OperatorFunction<null | string | undefined, null | string>;
declare function suggestionMinCharsText(messages: WebUiMessages, minChars: number): string;
declare function normalizeSuggestionConfig(value: unknown): null | SuggestionConfig;
interface ResultsProjectionDefinition {
  readonly id: string;
  readonly hostId?: string;
  readonly searchId?: string;
  readonly projection: ResultsProjectionTemplateName;
  readonly mode?: ResultsProjectionMode;
  readonly component: Type<unknown>;
  readonly priority?: number;
  readonly disabled?: boolean;
  readonly when?: (context: unknown) => boolean;
}
declare class ResultsProjectionRegistry {
  private readonly definitions;
  private order;
  register(definition: ResultsProjectionDefinition): () => void;
  resolve(
    hostId: string,
    projection: ResultsProjectionTemplateName,
    mode: ResultsProjectionMode,
    context: unknown,
    searchId?: string,
  ): null | Type<unknown>;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<ResultsProjectionRegistry, never>;
  static ɵprov: _angular_core.ɵɵInjectableDeclaration<ResultsProjectionRegistry>;
}
declare function provideResultsProjections(
  ...definitions: readonly ResultsProjectionDefinition[]
): EnvironmentProviders;
type DocumentProjectionName = 'acl.emptyResult' | 'versions.actions' | 'versions.items';
interface DocumentProjectionContext {
  readonly document: null | Readonly<Record<string, unknown>>;
  readonly noEdit: boolean;
  readonly value?: unknown;
}
interface DocumentProjection {
  readonly id: string;
  readonly name: DocumentProjectionName;
  readonly component?: Type<unknown>;
  readonly disabled?: boolean;
  readonly priority?: number;
  readonly when?: (context: DocumentProjectionContext) => boolean;
}
interface ResolvedDocumentProjection {
  readonly component?: Type<unknown>;
  readonly disabled: boolean;
}
declare function documentProjectionContext(
  context: DocumentProjectionContext,
): DocumentProjectionContext;
declare class DocumentProjectionRegistry {
  private readonly entries;
  private readonly revisionState;
  readonly revision: _angular_core.Signal<number>;
  register(entry: DocumentProjection): () => void;
  resolve(
    name: DocumentProjectionName,
    raw: DocumentProjectionContext,
  ): ResolvedDocumentProjection | undefined;
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<DocumentProjectionRegistry, never>;
  static ɵprov: _angular_core.ɵɵInjectableDeclaration<DocumentProjectionRegistry>;
}
interface DocumentFieldExtension {
  readonly id: string;
  readonly documentTypes?: readonly string[];
  readonly modes?: readonly DocumentLayoutMode[];
  readonly schema: string;
  readonly fields: readonly LayoutField[];
}
declare function provideDocumentFieldExtensions(
  ...definitions: DocumentFieldExtension[]
): EnvironmentProviders;
declare class DocumentFieldExtensionRegistry {
  private readonly definitions;
  candidates(context: DocumentLayoutContext): readonly DocumentFieldExtension[];
  attached(context: DocumentLayoutContext): readonly DocumentFieldExtension[];
  fields(context: DocumentLayoutContext): readonly LayoutField[];
  static ɵfac: _angular_core.ɵɵFactoryDeclaration<DocumentFieldExtensionRegistry, never>;
  static ɵprov: _angular_core.ɵɵInjectableDeclaration<DocumentFieldExtensionRegistry>;
}
declare const DOCUMENT_CONTENT_RENDERER: InjectionToken<Type<unknown>>;
interface ResultsCommandGateway {
  available(context: ResultsSelectionContext): readonly string[];
  execute(
    command: string,
    context: ResultsToolbarContext,
    current: () => boolean,
  ): Promise<readonly string[]>;
}
declare const RESULTS_COMMAND_GATEWAY: InjectionToken<ResultsCommandGateway>;
interface SavedSearchDefinition {
  readonly id: string;
  readonly title: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly query?: string;
}
interface SavedSearchGateway {
  list(providerName: string): Promise<readonly SavedSearchDefinition[]>;
  save(
    providerName: string,
    title: string,
    params: Readonly<Record<string, unknown>>,
  ): Promise<SavedSearchDefinition>;
  update(
    id: string,
    providerName: string,
    title: string,
    params: Readonly<Record<string, unknown>>,
  ): Promise<SavedSearchDefinition>;
  remove(id: string): Promise<void>;
  permissions(id: string): Promise<readonly string[]>;
  share(id: string, principal: string, notify?: boolean): Promise<void>;
}
declare const SAVED_SEARCH_GATEWAY: InjectionToken<SavedSearchGateway>;
export {
  ADMINISTRATION_MENU_SLOT,
  ADMINISTRATION_PAGES_SLOT,
  ANALYTICS_ITEMS_SLOT,
  ANALYTICS_PAGES_SLOT,
  AgGridProjectionActionsComponent,
  AgGridProjectionCellComponent,
  AgGridProjectionCheckboxComponent,
  AgGridProjectionColumnSettingsComponent,
  AgGridProjectionFullWidthComponent,
  AgGridProjectionSelectAllComponent,
  BLOB_ACTIONS_SLOT,
  BULK_LAYOUTS,
  BulkLayoutResolver,
  BulkValidationError,
  COLLECTION_ACTIONS_SLOT,
  COMPARISON_LAYOUTS,
  CREATE_POPUP_ITEMS_SLOT,
  CREATE_POPUP_PAGES_SLOT,
  ChooseFilesActionComponent,
  ContributionOutletComponent,
  DEFAULT_SUGGESTION_CONFIG,
  DIRECTORY_LAYOUTS,
  DOCUMENT_ACTIONS_SLOT,
  DOCUMENT_CONTENT_RENDERER,
  DOCUMENT_CREATE_ACTIONS_SLOT,
  DOCUMENT_IMPORT_DRAFT,
  DOCUMENT_INFO_BAR_SLOT,
  DOCUMENT_LAYOUT_GATEWAY,
  DOCUMENT_LAYOUT_HOST,
  DOCUMENT_LAYOUT_WIDGETS,
  DOCUMENT_VIEWS_ITEMS_SLOT,
  DOCUMENT_VIEWS_PAGES_SLOT,
  DRAWER_ITEMS_SLOT,
  DRAWER_PAGES_SLOT,
  DefaultBulkLayoutComponent,
  DocumentFieldExtensionRegistry,
  DocumentLayoutRegistry,
  DocumentProjectionRegistry,
  DocumentViewTabComponent,
  DocumentViewsComponent,
  DrawerItemComponent,
  ExtensionRegistry,
  FILE_UPLOAD_ACTIONS_SLOT,
  LocalizedUiError,
  NUXEO_FILTERS,
  NUXEO_ICONS,
  NuxeoAclTableComponent,
  NuxeoActionsMenuComponent,
  NuxeoBulkWidgetComponent,
  NuxeoCardComponent,
  NuxeoConfirmButtonComponent,
  NuxeoDialogComponent,
  NuxeoPageComponent,
  NuxeoPopupConfirmComponent,
  NuxeoSelectComponent,
  NuxeoTagComponent,
  NuxeoTooltipComponent,
  NuxeoTreeComponent,
  NuxeoTreeNodeComponent,
  NuxeoVersionsListComponent,
  PAGES_SLOT,
  POLYMER_MESSAGES,
  POLYMER_SLOTS,
  POLYMER_THEME_TOKENS,
  PUBLISH_ITEMS_SLOT,
  PUBLISH_PAGES_SLOT,
  QUICK_SEARCH_ACTIONS_SLOT,
  QuickSearchCommandComponent,
  RESULTS_ACTIONS_SLOT,
  RESULTS_COMMAND_GATEWAY,
  RESULTS_PAGING_OPTIONS,
  RESULTS_SELECTION_ACTIONS_SLOT,
  ResultsPagingSettings,
  ResultsProjectionComponent,
  ResultsProjectionHostTemplateDirective,
  ResultsProjectionRegistry,
  ResultsProjectionTemplateDirective,
  SAVED_SEARCH_GATEWAY,
  SHELL_ACTIONS_SLOT,
  SUGGESTION_OPTIONS,
  SUPPORTED_WEB_UI_LOCALES,
  SchemaFieldComponent,
  SchemaLayoutComponent,
  SuggestionScope,
  SuggestionSettings,
  THEMES_SLOT,
  TRASH_RESULTS_SELECTION_ACTIONS_SLOT,
  USER_MENU_SLOT,
  ViewNavigation,
  WORKFLOW_LAYOUTS,
  WebUiAppState,
  WebUiCurrencyPipe,
  WebUiDatePipe,
  WebUiIconComponent,
  WebUiIcons,
  WebUiLocale,
  WebUiMessagePipe,
  WebUiMessages,
  WebUiNumberPipe,
  WebUiPageComponent,
  WebUiPercentPipe,
  WebUiSlotComponent,
  WebUiThemePickerComponent,
  WebUiThemes,
  buildBulkDocumentChanges,
  cloneLayoutValue,
  defineContribution,
  defineDocumentView,
  defineDocumentViewVariants,
  definePage,
  definePairedView,
  defineSlot,
  defineWebUiTheme,
  documentLayoutContext,
  documentProjectionContext,
  documentViewParameter,
  documentViewsNavigationGuard,
  formatWebUiMessage,
  gridLocale,
  layoutFieldError,
  layoutPropertyValue,
  localizedState,
  normalizeSuggestionConfig,
  normalizeWebUiLocale,
  nuxeoFilter,
  provideBulkLayouts,
  provideComparisonLayout,
  provideDirectoryLayouts,
  provideDocumentFieldExtensions,
  provideDocumentLayoutExtensions,
  provideDocumentLayoutWidget,
  provideResultsProjections,
  provideSuggestionScope,
  provideWebUiExtensions,
  provideWebUiIcons,
  provideWebUiMessages,
  provideWebUiThemeApplication,
  provideWorkflowLayout,
  resolveComparisonLayout,
  resolveDocumentViews,
  resolveLayoutFields,
  suggestionLimits,
  suggestionMinCharsText,
  suggestionTerms,
};
export type {
  ActionsMenuContext,
  AdministrationContext,
  ApplicationContext,
  ApplicationUser,
  BlobActionContext,
  BlobValue,
  BulkFieldChange,
  BulkLayoutComponent,
  BulkLayoutContext,
  BulkLayoutRegistration,
  BulkUpdateMode,
  ComparisonLayout,
  ComparisonValueContext,
  ComparisonValueKind,
  ContributionDefinition,
  ContributionOverride,
  ContributionRegistration,
  DirectoryLayoutComponent,
  DirectoryLayoutContext,
  DirectoryLayoutRegistration,
  DocumentActionContext,
  DocumentCreateContext,
  DocumentFieldExtension,
  DocumentImportDraft,
  DocumentInfoBarContext,
  DocumentLayout,
  DocumentLayoutContext,
  DocumentLayoutDefinition,
  DocumentLayoutExtension,
  DocumentLayoutGateway,
  DocumentLayoutHost,
  DocumentLayoutMode,
  DocumentLayoutOverride,
  DocumentLayoutWidget,
  DocumentProjection,
  DocumentProjectionContext,
  DocumentProjectionName,
  DocumentTypeMetadata,
  DocumentViewChange,
  DocumentViewContext,
  DocumentViewDefinition,
  DocumentViewItemContext,
  DocumentViewVariant,
  DrawerContext,
  ExtensionDiagnostic,
  FileUploadContext,
  GuardedView,
  LayoutDocument,
  LayoutField,
  LayoutMode,
  LocalizedState,
  NuxeoFilterConditions,
  NuxeoFilterContext,
  NuxeoFilterDocument,
  NuxeoFilters,
  PageContext,
  ProjectionContext,
  PublishContext,
  QuickSearchContext,
  ReferenceValue,
  ResolvedContribution,
  ResolvedDocumentLayout,
  ResolvedDocumentProjection,
  ResolvedDocumentView,
  ResolvedLayoutField,
  ResultsColumn,
  ResultsColumnLayout,
  ResultsCommandGateway,
  ResultsPagingOptions,
  ResultsProjectionColumn,
  ResultsProjectionComponentLoader,
  ResultsProjectionComponents,
  ResultsProjectionContext,
  ResultsProjectionDefinition,
  ResultsProjectionHostContext,
  ResultsProjectionHostTemplateName,
  ResultsProjectionMode,
  ResultsProjectionRow,
  ResultsProjectionRowTemplateName,
  ResultsProjectionTemplateName,
  ResultsQueryScope,
  ResultsSelectionContext,
  ResultsToolbarContext,
  SavedSearchDefinition,
  SavedSearchGateway,
  SchemaFieldMetadata,
  SchemaFieldType,
  SchemaMetadata,
  ShellActionContext,
  SlotDefinition,
  SlotResolution,
  SuggestionConfig,
  SuggestionLimits,
  SuggestionLimitsConfig,
  SuggestionRules,
  SuggestionTarget,
  SuggestionWidget,
  SupportedWebUiLocale,
  TreeNodeContext,
  UserMenuContext,
  UserMenuLanguage,
  ViewDeparture,
  VisibilityRuleDefinition,
  WebUiExtension,
  WebUiIcon,
  WebUiMessageCatalog,
  WebUiMessageValues,
  WebUiSvgNode,
  WebUiThemeContext,
  WebUiThemeDefinition,
  WidgetProps,
  WorkflowLayout,
  WorkflowLayoutContext,
  WorkflowLayoutMode,
  WorkflowTask,
  WorkflowTaskAction,
};
```
