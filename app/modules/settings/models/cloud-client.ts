export interface CloudClient {
	id: string;
	name: string;
	secret: string;
	redirectURIs: string[];
	isAutoGrant: boolean;
	isEnabled: boolean;
}
