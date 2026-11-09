import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { Component, computed, ChangeDetectionStrategy } from '@angular/core';
import { AuthService } from 'app/helpers/auth.service';

@Component({
	selector: 'nx-home',
	imports: [WebUiMessagePipe],
	templateUrl: './home.component.html',
	styleUrls: ['./home.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
	readonly userName = computed(() => {
		const x = this.authService.userInfo();
		return x?.firstName ? `${x.firstName} ${x.lastName}` : x?.id;
	});

	// --------------------------------------------------------------------------------------------------
	constructor(private readonly authService: AuthService) {}
}
