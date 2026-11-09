import { Component, ChangeDetectionStrategy } from '@angular/core';
import { NotFoundComponent } from '../not-found/not-found.component';

/** Access the user lacks: the stock error page at 403 (Permission Denied). */
@Component({
	imports: [NotFoundComponent],
	selector: 'nx-unauthorized',
	templateUrl: './unauthorized.component.html',
	styleUrls: ['./unauthorized.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnauthorizedComponent {}
