import { WebUiMessages } from 'app/extensions/webui-messages';
import { WebUiLocale } from 'app/extensions/i18n/webui-locale';
import { loadWebUiCatalog } from 'app/helpers/webui-message-catalog';
import { TestBed } from '@angular/core/testing';
import { ResultsToolbarContext } from '@maretha/webui-sdk';
import { SearchSelectionActions } from './search-selection-actions.service';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

describe('SearchSelectionActions localized confirmation', () => {
	it('uses the active catalog and keeps a declined operation idle', async () => {
		TestBed.configureTestingModule({});
		TestBed.inject(WebUiMessages).register('selection-test', {
			es: await loadWebUiCatalog('es'),
			ar: await loadWebUiCatalog('ar'),
		});
		const locale = TestBed.inject(WebUiLocale);
		const confirm = spyOn(TestBed.inject(ConfirmDialogService), 'confirm').and.resolveTo(false);
		const busy = jasmine.createSpy('busy');
		const context = {
			busy: false,
			availableCommands: ['trash'],
			selectedDocuments: [],
			setBusy: busy,
		} as unknown as ResultsToolbarContext;
		const actions = TestBed.inject(SearchSelectionActions);
		locale.locale.set('es');
		expect(await actions.execute('trash', context, () => true)).toEqual([]);
		// The in-app dialog localizes stock's keyed question itself.
		expect(confirm).toHaveBeenCalledWith(
			jasmine.objectContaining({ titleKey: 'deleteDocumentsButton.confirm.deleteDocuments' }),
		);
		locale.locale.set('ar');
		await actions.execute('trash', context, () => true);
		expect(confirm).toHaveBeenCalledTimes(2);
		expect(busy).not.toHaveBeenCalled();
	});
});
