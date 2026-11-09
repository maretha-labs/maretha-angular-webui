import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { LocalizedUiError, WebUiMessages } from '@maretha/webui-sdk';
import { UsersAndGroupsFinderService } from 'app/helpers/users-and-groups-finder.service';
import { MetadataPolicyService } from '../../../explorer/helpers/metadata-policy.service';
import { MetadataPolicyComponent } from './metadata-policy.component';

describe('Metadata policy localized failure', () => {
	it('retains typed failure and dirty customer rules across locale changes', async () => {
		const failure = new LocalizedUiError(
			'metadata.changedBeforeSave',
			'Another administrator changed these settings. Reload before saving.',
		);
		TestBed.configureTestingModule({
			providers: [
				{ provide: HttpClient, useValue: {} },
				{ provide: UsersAndGroupsFinderService, useValue: {} },
				{
					provide: MetadataPolicyService,
					useValue: {
						loading: signal(false),
						error: signal(''),
						isAdministrator: () => true,
						policy: signal({ version: 1, rules: [] }),
						save: () => Promise.reject(failure),
					},
				},
			],
		});
		const component = TestBed.runInInjectionContext(() => new MetadataPolicyComponent());
		component.add();
		component.update(0, { documentType: 'customer.literal' });
		const before = component.rules();
		await component.save();
		expect(component.saveError()).toBe(failure.message);
		const messages = TestBed.inject(WebUiMessages);
		messages.register('metadata-test', {
			fr: { 'metadata.changedBeforeSave': 'Un autre administrateur a modifié ces paramètres.' },
		});
		messages.locale.set('fr');
		expect(component.saveError()).toBe('Un autre administrateur a modifié ces paramètres.');
		expect(component.rules()).toBe(before);
		expect(component.rules()[0].documentType).toBe('customer.literal');
		expect(component.dirty()).toBeTrue();
	});
});
