import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AgGridAngular } from 'ag-grid-angular';
import { firstValueFrom } from 'rxjs';
import { ResultsProjectionComponent, WebUiMessages } from '@maretha/webui-sdk';
import { WebUiLocale } from 'app/extensions/i18n/webui-locale';
import { REPOSITORY_SEARCH } from '../../helpers/repository-search-definitions';
import { searchViewComponents } from '../../helpers/search-view-components';
import { resultFieldColumns } from 'app/modules/explorer/helpers/scoped-result-columns';

describe('Default search flags cell', () => {
	it('loads through the table hook and draws the stock flag icons with translated tooltips', async () => {
		const definition = REPOSITORY_SEARCH.default;
		const flags = definition.views.table!.columns.find((column) => column.id === 'flags')!;
		const fixture = TestBed.createComponent(ResultsProjectionComponent);
		fixture.nativeElement.style.cssText = 'width:800px;height:600px';
		document.body.append(fixture.nativeElement);
		fixture.componentRef.setInput('mode', 'table');
		fixture.componentRef.setInput('columns', [{ ...flags, hidden: false }]);
		fixture.componentRef.setInput('components', searchViewComponents(definition, 'table'));
		fixture.componentRef.setInput('rows', [
			{
				uid: 'one',
				isRecord: true,
				hasLegalHold: true,
				contextParameters: { favorites: { isFavorite: true } },
				facets: ['ColdStorage'],
				properties: { 'coldstorage:coldContent': {} },
			},
		]);
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		// Stock: one iron-icon per flag with its nuxeo-tooltip, no text in the cell.
		const flagIcons = () =>
			fixture.debugElement
				.queryAll(By.css('nx-default-search-flags-cell .flag'))
				.map((flag) => [
					flag.query(By.css('nx-webui-icon')).componentInstance.name(),
					flag.nativeElement.getAttribute('aria-label'),
					flag.nativeElement.getAttribute('title'),
				]);
		const label = () =>
			fixture.nativeElement.querySelector('nx-default-search-flags-cell').textContent.trim();
		expect(flagIcons()).toEqual([
			['nuxeo:retain', 'Under retention', 'Under retention'],
			['nuxeo:hold', 'Under legal hold', 'Under legal hold'],
			['nuxeo:favorites', 'Under favorites', 'Under favorites'],
			['nuxeo:coldstorage', 'Under cold storage', 'Under cold storage'],
		]);
		expect(label()).toBe('');
		const initialGrid = fixture.debugElement.query(By.directive(AgGridAngular)).componentInstance;
		TestBed.inject(WebUiMessages).register('test.flags', {
			es: {
				'documentContentView.datatable.flags.retention': 'Bajo retención',
				'documentContentView.datatable.flags.legalHold': 'Bajo retención legal',
				'documentContentView.datatable.flags.favorite': 'En favoritos',
				'documentContentView.datatable.flags.coldStorage': 'En almacenamiento frío',
			},
		});
		TestBed.inject(WebUiLocale).locale.set('es');
		fixture.detectChanges();
		const translatedGrid = fixture.debugElement.query(By.directive(AgGridAngular))
			.componentInstance as AgGridAngular;
		expect(translatedGrid).not.toBe(initialGrid);
		// Locale is a grid creation option: wait for the replacement's documented render event,
		// not just Angular stability, before inspecting its dynamically created cell component.
		await firstValueFrom(translatedGrid.firstDataRendered);
		await fixture.whenStable();
		fixture.detectChanges();
		expect(flagIcons().map(([, name]) => name)).toEqual([
			'Bajo retención',
			'Bajo retención legal',
			'En favoritos',
			'En almacenamiento frío',
		]);
		fixture.componentRef.setInput('rows', [{ uid: 'two', properties: {} }]);
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(flagIcons()).toEqual([]);
		// Flags are computed presentation, not a schema field in the existing CSV export mapping.
		expect(resultFieldColumns([{ ...flags, hidden: false }])).toEqual([]);
		fixture.destroy();
	});
});
