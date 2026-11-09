import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'size' })
export class SizePipe implements PipeTransform {
	transform(input: any, args?: any): any {
		const isNagtiveValues = input < 0;

		if (
			Number.isNaN(input) ||
			(input < 1000 && input >= 0) ||
			!this.isNumeric(input) ||
			(input < 0 && input > -1000)
		) {
			if (!!args && this.isNumeric(input) && !(input < 0) && input != 0) return input.toFixed(args);

			return input;
		}

		const suffixes = ['K', 'M', 'B', 'T', 'P', 'E'];

		if (!isNagtiveValues) {
			const exp = Math.floor(Math.log(input) / Math.log(1000));

			return (input / Math.pow(1000, exp)).toFixed(args) + suffixes[exp - 1];
		}

		input = input * -1;

		const exp = Math.floor(Math.log(input) / Math.log(1000));

		return ((input * -1) / Math.pow(1000, exp)).toFixed(args) + suffixes[exp - 1];
	}

	// --------------------------------------------------------------------------------------------------
	isNumeric(value: any): boolean {
		if (value < 0) value = value * -1;

		if (/^-{0,1}\d+$/.test(value)) return true;

		if (/^\d+\.\d+$/.test(value)) return true;

		return false;
	}
}
