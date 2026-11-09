import { LocalizedSelectDirective } from 'app/directives/localized-select.directive';
import {
	suggestionLimits,
	suggestionTerms,
	WebUiLocale,
	WebUiMessagePipe,
	WebUiMessages,
} from '@maretha/webui-sdk';
import { SuggestionLimitsDirective } from 'app/directives/suggestion-limits.directive';
import { nativeDirectoryLabel } from '../../../helpers/document-comparison-resolver.service';
import {
	Component,
	Input,
	OnDestroy,
	OnInit,
	forwardRef,
	ChangeDetectionStrategy,
	HostAttributeToken,
	inject,
} from '@angular/core';
import {
	AbstractControl,
	ControlValueAccessor,
	FormControl,
	NG_VALIDATORS,
	NG_VALUE_ACCESSOR,
	ValidationErrors,
	Validator,
	FormsModule,
	ReactiveFormsModule,
} from '@angular/forms';
import { toObservable } from '@angular/core/rxjs-interop';
import { AutomationsService } from 'app/modules/explorer/helpers/automations.service';
import {
	Observable,
	Subject,
	catchError,
	concat,
	combineLatest,
	shareReplay,
	distinctUntilChanged,
	map,
	of,
	switchMap,
	takeUntil,
	tap,
} from 'rxjs';
import {
	NgSelectComponent,
	NgOptgroupTemplateDirective,
	NgLabelTemplateDirective,
	NgMultiLabelTemplateDirective,
} from '@ng-select/ng-select';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { AsyncPipe } from '@angular/common';

