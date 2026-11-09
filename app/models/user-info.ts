import { User } from './user';

export interface UserInfo extends User {
	phoneNumber?: string;
	avatar?: string;
	birthDate?: Date;
	gender?: boolean;
	locale?: string;
	language?: string;
	dateFormat?: string;
	timeFormat?: string;
	timeZone?: string;
}
