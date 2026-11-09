import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ResultsQueryScope } from '@maretha/webui-sdk';
import { environment } from 'environments/environment';
import { map } from 'rxjs';

export interface QueryBulkStatus {
	commandId: string;
	state: string;
	processed?: number;
	processingStart?: string;
	errorCount?: number;
}

/** The server-side BAF request. It always describes the whole captured provider result. */
export interface QueryBulkRequest {
	readonly scope: ResultsQueryScope;
	readonly operationId: 'Document.Trash' | 'Document.Untrash' | 'Document.Update';
	readonly parameters?: Readonly<Record<string, unknown>>;
	readonly excludeDocs?: readonly string[];
}

@Injectable({ providedIn: 'root' })
export class QueryBulkActionService {
	private readonly http = inject(HttpClient);
	run(request: QueryBulkRequest) {
		const scope = request.scope;
		const namedParameters = { ...scope.namedParameters };
		// The public BAF contract has a separate string-list parameter for quick filters. Earlier
		// default search snapshots stored it with named provider parameters, so preserve it exactly
		// while translating it to the operation shape.
		const quickFilters = namedParameters['quickFilters']
			? namedParameters['quickFilters'].split(',').filter(Boolean)
			: [];
		delete namedParameters['quickFilters'];
		return this.http
			.post<QueryBulkStatus>(
				`${environment.nuxeoUrl}/api/v1/automation/Bulk.RunAction`,
				{
					context: {},
					params: {
						action: 'automationUi',
						providerName: scope.providerName,
						repositoryName: scope.repository,
						queryParams: [...scope.queryParams],
						quickFilters,
						namedParameters,
						excludeDocs: [...(request.excludeDocs ?? [])],
						parameters: JSON.stringify({
							operationId: request.operationId,
							parameters: request.parameters ?? {},
						}),
					},
				},
				{ headers: new HttpHeaders({ 'X-NXRepository': scope.repository }) },
			)
			.pipe(
				// Bulk.RunAction returns a bulkStatus envelope. Keep accepting the unwrapped form because
				// older servers return it directly.
				map((response: any) => response?.value ?? response),
			);
	}
	trash(scope: ResultsQueryScope, excludeDocs: readonly string[] = []) {
		return this.run({ scope, operationId: 'Document.Trash', excludeDocs });
	}
	restore(scope: ResultsQueryScope, excludeDocs: readonly string[] = []) {
		return this.run({ scope, operationId: 'Document.Untrash', excludeDocs });
	}
	update(
		scope: ResultsQueryScope,
		parameters: Readonly<Record<string, unknown>>,
		excludeDocs: readonly string[] = [],
	) {
		return this.run({ scope, operationId: 'Document.Update', parameters, excludeDocs });
	}
	status(repository: string, commandId: string) {
		return this.http.get<QueryBulkStatus>(
			`${environment.nuxeoUrl}/api/v1/repo/${encodeURIComponent(repository)}/bulk/${encodeURIComponent(commandId)}`,
		);
	}
	abort(repository: string, commandId: string) {
		return this.http.put<QueryBulkStatus>(
			`${environment.nuxeoUrl}/api/v1/repo/${encodeURIComponent(repository)}/bulk/${encodeURIComponent(commandId)}/abort`,
			{},
		);
	}
}
