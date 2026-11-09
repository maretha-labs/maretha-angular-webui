import { InjectionToken, Type } from '@angular/core';

export interface DirectoryLayoutContext {
	readonly directory: { readonly name: string; readonly schema: string; readonly parent?: string };
	readonly draft: {
		readonly id: string;
		readonly directoryName: string;
		readonly properties: Readonly<Record<string, unknown>>;
	};
	readonly isNew: boolean;
	readonly noEdit: boolean;
	readonly readOnly: boolean;
	readonly busy: boolean;
	readonly dirty: boolean;
	readonly commit: (draft: {
		id: string;
		directoryName: string;
		properties: Record<string, unknown>;
	}) => boolean;
	readonly cancel: () => boolean;
}

export interface DirectoryLayoutComponent {
	context: DirectoryLayoutContext;
}

export interface DirectoryLayoutRegistration {
	readonly schema: string;
	readonly component: Type<DirectoryLayoutComponent>;
}

export const DIRECTORY_LAYOUTS = new InjectionToken<readonly DirectoryLayoutRegistration[]>(
	'DIRECTORY_LAYOUTS',
);
export function provideDirectoryLayouts(...layouts: DirectoryLayoutRegistration[]) {
	return { provide: DIRECTORY_LAYOUTS, useValue: layouts, multi: true };
}
