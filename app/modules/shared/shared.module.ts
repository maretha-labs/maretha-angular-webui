import {
	WebUiDatePipe,
	WebUiNumberPipe,
	WebUiCurrencyPipe,
	WebUiPercentPipe,
} from '@maretha/webui-sdk';
import { registerApplicationIcons } from '../../application-icons';
import { NgModule, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { ScrollingModule as ExperimentalScrollingModule } from '@angular/cdk-experimental/scrolling';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { DragDropModule } from '@angular/cdk/drag-drop';

import { BsDropdownModule } from 'ngx-bootstrap/dropdown';
import { PopoverModule } from 'ngx-bootstrap/popover';
import { TooltipConfig, TooltipModule } from 'ngx-bootstrap/tooltip';
import { ModalModule } from 'ngx-bootstrap/modal';
import { TabsModule } from 'ngx-bootstrap/tabs';
import { ButtonsModule } from 'ngx-bootstrap/buttons';
import { AccordionModule } from 'ngx-bootstrap/accordion';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { CarouselModule } from 'ngx-bootstrap/carousel';
import { ProgressbarModule } from 'ngx-bootstrap/progressbar';
import { AlertModule } from 'ngx-bootstrap/alert';

import { NgxJsonViewerModule } from 'ngx-json-viewer';

import { TranslateModule } from '@ngx-translate/core';
import { NgxTranslateCutModule } from 'ngx-translate-cut';

import { TimeagoFormatter, TimeagoIntl, TimeagoModule } from 'ngx-timeago';
import { LocalizedTimeagoFormatter } from 'app/helpers/localized-timeago-formatter';
import { LocalizedDatepicker } from 'app/helpers/localized-datepicker.service';
import { LocalizedSelectDirective } from 'app/directives/localized-select.directive';

import { NgSelectModule } from '@ng-select/ng-select';

// https://github.com/FortAwesome/angular-fontawesome/blob/master/docs/upgrading/0.4.0-0.5.0.md
import { FontAwesomeModule, FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { AutosizeModule } from 'ngx-autosize';
import { NgxDocViewerModule } from 'ngx-doc-viewer';
import { AutofocusDirective } from 'app/directives/autofocus.directive';
import { LazyLoadDirective } from 'app/directives/lazy-load.directive';
import { HttpInterceptorService } from 'app/helpers/http-interceptor.service';
import { OrdinalPipe } from 'app/pipes/ordinal.pipe';
import { UnescapePipe } from 'app/pipes/unescape.pipe';
import { ConfirmationDialogComponent } from './components/confirmation-dialog/confirmation-dialog.component';
import { InputDialogComponent } from './components/input-dialog/input-dialog.component';
import { ClickOutsideDirective } from 'app/directives/click-outside.directive';
import { FileSizePipe } from 'app/pipes/file-size.pipe';
import { FileUploadComponent } from './components/file-upload/file-upload.component';
import { DragAndDropDirective } from 'app/directives/drag-and-drop.directive';
import { PlaceholderTemplateDirective } from 'app/directives/placeholder-template.directive';
import { PressAndHoldButtonComponent } from './components/press-and-hold-button/press-and-hold-button.component';
import { DurationPipe } from 'app/pipes/duration.pipe';
import { UsersAndGroupsPickerComponent } from './components/users-and-groups-picker/users-and-groups-picker.component';
import { DocumentIconAndTitleComponent } from './components/document-icon-and-title/document-icon-and-title.component';
import { SizePipe } from '../../pipes/size.pipe';
import { CollapsibleComponent } from './components/collapsible/collapsible.component';
import { FooterComponent } from './components/footer/footer.component';

@NgModule({
	imports: [
		CommonModule,
		WebUiDatePipe,
		WebUiNumberPipe,
		WebUiCurrencyPipe,
		WebUiPercentPipe,
		RouterModule,
		FormsModule,
		ReactiveFormsModule,
		ScrollingModule,
		ExperimentalScrollingModule,
		DragDropModule,
		FontAwesomeModule,
		TranslateModule,
		NgxJsonViewerModule,
		NgxDocViewerModule,
		BsDropdownModule,
		PopoverModule,
		TooltipModule,
		ModalModule,
		TabsModule,
		ButtonsModule,
		AccordionModule,
		BsDatepickerModule,
		CarouselModule,
		ProgressbarModule,
		AlertModule,
		TimeagoModule.forRoot({
			intl: { provide: TimeagoIntl, useClass: TimeagoIntl },
			formatter: { provide: TimeagoFormatter, useClass: LocalizedTimeagoFormatter },
		}),
		NgSelectModule,
		LocalizedSelectDirective,
		NgxTranslateCutModule.forRoot({}),
		AutosizeModule,
		InputDialogComponent,
		ConfirmationDialogComponent,
		AutofocusDirective,
		LazyLoadDirective,
		ClickOutsideDirective,
		UnescapePipe,
		OrdinalPipe,
		FileSizePipe,
		DurationPipe,
		FileUploadComponent,
		DragAndDropDirective,
		PlaceholderTemplateDirective,
		PressAndHoldButtonComponent,
		UsersAndGroupsPickerComponent,
		DocumentIconAndTitleComponent,
		CollapsibleComponent,
		SizePipe,
		FooterComponent,
	],
	exports: [
		CommonModule,
		WebUiDatePipe,
		WebUiNumberPipe,
		WebUiCurrencyPipe,
		WebUiPercentPipe,
		FormsModule,
		ReactiveFormsModule,
		ScrollingModule,
		ExperimentalScrollingModule,
		DragDropModule,
		FontAwesomeModule,
		ButtonsModule,
		AccordionModule,
		BsDropdownModule,
		TooltipModule,
		PopoverModule,
		ModalModule,
		BsDatepickerModule,
		CarouselModule,
		ProgressbarModule,
		AlertModule,
		TabsModule,
		TranslateModule,
		NgxJsonViewerModule,
		NgxDocViewerModule,
		InputDialogComponent,
		ConfirmationDialogComponent,
		AutofocusDirective,
		LazyLoadDirective,
		ClickOutsideDirective,
		NgSelectModule,
		LocalizedSelectDirective,
		UnescapePipe,
		OrdinalPipe,
		FileSizePipe,
		DurationPipe,
		SizePipe,
		FileUploadComponent,
		DragAndDropDirective,
		PlaceholderTemplateDirective,
		PressAndHoldButtonComponent,
		NgxTranslateCutModule,
		TimeagoModule,
		AutosizeModule,
		UsersAndGroupsPickerComponent,
		DocumentIconAndTitleComponent,
		CollapsibleComponent,
		FooterComponent,
	],
	providers: [
		{
			provide: HTTP_INTERCEPTORS,
			useClass: HttpInterceptorService,
			multi: true,
		},
		{
			provide: TooltipConfig,
			useValue: Object.assign(new TooltipConfig(), {
				placement: 'top',
				container: 'body',
				adaptivePosition: false,
				delay: 500,
				triggers: 'hover click',
			}),
		},
	],
})
export class SharedModule {
	constructor(library: FaIconLibrary) {
		inject(LocalizedDatepicker);
		registerApplicationIcons(library);
	}
}
