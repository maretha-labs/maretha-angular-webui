import {
	DestroyRef,
	EnvironmentProviders,
	inject,
	makeEnvironmentProviders,
	provideEnvironmentInitializer,
} from '@angular/core';
import { WebUiExtension } from './contribution';
import { ExtensionRegistry } from './extension-registry.service';

export function provideWebUiExtensions(
	...extensions: readonly WebUiExtension[]
): EnvironmentProviders {
	return makeEnvironmentProviders(
		extensions.map((extension) =>
			provideEnvironmentInitializer(() => {
				const dispose = inject(ExtensionRegistry).register(extension);
				inject(DestroyRef).onDestroy(dispose);
			}),
		),
	);
}
