import { TestBed } from '@angular/core/testing';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { MetadataPolicyService } from 'app/modules/explorer/helpers/metadata-policy.service';
import { PictureMetadataCardComponent } from './picture-metadata-card.component';

describe('PictureMetadataCardComponent', () => {
	const policy = {
		userPreferences: () => ({ hiddenSchemas: [] as string[], hiddenFields: [] as string[] }),
		canRead: (_document: unknown, _property: string) => true,
	};
	const picture = (content: unknown) => ({
		type: 'Picture',
		properties: {
			'picture:info': { width: 1922, height: 2883, format: 'JPEG', colorSpace: 'sRGB', depth: 8 },
			'file:content': content,
		},
	});

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders(), { provide: MetadataPolicyService, useValue: policy }],
			imports: [PictureMetadataCardComponent],
		}).compileComponents();
	});

	function entries(document: unknown) {
		const fixture = TestBed.createComponent(PictureMetadataCardComponent);
		fixture.componentRef.setInput('kind', 'Picture Info');
		fixture.componentRef.setInput('document', document);
		fixture.detectChanges();
		return fixture.componentInstance.entries();
	}

	it('lists the main file size as the stock Weight row after the picture info fields', () => {
		const rows = entries(picture({ length: 2558000, name: '897A4110.jpeg' }));
		expect(rows.map((row) => row.key)).toEqual([
			'dimensions',
			'format',
			'colorSpace',
			'depth',
			'weight',
		]);
		const weight = rows.find((row) => row.key === 'weight')!;
		expect(weight.label).toBe('Weight');
		expect(weight.value).toMatch(/^2\.44 /);
	});

	it('omits Weight without a main file or a readable file:content', () => {
		expect(entries(picture(null)).some((row) => row.key === 'weight')).toBeFalse();
		expect(entries(picture({ length: 0 })).some((row) => row.key === 'weight')).toBeFalse();
		policy.canRead = (_document, property) => property !== 'file:content';
		expect(entries(picture({ length: 10 })).some((row) => row.key === 'weight')).toBeFalse();
		policy.canRead = () => true;
	});
});
