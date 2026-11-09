import { Directive, TemplateRef } from '@angular/core';

@Directive({ selector: '[nxPlaceholderTemplate]' })
export class PlaceholderTemplateDirective {
	constructor(public template: TemplateRef<any>) {}
}
