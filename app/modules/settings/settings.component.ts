import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	Injector,
	ViewChild,
	afterNextRender,
	computed,
	effect,
	inject,
	untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import {
	AdministrationContext,
	DocumentViewChange,
	DocumentViewsComponent,
} from '@maretha/webui-sdk';
import { AuthService } from 'app/helpers/auth.service';
import { toApplicationUser } from 'app/helpers/application-user';
import { SidebarService } from 'app/helpers/sidebar.service';
import { hasAdministrationAccess } from 'app/helpers/administration-access';
import { environment } from 'environments/environment';
@Component({
	selector: 'nx-settings',
	templateUrl: './settings.component.html',
	styleUrls: ['./settings.component.scss'],
	imports: [DocumentViewsComponent, WebUiMessagePipe],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
	@ViewChild('mobileToggle') private mobileToggle?: ElementRef<HTMLButtonElement>;
	private readonly auth = inject(AuthService);
	private readonly sidebar = inject(SidebarService);
	private readonly route = inject(ActivatedRoute);
	private readonly router = inject(Router);
	private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
	private readonly injector = inject(Injector);
	private openedInitialNavigation = false;
	private returnToToggle = false;
	readonly drawerOpen = this.sidebar.drawerOpen;
	readonly mobileNavigationOpen = computed(
		() => this.drawerOpen() && this.sidebar.activeTab() === 'administration',
	);
	readonly selected = toSignal(
		this.route.queryParamMap.pipe(map((params) => params.get('admin'))),
		{ initialValue: this.route.snapshot.queryParamMap.get('admin') },
	);
	readonly context = computed<AdministrationContext>(() => {
		const user = this.auth.userInfo();
		return {
			document: null,
			noEdit: false,
			user: toApplicationUser(user),
			features: {
				retention: environment.addons.retention,
			},
		};
	});
	constructor() {
		effect(() => {
			const user = this.auth.userInfo();
			if (!hasAdministrationAccess(user) || this.openedInitialNavigation) return;
			this.openedInitialNavigation = true;
			untracked(() => {
				if (!window.matchMedia('(max-width: 720px)').matches)
					this.sidebar.selectTab('administration');
			});
		});
		effect(() => {
			if (!this.mobileNavigationOpen() && this.returnToToggle) {
				this.returnToToggle = false;
				queueMicrotask(() => this.mobileToggle?.nativeElement.focus());
			}
		});
	}
	get navigationPath(): string {
		return this.router.url.split(/[?#]/, 1)[0];
	}
	changed(change: DocumentViewChange): void {
		if (this.route.snapshot.queryParamMap.get('admin') !== change.viewId) {
			void this.router.navigate([], {
				relativeTo: this.route,
				queryParams: { admin: change.viewId },
				queryParamsHandling: 'merge',
				preserveFragment: true,
				replaceUrl: change.replaceUrl,
			});
		}
	}
	toggleMobileNavigation(): void {
		if (!hasAdministrationAccess(this.auth.userInfo())) return;
		this.returnToToggle = !this.mobileNavigationOpen();
		this.sidebar.toggleDrawer('administration');
		if (this.mobileNavigationOpen())
			afterNextRender(
				() => {
					if (!this.mobileNavigationOpen()) return;
					const drawer = this.element.nativeElement.ownerDocument.querySelector(
						'nx-administration-drawer',
					);
					(
						drawer?.querySelector<HTMLButtonElement>('button[aria-current="page"]') ??
						drawer?.querySelector<HTMLButtonElement>('button')
					)?.focus();
				},
				{ injector: this.injector },
			);
	}
}
