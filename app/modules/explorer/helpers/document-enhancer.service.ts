import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from 'app/helpers/auth.service';
import { UserInfo } from 'app/models/user-info';
import { environment } from 'environments/environment';

@Injectable({
	providedIn: 'root',
})
export class DocumentEnhancerService {
	private readonly apiUrl = `${environment.nuxeoUrl}/api/v1`;
	private currentUser: UserInfo | null = null;
	private documentTypes: Record<string, any> | null = null;

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly httpClient: HttpClient,
		private readonly authService: AuthService,
	) {
		this.authService.userInfoUpdated$.subscribe((x) => (this.currentUser = x));
	}

	// --------------------------------------------------------------------------------------------------
	setDocumentCustomProperties(document: any) {
		if (!document) return;

		document.properties = document.properties || {};

		// Keep our properties in a separate namespace
		document.ng = {
			facets: document.facets?.reduce(
				(a: any, v: string) => ({ ...a, [`${this.toCamelCase(v)}`]: true }),
				{},
			),
			schemas: document.schemas?.reduce((a: any, v: any) => ({ ...a, [v.prefix]: v.name }), {}),
			canBrowse: document.contextParameters?.permissions
				? document.contextParameters?.permissions?.includes('Browse')
				: true,
			isFolder: document.facets?.includes('Folderish'),
			canPublish:
				document.facets?.includes('Publishable') && !document.isTrashed && !document.isRecord,
			canNotify: Array.isArray(document.contextParameters?.subscribedNotifications)
				? document.contextParameters.subscribedNotifications.length > 0
				: !!document.properties['notif:notifications']?.some((x: any) =>
						x.subscribers.includes(`user:${this.currentUser?.id}`),
					),
			versionable: document.facets?.includes('Versionable'),
			canAddToCollection:
				document.facets?.includes('NotCollectionMember') === false &&
				document.facets?.includes('SystemDocument') === false,
			canCreate: document.facets?.includes('HiddenInCreation') !== true,
			canWrite:
				document.facets?.includes('HiddenInCreation') === false ||
				document.contextParameters?.permissions?.includes('Write') ||
				document.contextParameters?.permissions?.includes('ReadWrite'),
			isSelected: false,
			fullPath: document.contextParameters?.breadcrumb?.entries
				?.map((x: any) => x.title)
				.join(' → '),
			exportUrlForZip:
				document.contextParameters?.renditions?.find((x: any) => x.name === 'zipTreeExport')?.url ||
				document.contextParameters?.renditions?.find((x: any) => x.name === 'zipExport')?.url,
			exportUrlForXml: document.contextParameters?.renditions?.find(
				(x: any) => x.name === 'xmlExport',
			)?.url,
			exportUrlForPdf: document.contextParameters?.renditions?.find((x: any) => x.name === 'pdf')
				?.url,
			exportUrlForThumbnail: document.contextParameters?.renditions?.find(
				(x: any) => x.name === 'thumbnail',
			)?.url,
			subTypes: document.contextParameters?.subtypes
				? document.contextParameters.subtypes
						.filter((y: any) => y.facets.indexOf('HiddenInCreation') < 0 && y.type !== 'Collection')
						.map((y: any) => {
							return {
								name: y.type,
								label: y.type,
								facets: y.facets?.reduce(
									(a: any, v: string) => ({ ...a, [`${this.toCamelCase(v)}`]: true }),
									{},
								),
								isFolder: y.facets?.includes('Folderish'),
								canPublish: y.facets?.includes('Publishable'),
								canCreate: y.facets?.includes('HiddenInCreation') !== true,
								canWrite:
									y.facets?.includes('HiddenInCreation') === false ||
									y.permissions?.includes('Write') ||
									y.permissions?.includes('ReadWrite'),
							};
						})
						.sort((a: any, b: any) => a.label.localeCompare(b.label))
				: [],
			collections: document.properties['collectionMember:collectionIds']?.reduce(
				(a: any, v: string) => ({ ...a, [v]: true }),
				{},
			),
			lockedBy: document.lockOwner,
			canUpload: document.schemas?.findIndex((x: any) => x.prefix === 'file') >= 0,
		};

		document.ng.canCreateSnapshot =
			!document.isRecord && !document.isVersion && document.ng.versionable && document.isCheckedOut;

		document.ng.createdOn = document.properties['dc:created'];

		const creatorFirstName = document.properties['dc:creator']?.properties?.firstName;
		const creatorLastName = document.properties['dc:creator']?.properties?.lastName;

		document.ng.createdBy =
			creatorFirstName || creatorLastName
				? `${creatorFirstName} ${creatorLastName}`
				: document.properties['dc:creator']?.id || document.properties['dc:creator'];

		const lastContributorFirstName =
			document.properties['dc:lastContributor']?.properties?.firstName;
		const lastContributorLastName = document.properties['dc:lastContributor']?.properties?.lastName;

		document.ng.lastModifiedBy =
			lastContributorFirstName || lastContributorLastName
				? `${lastContributorFirstName} ${lastContributorLastName}`
				: document.properties['dc:lastContributor']?.id ||
					document.properties['dc:lastContributor'];

		document.ng.attachment = document.properties['file:content'];
		document.ng.attachments =
			document.properties['files:files']?.map((x: any) => x.file)?.filter((x: any) => x != null) ||
			[];

		if (document.ng.attachment) {
			const fileNameParts = document.ng.attachment.name?.split('.');
			if (fileNameParts.length > 1)
				document.ng.attachmentType = fileNameParts[fileNameParts.length - 1];
		}

		if (document.properties['uid:major_version'] || document.properties['uid:minor_version'])
			document.ng.version = `${document.properties['uid:major_version']}.${document.properties['uid:minor_version']}`;

		if (document.contextParameters?.runningWorkflows)
			document.ng.pendingTasks = document.contextParameters?.pendingTasks.reduce(
				(a: any, v: any) => {
					a[v.workflowInstanceId] = a[v.workflowInstanceId] || [];
					a[v.workflowInstanceId].push(v);

					return a;
				},
				{},
			);
		else document.ng.pendingTasks = {};

		return document;
	}

	// --------------------------------------------------------------------------------------------------
	/** The server's type catalogue, fetched when an action first needs it and kept for the session. */
	async loadDocumentTypes(): Promise<Record<string, any>> {
		if (!this.documentTypes) {
			const response = await firstValueFrom(
				this.httpClient.get<{ doctypes?: Record<string, any> }>(`${this.apiUrl}/config/types`),
			);
			this.documentTypes = response?.doctypes ?? {};
		}
		return this.documentTypes;
	}

	// --------------------------------------------------------------------------------------------------
	private toCamelCase = (input: string) =>
		input
			.replace(/(?:^\w|[A-Z]|\b\w)/g, (ltr, idx) =>
				idx === 0 ? ltr.toLowerCase() : ltr.toUpperCase(),
			)
			.replace(/\s+/g, '');
}
