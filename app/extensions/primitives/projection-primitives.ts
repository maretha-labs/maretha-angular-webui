import { WebUiLocale } from '../i18n/webui-locale';
import { WebUiMessagePipe, WebUiMessages } from '../webui-messages';
import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	DestroyRef,
	Injector,
	afterEveryRender,
	afterNextRender,
	computed,
	HostListener,
	OnChanges,
	SimpleChanges,
	TemplateRef,
	booleanAttribute,
	contentChild,
	inject,
	input,
	model,
	output,
	viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/** Context supplied when a projected template is rendered. */
export interface ProjectionContext<T = unknown, H = unknown> {
	readonly $implicit: T;
	readonly host: H;
}

/** The scoped controls available to templates rendered by an actions menu. */
export interface ActionsMenuContext<T> extends ProjectionContext<T, NuxeoActionsMenuComponent<T>> {
	readonly close: () => void;
	readonly isCurrentScope: () => boolean;
}

/** Context for a tree item template. */
export interface TreeNodeContext<T> extends ProjectionContext<T, NuxeoTreeNodeComponent<T>> {
	readonly item: T;
	readonly depth: number;
	readonly opened: boolean;
	readonly isLeaf: boolean;
	readonly toggle: () => void;
	readonly select: () => void;
}

export type BulkUpdateMode = 'keep' | 'replace' | 'addValues' | 'remove';

const templateImports = [NgTemplateOutlet];
const messageTemplateImports = [...templateImports, WebUiMessagePipe];
let tooltipSequence = 0;
let treeNodeSequence = 0;

