export interface RetentionRule {
	uid: string;
	creationDate?: Date;
	createdBy?: string;
	modificationDate?: Date;
	lastModifiedBy?: string;
	title: string;
	description?: string;
	applicationPolicy: RetentionRuleApplicationPolicy;
	docTypes?: string[]; // Only for RetentionRuleApplicationPolicy.Manual
	expression?: string; // Only for RetentionRuleApplicationPolicy.Auto
	// beginActions: string[];
	startingPointPolicy: RetentionRuleStartPolicy;
	startingPointEvent?: string; // Only for RetentionRuleStartPolicy.EventBased, from the RetentionEvent directory
	startingPointValue?: string; // Only for RetentionRuleStartPolicy.EventBased
	// startingPointExpression?: string;
	metadataXPath?: string; // Only for RetentionRuleStartPolicy.MetadataBased
	durationYears: number;
	durationMonths: number;
	durationDays: number;
	durationMillis: number;
	duration?: string;
	endActions: string[]; // From the RetentionEnd directory
	enabled: boolean;
}

export enum RetentionRuleApplicationPolicy {
	Auto = 'auto',
	Manual = 'manual',
}

export enum RetentionRuleStartPolicy {
	Immediate = 'immediate',
	EventBased = 'event_based',
	MetadataBased = 'metadata_based',
}
