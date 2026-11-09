export interface NxDocument {
	uid: string;
	type: string | NxDocumentType;
	state: string | NxDocumentState;
	properties: any;
	contextParameters: any;
	facets: string[];
}

export enum NxDocumentType {}

export enum NxDocumentState {}
