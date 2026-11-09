import { User } from './user';

export interface UserGroup {
	id: string;
	name: string;
	description?: string;
	users: User[];
	permissions?: [];
}
