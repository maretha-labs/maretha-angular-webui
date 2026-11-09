import { WebUiMessages } from '@maretha/webui-sdk';
import { environment } from 'environments/environment';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RetentionRuleEditorComponent } from './retention-rule-editor.component';

describe('RetentionRuleEditorComponent', () => {
	const enabled = environment.addons.retention;
	beforeEach(() => (environment.addons.retention = true));
	afterEach(() => (environment.addons.retention = enabled));

	let component: RetentionRuleEditorComponent;
	let fixture: ComponentFixture<RetentionRuleEditorComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [RetentionRuleEditorComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(RetentionRuleEditorComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
	it('changes built-in option labels without changing saved form tokens or customer text', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('retention-locale', {
			fr: {
				'app.settingsShared.automatic-d461a4': 'Automatique',
				'app.settingsShared.immediate-ed6cb0': 'Immédiate',
			},
		});
		component.editorForm!.patchValue({
			title: 'Save.customer.literal',
			applicationPolicy: 'manual',
			startingPointPolicy: 'immediate',
		});
		component.editorForm!.markAsDirty();
		const before = component.editorForm!.getRawValue();
		messages.locale.set('fr');
		fixture.detectChanges();
		expect(component.applicationPolicies[0].label).toBe('Automatique');
		expect(component.startingPointPolicies[0].label).toBe('Immédiate');
		expect(component.editorForm!.getRawValue()).toEqual(before);
		expect(component.editorForm!.dirty).toBeTrue();
	});
});
