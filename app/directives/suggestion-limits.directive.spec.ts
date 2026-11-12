import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SuggestionLimits } from '@maretha/webui-sdk';
import { NgSelectComponent } from '@ng-select/ng-select';
import { Subject } from 'rxjs';
import { SuggestionLimitsDirective } from './suggestion-limits.directive';

@Component({
	imports: [NgSelectComponent, SuggestionLimitsDirective],
	changeDetection: ChangeDetectionStrategy.Eager,
	template: `<ng-select [items]="[]" [typeahead]="terms" [nxSuggestionLimits]="limits()" />`,
})
class HostComponent {
	readonly terms = new Subject<string>();
	readonly limits = signal<SuggestionLimits>({ minChars: 3, pauseMs: 300 });
}

describe('SuggestionLimitsDirective', () => {
	it('asks for more characters and sends shortened terms so old results clear', () => {
		const fixture = TestBed.createComponent(HostComponent);
		fixture.detectChanges();
		const select = fixture.debugElement.children[0].injector.get(NgSelectComponent);
		expect(select.minTermLength()).toBe(3);
		expect(select.typeToSearchText()).toBe('Please enter 3 or more characters');
		const sent: string[] = [];
		fixture.componentInstance.terms.subscribe((term) => sent.push(term));
		select.filter('adm');
		select.filter('ad');
		select.filter('');
		expect(sent).toEqual(['adm', 'ad', '']);
		fixture.componentInstance.limits.set({ minChars: 0, pauseMs: 0 });
		fixture.detectChanges();
		expect(select.minTermLength()).toBe(0);
		expect(select.typeToSearchText()).toBe('');
		select.filter('');
		expect(sent).toEqual(['adm', 'ad', '', '']);
	});
});
