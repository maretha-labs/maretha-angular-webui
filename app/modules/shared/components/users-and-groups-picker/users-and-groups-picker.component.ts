import { LocalizedSelectDirective } from 'app/directives/localized-select.directive';
import { suggestionLimits, suggestionTerms, WebUiMessagePipe } from '@maretha/webui-sdk';
import { SuggestionLimitsDirective } from 'app/directives/suggestion-limits.directive';
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
import { TranslateService } from '@ngx-translate/core';
import { UsersAndGroupsFinderService } from 'app/helpers/users-and-groups-finder.service';
import {
	Observable,
	Subject,
	catchError,
	concat,
	distinctUntilChanged,
	of,
	switchMap,
	takeUntil,
	tap,
} from 'rxjs';
import {
	NgSelectComponent,
	NgOptgroupTemplateDirective,
	NgOptionTemplateDirective,
	NgLabelTemplateDirective,
	NgMultiLabelTemplateDirective,
} from '@ng-select/ng-select';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { AsyncPipe } from '@angular/common';

@Component({
	selector: 'nx-users-and-groups-picker',
	templateUrl: './users-and-groups-picker.component.html',
	styleUrls: ['./users-and-groups-picker.component.scss'],
	providers: [
		{
			provide: NG_VALUE_ACCESSOR,
			useExisting: forwardRef(() => UsersAndGroupsPickerComponent),
			multi: true,
		},
		{
			provide: NG_VALIDATORS,
			useExisting: forwardRef(() => UsersAndGroupsPickerComponent),
			multi: true,
		},
	],
	imports: [
		LocalizedSelectDirective,
		NgSelectComponent,
		FormsModule,
		ReactiveFormsModule,
		NgOptgroupTemplateDirective,
		NgOptionTemplateDirective,
		FontAwesomeModule,
		NgLabelTemplateDirective,
		NgMultiLabelTemplateDirective,
		TooltipDirective,
		AsyncPipe,
		WebUiMessagePipe,
		SuggestionLimitsDirective,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersAndGroupsPickerComponent
	implements ControlValueAccessor, Validator, OnInit, OnDestroy
{
	private destroy$ = new Subject<void>();
	private initialLoad = false;

	@Input() findUsers = true;
	@Input() findGroups = true;
	@Input() id: string = (Math.random() + 1).toString(36).substring(2, 5);
	@Input() label: string | null = null;
	@Input() multiple = false;
	@Input() clearable = true;
	@Input() addTag = false;
	@Input() placeholder = '';
	@Input() required = false;
	@Input() bindValue = 'prefixed_id';
	@Input() bindLabel = 'displayLabel';

	items$: Observable<any>;
	loading = false;
	searchTerm$ = new Subject<string>();
	formControl = new FormControl<any>(undefined);
	private readonly field = inject(new HostAttributeToken('formControlName'), { optional: true });
	readonly limits = suggestionLimits('user', () => this.field);

	constructor(
		private readonly usersAndGroupsFinderService: UsersAndGroupsFinderService,
		private readonly translate: TranslateService,
	) {
		this.items$ = concat(
			of([]), // default items
			this.searchTerm$.pipe(
				distinctUntilChanged(),
				suggestionTerms(this.limits),
				tap((term) => (this.loading = term !== null)),
				switchMap((term) => {
					if (term === null) return of([]);
					let observable: Observable<any>;

					if (this.findUsers && this.findGroups)
						observable = usersAndGroupsFinderService.find(term);
					else if (!this.findUsers && this.findGroups)
						observable = usersAndGroupsFinderService.findGroups(term);
					else observable = usersAndGroupsFinderService.findUsers(term);

					return observable.pipe(
						catchError(() => of([])), // empty list on error
						tap(() => (this.loading = false)),
						// map((entries: any) => this.mapDirectoryEntries(entries))
					);
				}),
			),
		);
	}

	get findOnlyUsers() {
		return !this.findGroups && this.findUsers;
	}

	fetchEntries(_event: any) {
		if (this.initialLoad) return;

		this.searchTerm$.next('');
		this.initialLoad = true;
	}

	// private mapDirectoryEntries(entries: any)
	// {
	// 	const result = entries.map((entry: any) =>
	// 	{
	// 		return entry.children
	// 			? entry.children.map((child: any) => this.getMappedDirectoryEntry(child))
	// 			: this.getMappedDirectoryEntry(entry);
	// 	});

	// 	return [].concat.apply([], result);
	// }

	// private getMappedDirectoryEntry(entry: any)
	// {
	// 	return {
	// 		id: entry.id,
	// 		parent: entry.properties?.parent,
	// 		label: this.getDirectoryEntryLabel(entry.id, this.entryTranslationPrefix),
	// 		obsolete: entry.obsolete,
	// 		ordering: entry.ordering,
	// 		parentLabel: this.getDirectoryEntryLabel(entry.properties?.parent, this.groupTranslationPrefix)
	// 	};
	// }

	// private getDirectoryEntryLabel(label: string, prefix?: string)
	// {
	// 	if (!label)
	// 		return label;

	// 	if (prefix)
	// 		prefix = `${prefix}.`;

	// 	return label.startsWith('label.directories.')
	// 		? this.translate.instant(`directories.${prefix}${label.substring('label.directories.'.length).trim().replace(/[\W_]+/g, this.entryKeyTrim)}`)
	// 		: this.translate.instant(`directories.${prefix}${label.trim().replace(/[\W_]+/g, this.entryKeyTrim)}`);
	// }

	trackByFn = (item: any) => item.id;

	compareFn = (dropdownOption: any, selectedValue: any) =>
		dropdownOption[this.bindValue] ? dropdownOption[this.bindValue] === selectedValue : false;

	// propagates value changes to parent form control when nested form changes
	registerOnChange(fn: any): void {
		this.formControl.valueChanges
			.pipe(
				takeUntil(this.destroy$),
				// map(x =>
				// {
				// 	if (!Array.isArray(x))
				// 		return x.id;

				// 	return x.map(y =>
				// 	{
				// 		return Object.prototype.toString.call(y) === '[object String]'
				// 			? y
				// 			: y.parent ? `${y.parent}/${y.id}` : y.id;
				// 	});
				// })
			)
			.subscribe(fn);
	}

	// marks parent form control as touched when nested form changes
	registerOnTouched(fn: any): void {
		this.formControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(fn);
	}

	// disabled nested form when parent form control is disabled
	setDisabledState(isDisabled: boolean): void {
		if (isDisabled) this.formControl.disable();
		else this.formControl.enable();
	}

	// writes value to nested form when value is set to parent form control
	writeValue(value: any): void {
		// if (value)
		// 	value = Array.isArray(value) ? this.mapDirectoryEntries(value) : this.getMappedDirectoryEntry(value);

		this.formControl.patchValue(value, { emitEvent: false });
	}

	// propagates validation errors from nested form to parent form control
	validate(_control: AbstractControl): ValidationErrors | null {
		return this.formControl.valid ? null : { natureSubjectsCoverageExpiration: true };
	}

	ngOnInit() {
		if (!this.findUsers && !this.findGroups)
			throw 'nx-users-and-groups: You must specify what to search for';
	}

	// needed to unsubscribe from observables when component is destroyed
	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
	}
}
