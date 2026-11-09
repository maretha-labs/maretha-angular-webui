import {
	EnvironmentProviders,
	Injectable,
	InjectionToken,
	Type,
	inject,
	makeEnvironmentProviders,
} from '@angular/core';
import { DocumentLayoutContext, DocumentLayoutMode } from './document-layout-registry';
import { LayoutField } from './document-layout';
import { ResultsSelectionContext } from './results';
import { ResultsToolbarContext } from './toolbar';

/** Extra fields share the native form's validation, permissions and save transaction. */
export interface DocumentFieldExtension {
	readonly id: string;
	readonly documentTypes?: readonly string[];
	readonly modes?: readonly DocumentLayoutMode[];
	readonly schema: string;
	readonly fields: readonly LayoutField[];
}
const DOCUMENT_FIELD_EXTENSIONS = new InjectionToken<readonly DocumentFieldExtension[]>(
	'Document field extensions',
);

export function provideDocumentFieldExtensions(
	...definitions: DocumentFieldExtension[]
): EnvironmentProviders {
	return makeEnvironmentProviders(
		definitions.map((definition) => ({
			provide: DOCUMENT_FIELD_EXTENSIONS,
			multi: true,
			useValue: definition,
		})),
	);
}

@Injectable({ providedIn: 'root' })
export class DocumentFieldExtensionRegistry {
	private readonly definitions = inject(DOCUMENT_FIELD_EXTENSIONS, { optional: true }) ?? [];
	candidates(context: DocumentLayoutContext): readonly DocumentFieldExtension[] {
		return this.definitions.filter(
			(definition) =>
				(!definition.documentTypes ||
					definition.documentTypes.some(
						(type) => type.toLowerCase() === context.documentType?.toLowerCase(),
					)) &&
				(!definition.modes || definition.modes.includes(context.mode)),
		);
	}
	attached(context: DocumentLayoutContext): readonly DocumentFieldExtension[] {
		const schemas = context.document?.['schemas'];
		const properties = context.document?.['properties'];
		return this.candidates(context).filter(
			(definition) =>
				(Array.isArray(schemas) &&
					schemas.some((schema) =>
						typeof schema === 'string'
							? schema === definition.schema
							: schema?.name === definition.schema,
					)) ||
				(!!properties &&
					typeof properties === 'object' &&
					Object.keys(properties).some((property) =>
						definition.fields.some((field) => field.property === property),
					)),
		);
	}
	fields(context: DocumentLayoutContext): readonly LayoutField[] {
		return [
			...new Map(
				this.attached(context)
					.flatMap((definition) => definition.fields)
					.map((field) => [field.property, field]),
			).values(),
		];
	}
}

/**
 * Host-owned authenticated preview, accepting `document` and optional `noEdit` inputs.
 * An optional `mainContentTemplate: TemplateRef<unknown>` prepends content inside
 * the preview column while preserving native blob controls and metadata alongside it.
 */
export const DOCUMENT_CONTENT_RENDERER = new InjectionToken<Type<unknown>>(
	'Document content renderer',
);

export interface ResultsCommandGateway {
	available(context: ResultsSelectionContext): readonly string[];
	execute(
		command: string,
		context: ResultsToolbarContext,
		current: () => boolean,
	): Promise<readonly string[]>;
}
export const RESULTS_COMMAND_GATEWAY = new InjectionToken<ResultsCommandGateway>(
	'Results command gateway',
);
