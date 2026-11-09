import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { User } from 'app/models/user';
import { environment } from 'environments/environment';
import { map } from 'rxjs';

/** The create-user invitation path uses User.Invite, not passwordless user creation. */
@Injectable({ providedIn: 'root' })
export class UserInvitationService {
	private readonly http = inject(HttpClient);
	invite(user: User) {
		const entity = {
			'entity-type': 'user',
			id: '',
			properties: {
				username: user.id,
				firstName: user.firstName,
				lastName: user.lastName,
				company: user.company,
				email: user.email,
				groups: user.groups.map((group) => group.id),
			},
		};
		return this.http
			.post(`${environment.nuxeoUrl}/api/v1/automation/User.Invite`, {
				input: entity,
				params: {},
				context: {},
			})
			.pipe(map(() => ({ ...entity, id: user.id })));
	}
}
