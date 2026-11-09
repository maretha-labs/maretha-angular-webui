import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { DocumentHistoryService } from '../../helpers/document-history.service';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { HistoryComponent } from './history.component';

describe('HistoryComponent', () => {
	let component: HistoryComponent;
	let fixture: ComponentFixture<HistoryComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [HistoryComponent],
		}).compileComponents();
	});

	beforeEach(() => {
		fixture = TestBed.createComponent(HistoryComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create without a current document', () => {
		expect(component).toBeTruthy();
		expect(component.uid()).toBeNull();
	});
});

describe('HistoryComponent actions', () => {
	it('tracks the current document, opens entries and clears the history', async () => {
		const clear = jasmine.createSpy('clear');
		await TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				{
					provide: DocumentsManagerService,
					useValue: { documentFetched: signal({ uid: 'doc-1' }) },
				},
				{ provide: DocumentHistoryService, useValue: { documentHistory: signal([]), clear } },
			],
			imports: [HistoryComponent],
		}).compileComponents();
		const fixture = TestBed.createComponent(HistoryComponent);
		fixture.detectChanges();
		const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
		expect(fixture.componentInstance.uid()).toBe('doc-1');
		fixture.componentInstance.openDocument('doc-2');
		expect(navigate).toHaveBeenCalledWith(['./', 'doc-2']);
		fixture.componentInstance.clearHistory();
		expect(clear).toHaveBeenCalled();
	});
});
