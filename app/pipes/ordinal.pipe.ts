import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'ordinal' })
export class OrdinalPipe implements PipeTransform {
	private ordinals: string[] = ['th', 'st', 'nd', 'rd'];

	transform(value: number, keepNumber = true): string {
		const v = value % 100;
		return (
			(keepNumber ? value : '') +
			(this.ordinals[(v - 20) % 10] || this.ordinals[v] || this.ordinals[0])
		);
	}
}
