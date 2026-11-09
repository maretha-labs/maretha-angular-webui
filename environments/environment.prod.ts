export const environment = {
	production: true,
	nuxeoUrl: (window as any)['__env']['nuxeoUrl'],
	webAppUrl: (window as any)['__env']['webAppUrl'],
	authClientId: (window as any)['__env']['authClientId'],
	applicationId: ((window as any)['__env']['applicationId'] ?? null) as string | null,
	addons: {
		retention: (window as any)['__env']['addons']?.retention ?? false,
	},
	dashboardStatisticsDocumentTypes: (window as any)['__env']['dashboardStatisticsDocumentTypes'],
};
