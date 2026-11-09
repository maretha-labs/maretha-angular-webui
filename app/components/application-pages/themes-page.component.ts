import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PageContext, WebUiThemePickerComponent } from '@maretha/webui-sdk';

@Component({
	selector: 'nx-themes-page',
	imports: [WebUiThemePickerComponent, WebUiMessagePipe],
	template:
		"<h1>{{ 'app.components.themes-page.themes-08df78' | webuiMessage:'Themes' }}</h1><nx-webui-theme-picker />",
	styles: `
		:host {
			display: flex;
			flex-direction: column;
			min-height: 0;
			color: var(--nuxeo-text-default);
		}
		h1 {
			display: flex;
			align-items: center;
			height: 53px;
			flex-shrink: 0;
			padding-inline: 16px 76px;
			margin: 0;
			color: inherit;
			font-size: 14px;
			font-weight: 400;
			background: var(--nuxeo-box);
			box-shadow: 0 2px 4px #0002;
		}
		nx-webui-theme-picker {
			padding: 24px;
			overflow: auto;
		}
		@media (max-width: 720px) {
			h1 {
				padding-inline-start: 56px;
			}
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemesPageComponent {
	readonly context = input.required<PageContext>();
}
