(function (window) {
	window.__env = window.__env || {};

	window.__env.nuxeoUrl = `${window.location.origin}/nuxeo`;
	window.__env.webAppUrl = `${window.location.origin}/nuxeo/ng/#`;
	window.__env.authClientId = 'maretha-angular-webui';
	window.__env.applicationId = 'maretha-angular-webui';
	window.__env.dashboardStatisticsDocumentTypes = ['Audio', 'Video', 'File'];
	window.__env.addons = {
		retention: false,
	};
})(this);
