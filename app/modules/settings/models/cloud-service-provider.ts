export interface CloudServiceProvider {
	serviceName: string;
	description?: string;
	clientId?: string;
	clientSecret?: string;
	authorizationServerURL?: string;
	tokenServerURL?: string;
	userAuthorizationURL?: string;
	userId?: string;
	authorizationURL?: string;
	scopes?: string[];
	isEnabled: boolean;
	isAuthorized?: boolean;
	isAvailable?: boolean;
}
