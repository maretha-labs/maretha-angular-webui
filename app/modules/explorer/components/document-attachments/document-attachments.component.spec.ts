import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ExtensionRegistry } from '@maretha/webui-sdk';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { provideDefaultFileActions } from './default-file-actions';
import { DocumentAttachmentsComponent } from './document-attachments.component';

describe('DocumentAttachmentsComponent', () => {
	let component: DocumentAttachmentsComponent;
	let fixture: ComponentFixture<DocumentAttachmentsComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders(), provideDefaultFileActions()],
			imports: [DocumentAttachmentsComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(DocumentAttachmentsComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('keeps same-name files distinct and targets replacement/removal by identity', () => {
		const first = new File(['one'], 'same.txt');
		const second = new File(['two'], 'same.txt');
		const emit = spyOn(component.attachmentsUpdated, 'emit');
		component.attachFiles([first, second]);
		expect(component.attachments).toEqual([first, second]);
		expect(emit).toHaveBeenCalledWith([first, second]);
		const stale = component.blobContext(second);
		const replacement = new File(['three'], 'same.txt');
		stale.replace?.(replacement);
		expect(component.attachments).toEqual([first, replacement]);
		stale.remove?.();
		expect(component.attachments).toEqual([first, replacement]);
		component.removeAttachment('same.txt');
		expect(component.attachments).toEqual([first, replacement]);
		component.blobContext(replacement).remove?.();
		expect(component.attachments).toEqual([first]);
		expect(component.blobContext(first).xpath).toBe('files:files/0/file');
	});
	it('should create', () => {
		expect(component).toBeTruthy();
	});
	it('keeps blob contribution contexts stable and guards stale callbacks after disabling', () => {
		const attachment = { name: 'file.txt', digest: 'stored', data: '/blob', length: 10 };
		component.attachments = [attachment];
		const context = component.blobContext(attachment);
		expect(component.blobContext(attachment)).toBe(context);
		component.disabled = true;
		context.remove?.();
		context.replace?.(new File(['new'], 'new.txt'));
		component.filesDropped([new File(['new'], 'new.txt')]);
		expect(component.attachments).toEqual([attachment]);
		expect(component.blobContext(attachment).noEdit).toBeTrue();
	});
	it('mounts the replacement picker and updates draft attachments through contributed callbacks', async () => {
		const attachment = { name: 'file.txt', digest: 'stored', data: '/blob', length: 10 };
		await Promise.all(
			TestBed.inject(ExtensionRegistry)
				.resolve('BLOB_ACTIONS', component.blobContext(attachment))
				.items.map((item) => item.loadComponent?.()),
		);
		fixture.componentRef.setInput('attachments', [attachment]);
		fixture.detectChanges();
		await fixture.whenStable();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('nx-blob-action'))
			.withContext(fixture.nativeElement.innerHTML)
			.toBeTruthy();
		const replacement = new File(['new'], 'new.txt');
		component.blobContext(attachment).replace?.(replacement);
		expect(component.attachments).toEqual([replacement]);
		component.blobContext(replacement).remove?.();
		expect(component.attachments).toEqual([]);
	});
});