@Component({
	selector: 'nx-page',
	standalone: true,
	imports: messageTemplateImports,
	template: `<section class="page">
		<header><ng-container *ngTemplateOutlet="header(); context: context()" /></header>
		<nav
			[attr.aria-label]="
				'app.sdk.projection-primitives.page-tabs-76a8ee' | webuiMessage: 'Page tabs'
			"
		>
			<ng-container *ngTemplateOutlet="tabs(); context: context()" />
		</nav>
		<main><ng-container *ngTemplateOutlet="body(); context: context()" /></main>
	</section>`,
	styles: `
		:host {
			display: block;
		}
		.page {
			height: calc(100vh - var(--nuxeo-app-top, 0px) - var(--nuxeo-app-bottom, 0px));
			display: flex;
			flex-direction: column;
		}
		header,
		nav {
			flex: 0 0 auto;
			background: var(--nuxeo-app-header-background);
		}
		header {
			min-height: var(--nuxeo-drawer-header-height, 48px);
			color: var(--nuxeo-app-header);
			box-shadow: var(--nuxeo-app-header-box-shadow);
		}
		nav {
			overflow: auto;
		}
		main {
			flex: 1 1 auto;
			overflow: auto;
			padding: 16px 16px 0;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NuxeoPageComponent<T = unknown> {
	readonly value = input<T>(null as T);
	readonly header =
		contentChild<TemplateRef<ProjectionContext<T, NuxeoPageComponent<T>>>>('header');
	readonly tabs = contentChild<TemplateRef<ProjectionContext<T, NuxeoPageComponent<T>>>>('tabs');
	readonly body = contentChild<TemplateRef<ProjectionContext<T, NuxeoPageComponent<T>>>>('body');
	context = (): ProjectionContext<T, NuxeoPageComponent<T>> => ({
		$implicit: this.value(),
		host: this,
	});
}

@Component({
	selector: 'nx-card',
	standalone: true,
	imports: templateImports,
	template: `<section class="card">
		@if (collapsible()) {
			<button type="button" class="heading" [attr.aria-expanded]="opened()" (click)="toggle()">
				{{ heading() }} <span aria-hidden="true">{{ opened() ? '⌃' : '⌄' }}</span>
			</button>
		} @else if (heading()) {
			<h2 class="heading">{{ heading() }}</h2>
		}
		@if (opened() || !collapsible()) {
			<ng-container *ngTemplateOutlet="content(); context: context()" />
		}
	</section>`,
	styles: `
		:host {
			display: block;
		}
		.card {
			box-sizing: border-box;
			background: var(--nuxeo-box);
			color: var(--nuxeo-text-default);
			padding: 16px;
		}
		.heading {
			width: 100%;
			border: 0;
			background: none;
			color: inherit;
			padding: 0 0 1em;
			text-align: start;
			font-family: inherit;
			font-weight: 700;
			font-size: 14px;
			line-height: 1.25rem;
			display: flex;
			justify-content: space-between;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NuxeoCardComponent<T = unknown> {
	readonly heading = input('');
	readonly collapsible = input(false, { transform: booleanAttribute });
	readonly opened = model(false);
	readonly content =
		contentChild<TemplateRef<ProjectionContext<T, NuxeoCardComponent<T>>>>('content');
	readonly value = input<T>(null as T);
	context = (): ProjectionContext<T, NuxeoCardComponent<T>> => ({
		$implicit: this.value(),
		host: this,
	});
	toggle(): void {
		if (this.collapsible()) this.opened.update((open) => !open);
	}
}

@Component({
	selector: 'nx-dialog',
	standalone: true,
	imports: templateImports,
	template: `<dialog #dialog [attr.aria-label]="effectiveLabel()" (close)="closed.emit()">
		<ng-container *ngTemplateOutlet="content(); context: context()" />
	</dialog>`,
	styles: `
		dialog {
			border: 0;
			border-radius: 4px;
			padding: 16px;
			color: var(--nuxeo-text-default);
			background: var(--nuxeo-box);
		}
		dialog::backdrop {
			background: color-mix(in srgb, var(--nuxeo-text-default) 35%, transparent);
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NuxeoDialogComponent<T = unknown> implements OnChanges {
	private readonly messages = inject(WebUiMessages);
	private labelProvided = false;
	ngOnChanges(changes: SimpleChanges): void {
		if (changes['label']) this.labelProvided = true;
	}
	effectiveLabel(): string {
		return this.labelProvided
			? this.label()
			: this.messages.format('sdk.dialog.label', {}, 'Dialog');
	}
	readonly label = input('Dialog');
	readonly value = input<T>(null as T);
	readonly content =
		contentChild<TemplateRef<ProjectionContext<T, NuxeoDialogComponent<T>>>>('content');
	readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
	readonly closed = output<void>();
	context = (): ProjectionContext<T, NuxeoDialogComponent<T>> => ({
		$implicit: this.value(),
		host: this,
	});
	open(): void {
		const dialog = this.dialog().nativeElement;
		if (!dialog.open) dialog.showModal();
	}
	close(): void {
		const dialog = this.dialog().nativeElement;
		if (dialog.open) dialog.close();
	}
}

@Component({
	selector: 'nx-confirm-button',
	standalone: true,
	imports: [NuxeoDialogComponent, NgTemplateOutlet],
	template: `<button type="button" [disabled]="disabled() || busy()" (click)="openDialog()">
			<ng-container *ngTemplateOutlet="trigger(); context: context()" />
		</button>
		<nx-dialog #dialog [label]="effectiveTitle()" [value]="value()" (closed)="onClosed()">
			<ng-template #content
				><p>{{ effectiveTitle() }}</p>
				<footer>
					<button type="button" [disabled]="busy()" (click)="dialog.close()">
						{{ effectiveDismiss() }}
					</button>
					<button type="button" [disabled]="disabled() || busy()" (click)="confirmDialog()">
						{{ effectiveConfirm() }}
					</button>
				</footer></ng-template
			>
		</nx-dialog>`,
	styles: `
		:host {
			display: inline-block;
		}
		button {
			cursor: pointer;
		}
		button:disabled {
			cursor: default;
		}
		footer {
			display: flex;
			justify-content: flex-end;
			gap: 8px;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NuxeoConfirmButtonComponent<T = unknown> implements OnChanges {
	private readonly messages = inject(WebUiMessages);
	private readonly providedLabels = new Set<string>();
	effectiveTitle(): string {
		return this.providedLabels.has('dialogTitle')
			? this.dialogTitle()
			: this.messages.format('sdk.dialog.sure', {}, 'Are you sure?');
	}
	effectiveConfirm(): string {
		return this.providedLabels.has('dialogConfirm')
			? this.dialogConfirm()
			: this.messages.format('sdk.dialog.yes', {}, 'Yes');
	}
	effectiveDismiss(): string {
		return this.providedLabels.has('dialogDismiss')
			? this.dialogDismiss()
			: this.messages.format('sdk.dialog.no', {}, 'No');
	}
	readonly value = input<T>(null as T);
	readonly scope = input<unknown>(null);
	readonly dialogTitle = input('Are you sure?');
	readonly dialogConfirm = input('Yes');
	readonly dialogDismiss = input('No');
	readonly disabled = input(false, { transform: booleanAttribute });
	readonly busy = input(false, { transform: booleanAttribute });
	readonly trigger =
		contentChild<TemplateRef<ProjectionContext<T, NuxeoConfirmButtonComponent<T>>>>('trigger');
	readonly dialog = viewChild.required<NuxeoDialogComponent<T>>('dialog');
	readonly confirm = output<T>();
	readonly dismiss = output<T>();
	private scopeVersion = 0;
	private target: {
		readonly value: T;
		readonly scope: number;
		readonly scopeValue: unknown;
	} | null = null;
	private confirming = false;
	context = (): ProjectionContext<T, NuxeoConfirmButtonComponent<T>> => ({
		$implicit: this.value(),
		host: this,
	});

	ngOnChanges(changes: SimpleChanges): void {
		for (const name of ['dialogTitle', 'dialogConfirm', 'dialogDismiss'])
			if (changes[name]) this.providedLabels.add(name);
		if (changes['value']) {
			this.scopeVersion++;
			this.target = null;
			if (this.dialog().dialog().nativeElement.open) this.dialog().close();
		}
	}
	openDialog(): void {
		if (this.disabled() || this.busy()) return;
		this.target = { value: this.value(), scope: this.scopeVersion, scopeValue: this.scope() };
		this.confirming = false;
		this.dialog().open();
	}
	confirmDialog(): void {
		const target = this.target;
		if (
			!target ||
			this.disabled() ||
			this.busy() ||
			target.scope !== this.scopeVersion ||
			target.value !== this.value() ||
			target.scopeValue !== this.scope()
		)
			return;
		this.confirming = true;
		this.confirm.emit(target.value);
		this.dialog().close();
	}
	onClosed(): void {
		const target = this.target;
		const shouldDismiss =
			!!target &&
			!this.confirming &&
			target.scope === this.scopeVersion &&
			target.value === this.value() &&
			target.scopeValue === this.scope();
		this.target = null;
		this.confirming = false;
		if (shouldDismiss) this.dismiss.emit(target.value);
	}
}

@Component({
	selector: 'nx-popup-confirm',
	standalone: true,
	imports: [NuxeoConfirmButtonComponent, NgTemplateOutlet],
	template: `<nx-confirm-button
		[value]="value()"
		[scope]="scope()"
		[dialogTitle]="effectiveMessage()"
		[disabled]="disabled()"
		[busy]="busy()"
		(confirm)="confirmed.emit($event)"
		(dismiss)="dismissed.emit($event)"
		><ng-template #trigger
			><ng-container *ngTemplateOutlet="projectedTrigger(); context: context()" /></ng-template
	></nx-confirm-button>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NuxeoPopupConfirmComponent<T = unknown> implements OnChanges {
	private readonly messages = inject(WebUiMessages);
	private messageProvided = false;
	ngOnChanges(changes: SimpleChanges): void {
		if (changes['message']) this.messageProvided = true;
	}
	effectiveMessage(): string {
		return this.messageProvided
			? this.message()
			: this.messages.format('sdk.dialog.sure', {}, 'Are you sure?');
	}
	readonly value = input<T>(null as T);
	readonly scope = input<unknown>(null);
	readonly message = input('Are you sure?');
	readonly disabled = input(false, { transform: booleanAttribute });
	readonly busy = input(false, { transform: booleanAttribute });
	readonly projectedTrigger =
		contentChild<TemplateRef<ProjectionContext<T, NuxeoPopupConfirmComponent<T>>>>('trigger');
	/** Preserves Polymer's public `confirm` event while keeping an explicit property name. */
	// eslint-disable-next-line @angular-eslint/no-output-rename -- public compatibility alias
	readonly confirmed = output<T>({ alias: 'confirm' });
	// eslint-disable-next-line @angular-eslint/no-output-rename -- public compatibility alias
	readonly dismissed = output<T>({ alias: 'dismiss' });
	context = (): ProjectionContext<T, NuxeoPopupConfirmComponent<T>> => ({
		$implicit: this.value(),
		host: this,
	});
}

@Component({
	selector: 'nx-select',
	standalone: true,
	imports: templateImports,
	template: `<label>
		@if (label()) {
			<span>{{ label() }}</span>
		}
		><select
			[value]="value()"
			[disabled]="disabled()"
			[required]="required()"
			(change)="change($any($event.target).value)"
		>
			<ng-container *ngTemplateOutlet="options(); context: context()" /></select
	></label>`,
	styles: `
		select {
			width: 100%;
			font: inherit;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NuxeoSelectComponent<T extends string = string> {
	readonly label = input('');
	readonly value = model<T>('' as T);
	readonly disabled = input(false, { transform: booleanAttribute });
	readonly required = input(false, { transform: booleanAttribute });
	readonly options =
		contentChild<TemplateRef<ProjectionContext<T, NuxeoSelectComponent<T>>>>('options');
	readonly changed = output<T>();
	context = (): ProjectionContext<T, NuxeoSelectComponent<T>> => ({
		$implicit: this.value(),
		host: this,
	});
	change(value: T): boolean {
		if (this.disabled()) return false;
		this.value.set(value);
		this.changed.emit(value);
		return true;
	}
	validate(): boolean {
		return !this.required() || this.value().trim().length > 0;
	}
}

@Component({
	selector: 'nx-tag',
	standalone: true,
	imports: templateImports,
	template: `<span class="tag"
		><ng-container *ngTemplateOutlet="content(); context: context()"
	/></span>`,
	styles: `
		.tag {
			display: inline-flex;
			padding: 2px 8px;
			border-radius: 12px;
			background: color-mix(in srgb, var(--nuxeo-primary-color) 12%, transparent);
			color: var(--nuxeo-text-default);
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NuxeoTagComponent<T = unknown> {
	readonly value = input<T>(null as T);
	readonly content =
		contentChild<TemplateRef<ProjectionContext<T, NuxeoTagComponent<T>>>>('content');
	context = (): ProjectionContext<T, NuxeoTagComponent<T>> => ({
		$implicit: this.value(),
		host: this,
	});
}

@Component({
	selector: 'nx-tooltip',
	standalone: true,
	imports: templateImports,
	template: `<span
			#anchor
			class="anchor"
			tabindex="-1"
			(focusin)="onFocusIn($event)"
			(focusout)="onFocusOut($event)"
			(keydown)="onKeydown($event)"
			><ng-container *ngTemplateOutlet="trigger(); context: context()" /></span
		><span class="tip" [class.visible]="visible()" role="tooltip" [id]="id"
			><ng-container *ngTemplateOutlet="content(); context: context()"
		/></span>`,
	styles: `
		:host {
			position: relative;
			display: inline-block;
		}
		:host ::ng-deep .anchor :focus-visible {
			outline: 2px solid var(--nuxeo-text-default, CanvasText);
			outline-offset: 2px;
		}
		.tip {
			display: none;
			position: absolute;
			z-index: 10;
			padding: 6px 8px;
			border-radius: 3px;
			background: var(--nuxeo-text-default);
			color: var(--nuxeo-box);
			white-space: nowrap;
		}
		.tip.visible {
			display: block;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NuxeoTooltipComponent<T = unknown> {
	private describedTarget?: HTMLElement;
	private descriptionAdded = false;
	private hovered = false;
	constructor() {
		inject(DestroyRef).onDestroy(() => this.removeDescription());
	}
	private removeDescription(): void {
		const target = this.describedTarget;
		if (target && this.descriptionAdded) {
			const ids = (target.getAttribute('aria-describedby') ?? '')
				.split(/\s+/)
				.filter((id) => id && id !== this.id);
			if (ids.length) target.setAttribute('aria-describedby', ids.join(' '));
			else target.removeAttribute('aria-describedby');
		}
		this.describedTarget = undefined;
		this.descriptionAdded = false;
	}
	readonly value = input<T>(null as T);
	readonly trigger =
		contentChild<TemplateRef<ProjectionContext<T, NuxeoTooltipComponent<T>>>>('trigger');
	readonly content =
		contentChild<TemplateRef<ProjectionContext<T, NuxeoTooltipComponent<T>>>>('content');
	readonly anchor = viewChild.required<ElementRef<HTMLElement>>('anchor');
	readonly visible = model(false);
	readonly id = `nx-tooltip-${++tooltipSequence}`;
	context = (): ProjectionContext<T, NuxeoTooltipComponent<T>> => ({
		$implicit: this.value(),
		host: this,
	});
	show(): void {
		this.visible.set(true);
	}
	hide(): void {
		this.visible.set(false);
	}
	@HostListener('mouseenter') onPointerEnter(): void {
		this.hovered = true;
		this.show();
	}
	@HostListener('mouseleave') onPointerLeave(): void {
		this.hovered = false;
		const anchor = this.anchor().nativeElement;
		if (!anchor.contains(anchor.ownerDocument.activeElement)) this.hide();
	}
	onFocusIn(event: FocusEvent): void {
		const target = event.target;
		if (!(target instanceof HTMLElement) || !this.anchor().nativeElement.contains(target)) return;
		if (target !== this.describedTarget) {
			this.removeDescription();
			const ids = (target.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
			this.describedTarget = target;
			this.descriptionAdded = !ids.includes(this.id);
			if (this.descriptionAdded)
				target.setAttribute('aria-describedby', [...ids, this.id].join(' '));
		}
		this.show();
	}
	onFocusOut(event: FocusEvent): void {
		if (!this.anchor().nativeElement.contains(event.relatedTarget as Node | null)) {
			if (!this.hovered) this.hide();
			this.removeDescription();
		}
	}
	onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && this.visible()) {
			event.preventDefault();
			event.stopPropagation();
			this.hide();
		}
	}
}

@Component({
	selector: 'nx-actions-menu',
	standalone: true,
	imports: templateImports,
	template: `<span class="inline-actions"
			><ng-container *ngTemplateOutlet="content(); context: context()"
		/></span>
		<button
			#trigger
			type="button"
			[disabled]="disabled()"
			[attr.aria-expanded]="open()"
			aria-haspopup="menu"
			[attr.aria-controls]="open() ? menuId : null"
			(click)="toggle()"
			(keydown)="onTriggerKeydown($event)"
		>
			{{ accessibleLabel() }}
		</button>
		@if (open()) {
			<div
				#menu
				[id]="menuId"
				role="menu"
				[attr.aria-label]="accessibleLabel()"
				tabindex="-1"
				(keydown)="onMenuKeydown($event)"
				(click)="close(true)"
			>
				<ng-container *ngTemplateOutlet="dropdown(); context: context()" />
			</div>
		} `,
	styles: `
		:host {
			position: relative;
			display: inline-block;
		}
		button:focus-visible,
		[role='menu']:focus-visible {
			outline: 2px solid var(--nuxeo-text-default, CanvasText);
			outline-offset: 2px;
		}
		:host
			::ng-deep
			[role='menu']
			:is([role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio']):focus-visible {
			outline: 2px solid var(--nuxeo-text-default, CanvasText);
			outline-offset: 2px;
		}
		[role='menu'] {
			position: absolute;
			z-index: 10;
			min-width: max-content;
			background: var(--nuxeo-box);
			color: var(--nuxeo-text-default);
			padding: 4px;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NuxeoActionsMenuComponent<T = unknown> implements OnChanges {
	private readonly messages = inject(WebUiMessages);
	protected readonly accessibleLabel = computed(
		() => this.label() || this.messages.text('actionsMenu.more', 'More'),
	);
	readonly label = input('');
	readonly value = input<T>(null as T);
	readonly scope = input<unknown>(null);
	readonly disabled = input(false, { transform: booleanAttribute });
	readonly open = model(false);
	readonly content = contentChild<TemplateRef<ActionsMenuContext<T>>>('content');
	readonly dropdown = contentChild<TemplateRef<ActionsMenuContext<T>>>('dropdown');
	readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
	readonly menu = viewChild<ElementRef<HTMLElement>>('menu');
	private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
	private readonly destroyRef = inject(DestroyRef);
	private readonly injector = inject(Injector);
	private focusVersion = 0;
	private scopeVersion = 0;
	constructor() {
		afterEveryRender(() => this.prepareMenuItems());
	}
	readonly menuId = `nx-actions-menu-${++tooltipSequence}`;

	ngOnChanges(changes: SimpleChanges): void {
		if (changes['value'] || changes['scope'] || (changes['disabled'] && this.disabled())) {
			this.scopeVersion++;
			this.close();
		}
	}
	context = (): ActionsMenuContext<T> => {
		const scope = this.scopeVersion;
		const value = this.value();
		const scopeValue = this.scope();
		return {
			$implicit: value,
			host: this,
			isCurrentScope: () =>
				scope === this.scopeVersion && value === this.value() && scopeValue === this.scope(),
			close: () => {
				if (scope === this.scopeVersion && value === this.value() && scopeValue === this.scope())
					this.close(true);
			},
		};
	};
	toggle(): void {
		if (this.disabled()) return;
		if (this.open()) this.close();
		else this.openMenu('first');
	}
	openMenu(focus: 'first' | 'last' | null = null): void {
		if (this.disabled()) return;
		this.open.set(true);
		const version = ++this.focusVersion;
		if (focus)
			afterNextRender(
				() => {
					if (
						!this.destroyRef.destroyed &&
						version === this.focusVersion &&
						this.open() &&
						!this.disabled()
					)
						this.focusMenuItem(focus);
				},
				{ injector: this.injector },
			);
	}
	close(returnFocus = false): void {
		const document = this.element.nativeElement.ownerDocument;
		const popup = this.menu()?.nativeElement;
		const canReturnFocus = () =>
			document.activeElement === document.body ||
			document.activeElement === this.trigger()?.nativeElement ||
			!!popup?.contains(document.activeElement);
		const restoreFocus = returnFocus && canReturnFocus();
		this.open.set(false);
		const version = ++this.focusVersion;
		if (restoreFocus)
			queueMicrotask(() => {
				if (
					!this.destroyRef.destroyed &&
					version === this.focusVersion &&
					!this.open() &&
					!this.disabled() &&
					canReturnFocus()
				)
					this.trigger()?.nativeElement.focus();
			});
	}
	onTriggerKeydown(event: KeyboardEvent): void {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			this.openMenu(event.key === 'ArrowDown' ? 'first' : 'last');
		} else if (event.key === 'Escape' && this.open()) {
			event.preventDefault();
			event.stopPropagation();
			this.close(true);
		}
	}
	onMenuKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			this.close(true);
			return;
		}
		if (event.key === 'Tab') {
			this.trigger()?.nativeElement.focus();
			this.close();
			return;
		}
		const items = this.menuItems();
		if (!items.length) return;
		const current = items.indexOf(
			this.element.nativeElement.ownerDocument.activeElement as HTMLElement,
		);
		let index: number | null = null;
		if (event.key === 'ArrowDown') index = (current + 1) % items.length;
		if (event.key === 'ArrowUp')
			index = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
		if (event.key === 'Home') index = 0;
		if (event.key === 'End') index = items.length - 1;
		if (index !== null) {
			event.preventDefault();
			items[index].focus();
		}
	}
	@HostListener('document:pointerdown', ['$event']) onDocumentPointerDown(
		event: PointerEvent,
	): void {
		if (
			this.open() &&
			event.target instanceof Node &&
			!this.element.nativeElement.contains(event.target)
		)
			this.close();
	}
	private prepareMenuItems(): HTMLElement[] {
		const menu = this.menu()?.nativeElement;
		if (!menu) return [];
		const candidates = Array.from(
			menu.querySelectorAll<HTMLElement>(
				'[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], button:not([role]), a[href]:not([role])',
			),
		).filter((item) => item.closest('[role="menu"]') === menu);
		for (const item of candidates) {
			if (!item.hasAttribute('role') || item.getAttribute('role') === 'option')
				item.setAttribute('role', 'menuitem');
			item.tabIndex = -1;
		}
		return candidates;
	}
	private menuItems(): HTMLElement[] {
		return this.prepareMenuItems().filter(
			(item) =>
				!item.matches(':disabled') &&
				!item.closest('[hidden], [inert], [aria-hidden="true"], [aria-disabled="true"]') &&
				item.getClientRects().length > 0 &&
				getComputedStyle(item).visibility !== 'hidden',
		);
	}
	private focusMenuItem(which: 'first' | 'last'): void {
		const items = this.menuItems();
		(items[which === 'first' ? 0 : items.length - 1] ?? this.menu()?.nativeElement)?.focus();
	}
}

@Component({
	selector: 'nx-tree-node',
	standalone: true,
	imports: messageTemplateImports,
	template: `<li
		role="treeitem"
		[attr.aria-level]="depth() + 1"
		[attr.aria-labelledby]="labelId"
		[attr.aria-selected]="isSelected()"
		[attr.aria-expanded]="isLeaf() ? null : opened()"
		tabindex="0"
		(click)="onNodeClick($event)"
		(keydown)="onKeydown($event)"
	>
		@if (!isLeaf()) {
			<button
				type="button"
				tabindex="-1"
				(click)="onToggle($event)"
				[attr.aria-label]="
					opened()
						? ('sdk.tree.collapse' | webuiMessage: 'Collapse')
						: ('sdk.tree.expand' | webuiMessage: 'Expand')
				"
			>
				{{ opened() ? '−' : '+' }}
			</button>
		}
		<span [id]="labelId"><ng-container *ngTemplateOutlet="content(); context: context()" /></span>
		@if (opened() && !isLeaf()) {
			<ul role="group">
				<ng-content />
			</ul>
		}
	</li>`,
	styles: `
		li {
			list-style: none;
		}
		li:focus-visible {
			outline: 2px solid var(--nuxeo-text-default, CanvasText);
			outline-offset: 2px;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NuxeoTreeNodeComponent<T = unknown> {
	private readonly locale = inject(WebUiLocale);
	protected readonly labelId = `nx-tree-label-${++treeNodeSequence}`;
	readonly item = input.required<T>();
	readonly scope = input<unknown>(null);
	readonly depth = input(0);
	readonly isLeaf = input(false, { transform: booleanAttribute });
	readonly opened = model(false);
	readonly selectedItem = model<T | null>(null);
	readonly content = contentChild<TemplateRef<TreeNodeContext<T>>>('content');
	readonly selected = output<T>();
	toggle(): void {
		if (!this.isLeaf()) this.opened.update((opened) => !opened);
	}
	select(): void {
		this.selectedItem.set(this.item());
		this.selected.emit(this.item());
	}
	isSelected(): boolean {
		return this.selectedItem() === this.item();
	}
	protected onToggle(event: MouseEvent): void {
		event.stopPropagation();
		this.toggle();
		(event.currentTarget as HTMLElement).closest<HTMLElement>('[role="treeitem"]')?.focus();
	}
	onNodeClick(event: MouseEvent): void {
		const target = event.target;
		if (target instanceof Element && target.closest('[role="treeitem"]') !== event.currentTarget)
			return;
		(event.currentTarget as HTMLElement).focus();
		this.select();
	}
	onKeydown(event: KeyboardEvent): void {
		if (event.target !== event.currentTarget) return;
		const expandKey = this.locale.direction() === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
		const collapseKey = this.locale.direction() === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			this.select();
		} else if (event.key === expandKey && !this.isLeaf() && !this.opened()) {
			event.preventDefault();
			this.toggle();
		} else if (event.key === collapseKey && !this.isLeaf() && this.opened()) {
			event.preventDefault();
			this.toggle();
		}
	}
	context = (): TreeNodeContext<T> => {
		const item = this.item();
		const scope = this.scope();
		const current = () => item === this.item() && scope === this.scope();
		return {
			$implicit: item,
			item,
			depth: this.depth(),
			opened: this.opened(),
			isLeaf: this.isLeaf(),
			toggle: () => {
				if (current()) this.toggle();
			},
			select: () => {
				if (current()) this.select();
			},
			host: this,
		};
	};
}

@Component({
	selector: 'nx-tree',
	standalone: true,
	template: `<ul
		role="tree"
		tabindex="-1"
		[attr.aria-label]="label() || messages.text('app.browse', 'Browse')"
		(focusin)="onFocus($event)"
		(focusout)="onBlur($event)"
		(keydown)="onKeydown($event)"
	>
		<ng-content />
	</ul>`,
	styles: `
		ul {
			margin: 0;
			padding-inline-start: 1em;
			list-style: none;
		}
		ul:focus-visible {
			outline: 2px solid var(--nuxeo-text-default, CanvasText);
			outline-offset: -2px;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NuxeoTreeComponent {
	/** A literal accessible name supplied by the consumer; the default is localized. */
	readonly label = input('');
	protected readonly messages = inject(WebUiMessages);
	private readonly locale = inject(WebUiLocale);
	private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
	private current: HTMLElement | null = null;
	private ancestors: HTMLElement[] = [];
	private previousItems: HTMLElement[] = [];
	private ownedFocus: HTMLElement | null = null;
	private search = '';
	private searchedAt = 0;

	constructor() {
		afterEveryRender(() => this.reconcile());
	}
	private tree(): HTMLElement | null {
		return this.element.nativeElement.querySelector('[role="tree"]');
	}
	private items(): HTMLElement[] {
		const tree = this.tree();
		return tree
			? Array.from(tree.querySelectorAll<HTMLElement>('[role="treeitem"]')).filter(
					(item) =>
						item.closest('[role="tree"]') === tree &&
						!item.closest('[hidden], [inert]') &&
						item.getClientRects().length > 0,
				)
			: [];
	}
	private parents(item: HTMLElement): HTMLElement[] {
		const parents: HTMLElement[] = [];
		let parent = item.parentElement?.closest<HTMLElement>('[role="treeitem"]');
		while (parent && parent.closest('[role="tree"]') === this.tree()) {
			parents.push(parent);
			parent = parent.parentElement?.closest<HTMLElement>('[role="treeitem"]');
		}
		return parents;
	}
	private reconcile(): void {
		const items = this.items();
		const tree = this.tree();
		if (!tree) return;
		const removed = this.current && !items.includes(this.current);
		const previousIndex = this.current ? this.previousItems.indexOf(this.current) : -1;
		const target =
			!removed && this.current
				? this.current
				: (this.ancestors.find((parent) => items.includes(parent)) ??
					(previousIndex >= 0 ? items[Math.min(previousIndex, items.length - 1)] : undefined) ??
					items.find((item) => item.getAttribute('aria-selected') === 'true') ??
					items[0] ??
					null);
		const active = tree.ownerDocument.activeElement;
		const lostFocus =
			this.ownedFocus &&
			(active === tree.ownerDocument.body || active === this.ownedFocus) &&
			(!this.ownedFocus.isConnected ||
				!items.some((item) => item === this.ownedFocus || item.contains(this.ownedFocus)));
		this.current = target;
		for (const item of items) item.tabIndex = item === target ? 0 : -1;
		tree.tabIndex = items.length ? -1 : 0;
		this.previousItems = items;
		if (target) this.ancestors = this.parents(target);
		if (lostFocus) (target ?? tree).focus();
	}
	protected onFocus(event: FocusEvent): void {
		const target = event.target as HTMLElement;
		if (target.closest('[role="tree"]') !== this.tree()) return;
		this.ownedFocus = target;
		const item = target.closest<HTMLElement>('[role="treeitem"]');
		if (item) {
			this.current = item;
			this.ancestors = this.parents(item);
			for (const node of this.items()) node.tabIndex = node === item ? 0 : -1;
		}
	}
	protected onBlur(event: FocusEvent): void {
		if (event.relatedTarget instanceof Node && !this.tree()?.contains(event.relatedTarget))
			this.ownedFocus = null;
	}
	protected onKeydown(event: KeyboardEvent): void {
		if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
		const items = this.items();
		const item = event.target as HTMLElement;
		const index = items.indexOf(item);
		if (index < 0) return; // Projected controls own their own keyboard behavior.
		const expand = this.locale.direction() === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
		const collapse = this.locale.direction() === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
		let target: HTMLElement | undefined;
		if (event.key === 'ArrowDown') target = items[index + 1];
		else if (event.key === 'ArrowUp') target = items[index - 1];
		else if (event.key === 'Home') target = items[0];
		else if (event.key === 'End') target = items[items.length - 1];
		else if (event.key === expand && item.getAttribute('aria-expanded') === 'true')
			target = items.find((node) => this.parents(node)[0] === item);
		else if (event.key === collapse) target = this.parents(item)[0];
		else if (event.key.length === 1 && event.key !== ' ') {
			const now = Date.now();
			this.search = now - this.searchedAt > 700 ? event.key : this.search + event.key;
			this.searchedAt = now;
			const query = this.search.toLocaleLowerCase(this.locale.locale());
			const prefix = Array.from(query).every((char) => char === query[0]) ? query[0] : query;
			target = [...items.slice(index + 1), ...items.slice(0, index + 1)].find((node) => {
				const ids = node.getAttribute('aria-labelledby')?.split(/\s+/) ?? [];
				const name =
					node.getAttribute('aria-label') ??
					(ids.length
						? ids.map((id) => node.ownerDocument.getElementById(id)?.textContent ?? '').join(' ')
						: (node.textContent ?? ''));
				return name.trim().toLocaleLowerCase(this.locale.locale()).startsWith(prefix);
			});
		} else return;
		event.preventDefault();
		target?.focus();
	}
}

@Component({
	selector: 'nx-bulk-widget',
	standalone: true,
	imports: messageTemplateImports,
	template: `<section>
		<header>
			<span>{{ label() }}</span
			><select
				[attr.aria-label]="
					'sdk.bulk.updateMode' | webuiMessage: '{label} update mode' : { label: label() }
				"
				[value]="mode()"
				(change)="setMode($any($event.target).value)"
			>
				<option value="keep">
					{{ 'app.sdk.projection-primitives.keep-b2de44' | webuiMessage: 'Keep' }}
				</option>
				<option value="replace">
					{{ 'app.sdk.projection-primitives.replace-127aef' | webuiMessage: 'Replace' }}
				</option>
				<option value="addValues" [disabled]="!multivalued()">
					{{ 'app.sdk.projection-primitives.add-values-6baf35' | webuiMessage: 'Add values' }}
				</option>
				<option value="remove" [disabled]="required()">
					{{ 'app.sdk.projection-primitives.remove-de63e1' | webuiMessage: 'Remove' }}
				</option>
			</select>
		</header>
		<ng-container *ngTemplateOutlet="content(); context: context()" /><small
			[class.error]="error()"
			[class.warning]="!error()"
			>{{ effectiveMessage() }}</small
		>
	</section>`,
	styles: `
		header {
			display: flex;
			justify-content: space-between;
		}
		small {
			display: block;
			min-height: 20px;
		}
		.warning {
			color: var(--nuxeo-text-default);
		}
		.error {
			color: var(--nuxeo-warn-text);
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NuxeoBulkWidgetComponent<T = unknown> {
	private readonly messages = inject(WebUiMessages);
	readonly label = input('');
	readonly value = input<T>(null as T);
	readonly required = input(false, { transform: booleanAttribute });
	readonly multivalued = input(false, { transform: booleanAttribute });
	readonly mode = model<BulkUpdateMode>('keep');
	readonly message = input('');
	readonly error = input(false, { transform: booleanAttribute });
	readonly content =
		contentChild<TemplateRef<ProjectionContext<T, NuxeoBulkWidgetComponent<T>>>>('content');
	readonly modeChanged = output<BulkUpdateMode>();
	context = (): ProjectionContext<T, NuxeoBulkWidgetComponent<T>> => ({
		$implicit: this.value(),
		host: this,
	});
	isModeAllowed(mode: string): mode is BulkUpdateMode {
		return (
			mode === 'keep' ||
			mode === 'replace' ||
			(mode === 'addValues' && this.multivalued()) ||
			(mode === 'remove' && !this.required())
		);
	}
	setMode(mode: string): boolean {
		if (!this.isModeAllowed(mode)) return false;
		this.mode.set(mode);
		this.modeChanged.emit(mode);
		return true;
	}
	validate(): boolean {
		return this.isModeAllowed(this.mode());
	}
	effectiveMessage(): string {
		if (this.message()) return this.message();
		if (this.required())
			return this.messages.format(
				'sdk.bulk.required',
				{},
				'A value is required when replacing this field.',
			);
		if (this.mode() === 'remove')
			return this.messages.format('sdk.bulk.cleared', {}, 'This field will be cleared.');
		return '';
	}
}

@Component({
	selector: 'nx-versions-list',
	standalone: true,
	imports: templateImports,
	template: `<section class="versions">
		<div><ng-container *ngTemplateOutlet="items(); context: context()" /></div>
		<footer><ng-container *ngTemplateOutlet="actions(); context: context()" /></footer>
	</section>`,
	styles: `
		.versions {
			display: inline-block;
			background: var(--nuxeo-box);
			color: var(--nuxeo-text-default);
		}
		footer {
			display: flex;
			justify-content: center;
			padding: 8px;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NuxeoVersionsListComponent<T = unknown> {
	readonly value = input<T>(null as T);
	readonly items =
		contentChild<TemplateRef<ProjectionContext<T, NuxeoVersionsListComponent<T>>>>('items');
	readonly actions =
		contentChild<TemplateRef<ProjectionContext<T, NuxeoVersionsListComponent<T>>>>('actions');
	context = (): ProjectionContext<T, NuxeoVersionsListComponent<T>> => ({
		$implicit: this.value(),
		host: this,
	});
}

@Component({
	selector: 'nx-acl-table',
	standalone: true,
	imports: templateImports,
	template: `<section>
		<ng-content />
		@if (empty()) {
			<ng-container *ngTemplateOutlet="emptyResult(); context: context()" />
		}
	</section>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NuxeoAclTableComponent<T = unknown> {
	readonly value = input<T>(null as T);
	readonly empty = input(false, { transform: booleanAttribute });
	readonly emptyResult =
		contentChild<TemplateRef<ProjectionContext<T, NuxeoAclTableComponent<T>>>>('emptyResult');
	context = (): ProjectionContext<T, NuxeoAclTableComponent<T>> => ({
		$implicit: this.value(),
		host: this,
	});
}
