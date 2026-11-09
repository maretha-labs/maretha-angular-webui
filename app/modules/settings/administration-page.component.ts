import { ChangeDetectionStrategy, Component, input, Type, viewChild } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { AdministrationContext, GuardedView, ViewDeparture } from '@maretha/webui-sdk';
import { UsersAndGroupsComponent } from './components/users-and-groups/users-and-groups.component';
import { CloudComponent } from './components/cloud/cloud.component';
import { RetentionRulesComponent } from './components/retention-rules/retention-rules.component';
import { AnalyticsWorkspaceComponent } from './components/analytics/analytics-workspace.component';
import { VocabulariesComponent } from './components/vocabularies/vocabularies.component';
import { AuditComponent } from './components/audit/audit.component';
type PageKind = 'users' | 'cloud' | 'retention' | 'analytics' | 'directories' | 'audit';
const pages: Record<PageKind, Type<unknown>> = {
	users: UsersAndGroupsComponent,
	cloud: CloudComponent,
	retention: RetentionRulesComponent,
	analytics: AnalyticsWorkspaceComponent,
	directories: VocabulariesComponent,
	audit: AuditComponent,
};
@Component({
	selector: 'nx-administration-page',
	imports: [NgComponentOutlet, AnalyticsWorkspaceComponent, VocabulariesComponent],
	template: `@if (kind() === 'analytics') {
			<nx-analytics-workspace [context]="context()" />
		} @else if (kind() === 'directories') {
			<nx-vocabularies [noEdit]="context().noEdit" />
		} @else {
			<ng-container [ngComponentOutlet]="pages[kind()]" />
		}`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdministrationPageComponent implements GuardedView {
	readonly context = input.required<AdministrationContext>();
	readonly kind = input.required<PageKind>();
	readonly pages = pages;
	readonly vocabularies = viewChild(VocabulariesComponent);
	canDeactivate(departure: ViewDeparture): boolean | Promise<boolean> {
		return this.vocabularies()?.canDeactivate(departure) ?? true;
	}
	hasPendingChanges(): boolean {
		return this.vocabularies()?.hasPendingChanges() ?? false;
	}
}