@Component({
	selector: 'nx-vocabulary',
	templateUrl: './vocabulary.component.html',
	styleUrls: ['./vocabulary.component.scss'],
	providers: [
		{
			provide: NG_VALUE_ACCESSOR,
			useExisting: forwardRef(() => VocabularyComponent),
			multi: true,
		},
		{
			provide: NG_VALIDATORS,
			useExisting: forwardRef(() => VocabularyComponent),
			multi: true,
		},
	],
	imports: [
		LocalizedSelectDirective,
		NgSelectComponent,
		FormsModule,
		ReactiveFormsModule,
		NgOptgroupTemplateDirective,
		NgLabelTemplateDirective,
		NgMultiLabelTemplateDirective,
		TooltipDirective,
		AsyncPipe,
		WebUiMessagePipe,
		SuggestionLimitsDirective,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VocabularyComponent implements ControlValueAccessor, Validator, OnInit, OnDestroy {
	private destroy$ = new Subject<void>();
	private readonly locale = inject(WebUiLocale);
	private readonly messages = inject(WebUiMessages);
	private readonly field = inject(new HostAttributeToken('formControlName'), { optional: true });
	readonly limits = suggestionLimits('directory', () => this.field);
	private initialLoad = false;

	@Input() directoryName: string | undefined;
	@Input() id: string = (Math.random() + 1).toString(36).substring(2, 5);
	@Input() label: string | null = null;
	@Input() multiple = false;
	@Input() clearable = true;
	@Input() addTag = false;
	@Input() placeholder = '';
	@Input() entryTranslationPrefix = '';
	@Input() groupTranslationPrefix = '';
	@Input() entryKeyTrim = '_';
	@Input() dbl10n = true;

	vocabularyEntries$: Observable<any>;
	loading = false;
	searchTerm$ = new Subject<string>();
	formControl = new FormControl<any>(undefined);

	// --------------------------------------------------------------------------------------------------
	constructor(private readonly automationsService: AutomationsService) {
		this.vocabularyEntries$ = concat(
			of([]),
			combineLatest([
				this.searchTerm$.pipe(distinctUntilChanged(), suggestionTerms(this.limits)),
				toObservable(this.locale.locale),
			]).pipe(
				switchMap(([term, locale]) => {
					this.loading = term !== null;
					if (term === null) return of([]);
					return automationsService
						.getDirectoryEntries(this.directoryName!, term, this.dbl10n, true, locale)
						.pipe(
							catchError(() => of([])),
							map((entries: any) => this.mapDirectoryEntries(entries)),
							tap((entries) => {
								this.loading = false;
								this.refreshSelectedLabels(entries);
							}),
						);
				}),
				takeUntil(this.destroy$),
				shareReplay({ bufferSize: 1, refCount: true }),
			),
		);
	}

	// --------------------------------------------------------------------------------------------------
	fetchEntries(_event: any) {
		if (this.initialLoad) return;

		this.searchTerm$.next('');
		this.initialLoad = true;
	}

	// --------------------------------------------------------------------------------------------------
	private mapDirectoryEntries(entries: any) {
		const result = entries.map((entry: any) => {
			return entry.children
				? entry.children.map((child: any) =>
						this.getMappedDirectoryEntry({
							...child,
							parent: child.parent ?? child.properties?.parent ?? entry.id,
							parentLabel: child.parentLabel ?? entry.displayLabel ?? entry.label ?? entry.id,
						}),
					)
				: this.getMappedDirectoryEntry(entry);
		});

		return ([] as any[]).concat(...result);
	}

	// --------------------------------------------------------------------------------------------------
	private getMappedDirectoryEntry(entry: any) {
		if (typeof entry === 'string') return { id: entry, label: entry };
		return {
			...entry,
			id: entry.id,
			parent: entry.parent ?? entry.properties?.parent,
			label: nativeDirectoryLabel(
				entry.displayLabel ?? entry.label ?? entry.properties?.label ?? entry.id,
				this.directoryName,
				this.messages,
			),
			parentLabel: nativeDirectoryLabel(entry.parentLabel ?? '', this.directoryName, this.messages),
		};
	}

	private refreshSelectedLabels(entries: any[]): void {
		const current = this.formControl.value;
		if (!current) return;
		const refresh = (value: any) => {
			const id = typeof value === 'string' ? value : value.id;
			const parent = typeof value === 'string' ? undefined : value.parent;
			return entries.find((entry) => entry.id === id && entry.parent === parent) ?? value;
		};
		this.formControl.patchValue(Array.isArray(current) ? current.map(refresh) : refresh(current), {
			emitEvent: false,
		});
	}

	// --------------------------------------------------------------------------------------------------
	trackByFn = (item: any) => item.id;

	// --------------------------------------------------------------------------------------------------
	// propagates value changes to parent form control when nested form changes
	registerOnChange(fn: any): void {
		this.formControl.valueChanges
			.pipe(
				takeUntil(this.destroy$),
				map((x) => {
					if (!Array.isArray(x)) return x.id;

					return x.map((y) => {
						return Object.prototype.toString.call(y) === '[object String]'
							? y
							: y.parent
								? `${y.parent}/${y.id}`
								: y.id;
					});
				}),
			)
			.subscribe(fn);
	}

	// --------------------------------------------------------------------------------------------------
	// marks parent form control as touched when nested form changes
	registerOnTouched(fn: any): void {
		this.formControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(fn);
	}

	// --------------------------------------------------------------------------------------------------
	// disabled nested form when parent form control is disabled
	setDisabledState(isDisabled: boolean): void {
		if (isDisabled) this.formControl.disable();
		else this.formControl.enable();
	}

	// --------------------------------------------------------------------------------------------------
	// writes value to nested form when value is set to parent form control
	writeValue(value: any): void {
		if (value)
			value = Array.isArray(value)
				? this.mapDirectoryEntries(value)
				: this.getMappedDirectoryEntry(value);

		this.formControl.patchValue(value, { emitEvent: false });
	}

	// --------------------------------------------------------------------------------------------------
	// propagates validation errors from nested form to parent form control
	validate(_control: AbstractControl): ValidationErrors | null {
		return this.formControl.valid ? null : { natureSubjectsCoverageExpiration: true };
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit() {
		if (!this.directoryName) throw 'VocabularyComponent: You must specify the directory name';
	}

	// --------------------------------------------------------------------------------------------------
	// needed to unsubscribe from observables when component is destroyed
	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
	}
}
