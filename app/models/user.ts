import { UserGroup } from './user-group';

export interface User {
	id: string;
	email?: string;
	firstName?: string;
	lastName?: string;
	name?: string;
	company?: string;
	isAdministrator?: boolean;
	isAnonymous?: boolean;
	groups: UserGroup[];
	permissions?: [];
}
