import { ApplicationPageComponent } from 'app/components/application-pages/application-page.component';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { SharedModule } from 'app/modules/shared/shared.module';

import { CloudComponent } from './components/cloud/cloud.component';
import { ContentManagementComponent } from './components/content-management/content-management.component';
import { UsersAndGroupsComponent } from './components/users-and-groups/users-and-groups.component';
import { VocabulariesComponent } from './components/vocabularies/vocabularies.component';

import { SettingsComponent } from './settings.component';
import { CloudServiceProviderEditorComponent } from './components/cloud-service-provider-editor/cloud-service-provider-editor.component';
import { CloudClientEditorComponent } from './components/cloud-client-editor/cloud-client-editor.component';
import { CloudApplicationEditorComponent } from './components/cloud-application-editor/cloud-application-editor.component';
import { CloudAccountEditorComponent } from './components/cloud-account-editor/cloud-account-editor.component';
import { UserAndGroupEditorComponent } from './components/user-and-group-editor/user-and-group-editor.component';
import { UserAndGroupPermissionsComponent } from './components/user-and-group-permissions/user-and-group-permissions.component';
import { RetentionRulesComponent } from './components/retention-rules/retention-rules.component';
import { RetentionRuleEditorComponent } from './components/retention-rule-editor/retention-rule-editor.component';
import { RetentionRuleLogComponent } from './components/retention-rule-log/retention-rule-log.component';
import { RetentionRulePickerComponent } from './components/retention-rule-picker/retention-rule-picker.component';
import { AnalyticsComponent } from './components/analytics/analytics.component';
import { MetadataPolicyComponent } from './components/metadata-policy/metadata-policy.component';

@NgModule({
	imports: [
		SharedModule,
		RouterModule.forChild([
			{
				path: '',
				component: ApplicationPageComponent,
				data: { pageId: 'administration' },
			},
		]),
		SettingsComponent,
		UsersAndGroupsComponent,
		CloudComponent,
		ContentManagementComponent,
		VocabulariesComponent,
		CloudServiceProviderEditorComponent,
		CloudClientEditorComponent,
		CloudApplicationEditorComponent,
		CloudAccountEditorComponent,
		UserAndGroupEditorComponent,
		UserAndGroupPermissionsComponent,
		RetentionRulesComponent,
		RetentionRuleEditorComponent,
		RetentionRuleLogComponent,
		RetentionRulePickerComponent,
		AnalyticsComponent,
		MetadataPolicyComponent,
	],
})
export class SettingsModule {}
