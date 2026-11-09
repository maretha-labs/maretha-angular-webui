import type { ApplicationUser } from '@maretha/webui-sdk';
import { UserInfo } from 'app/models/user-info';

export function toApplicationUser(user: UserInfo | null): ApplicationUser | null {
	return user
		? {
				id: user.id,
				displayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.id,
				isAdministrator: user.isAdministrator === true,
				groups: (user.groups ?? []).map((group) => group.id),
			}
		: null;
}
