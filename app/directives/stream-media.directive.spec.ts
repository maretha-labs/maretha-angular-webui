import { WebUiMessages } from '@maretha/webui-sdk';
import { LocalizedUiError } from '@maretha/webui-sdk';
import { Component } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { BlobDeliveryGrant, BlobDeliveryService } from 'app/helpers/blob-delivery.service';
import { StreamMediaDirective } from './stream-media.directive';

@Component({
	imports: [StreamMediaDirective],
	template:
		'<video [nxStreamMedia]="blob" [streamDocument]="document" (streamError)="error = $event"></video>',
})
class Host {
	blob = { digest: 'first', data: '/never-fetch-this' };
	document = { uid: 'one', properties: { 'file:content': this.blob } };
	error = '';
}

describe('Native media grant lifecycle', () => {
	let service: {
		createGrant: jasmine.Spy;
		renewGrant: jasmine.Spy;
		revokeGrant: jasmine.Spy;
		sessionEnded$: Subject<void>;
	};
	const grant = (): BlobDeliveryGrant => ({
		id: 'first',
		url: 'https://app.example/content/first',
		expiresAt: Date.now() + 300_000,
	});
	beforeEach(() => {
		service = {
			createGrant: jasmine.createSpy().and.callFake(() => of(grant())),
			renewGrant: jasmine.createSpy().and.callFake(() => of(grant())),
			revokeGrant: jasmine.createSpy().and.returnValue(of(undefined)),
			sessionEnded$: new Subject<void>(),
		};
		spyOn(HTMLMediaElement.prototype, 'load');
		spyOn(HTMLMediaElement.prototype, 'pause');
		TestBed.configureTestingModule({
			imports: [Host],
			providers: [{ provide: BlobDeliveryService, useValue: service }],
		});
	});
	it('sets the native URL without a Blob download and renews without resetting playback', fakeAsync(() => {
		const f = TestBed.createComponent(Host);
		f.detectChanges();
		const video = f.nativeElement.querySelector('video') as HTMLVideoElement;
		expect(video.src).toBe(grant().url);
		expect(service.createGrant).toHaveBeenCalledWith(
			{ repository: 'default', documentId: 'one', xpath: 'file:content', expectedDigest: 'first' },
			'inline',
		);
		const calls = (video.load as jasmine.Spy).calls.count();
		tick(240_000);
		expect(service.renewGrant).toHaveBeenCalledTimes(1);
		expect((video.load as jasmine.Spy).calls.count()).toBe(calls);
		f.destroy();
		expect(service.revokeGrant).toHaveBeenCalledTimes(1);
	}));
	it('revokes replaced media and acquires the next persisted target', fakeAsync(() => {
		const f = TestBed.createComponent(Host);
		f.detectChanges();
		f.componentInstance.blob = { digest: 'second', data: '/still-not-a-request' };
		f.componentInstance.document = {
			uid: 'two',
			properties: { 'file:content': f.componentInstance.blob },
		};
		f.changeDetectorRef.markForCheck();
		f.detectChanges();
		expect(service.revokeGrant).toHaveBeenCalledTimes(1);
		expect(service.createGrant.calls.mostRecent().args[0].documentId).toBe('two');
		f.destroy();
	}));
	it('cancels a pending grant when media is destroyed', () => {
		const pending = new Subject<BlobDeliveryGrant>();
		service.createGrant.and.returnValue(pending);
		const f = TestBed.createComponent(Host);
		f.detectChanges();
		expect(pending.observed).toBeTrue();
		f.destroy();
		expect(pending.observed).toBeFalse();
	});
	it('stops and clears media when renewal fails instead of falling back to a Blob GET', fakeAsync(() => {
		service.renewGrant.and.returnValue(throwError(() => new Error('Permission revoked')));
		const f = TestBed.createComponent(Host);
		f.detectChanges();
		tick(240_000);
		expect(f.nativeElement.querySelector('video').hasAttribute('src')).toBeFalse();
		expect(f.componentInstance.error).toBe('Permission revoked');
		expect(service.revokeGrant).toHaveBeenCalledTimes(1);
		f.destroy();
	}));
	it('clears active playback and renewal on logout without a separate per-grant delete race', fakeAsync(() => {
		const f = TestBed.createComponent(Host);
		f.detectChanges();
		service.sessionEnded$.next();
		expect(f.nativeElement.querySelector('video').hasAttribute('src')).toBeFalse();
		tick(300_000);
		expect(service.renewGrant).not.toHaveBeenCalled();
		expect(service.revokeGrant).not.toHaveBeenCalled();
		f.destroy();
	}));
	it('rejects unsaved targets and displays the reason', () => {
		const f = TestBed.createComponent(Host);
		f.componentInstance.document = {
			uid: 'one',
			properties: { 'file:content': { digest: 'other', data: '/different' } },
		};
		f.detectChanges();
		expect(service.createGrant).not.toHaveBeenCalled();
		expect(f.componentInstance.error).toContain('identified uniquely');
		f.destroy();
	});
	it('retires native media URLs, subscriptions and renewal timers across repeated mounts', fakeAsync(() => {
		const objectUrl = spyOn(URL, 'createObjectURL');
		for (let cycle = 0; cycle < 32; cycle++) {
			const fixture = TestBed.createComponent(Host);
			fixture.detectChanges();
			const media = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
			expect(media.src).toBe(grant().url);
			fixture.destroy();
			expect(media.hasAttribute('src')).toBeFalse();
			expect(service.sessionEnded$.observed).toBeFalse();
		}
		tick(600_000);
		expect(service.createGrant).toHaveBeenCalledTimes(32);
		expect(service.revokeGrant).toHaveBeenCalledTimes(32);
		expect(service.renewGrant).not.toHaveBeenCalled();
		expect(objectUrl).not.toHaveBeenCalled();
	}));
	it('updates identified media failures after a locale switch without another grant request', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', { fr: { 'test.denied': 'Accès refusé à {name}.' } });
		service.createGrant.and.returnValue(
			throwError(
				() =>
					new LocalizedUiError('test.denied', 'Access denied to {name}.', {
						name: 'Customer movie',
					}),
			),
		);
		const fixture = TestBed.createComponent(Host);
		fixture.detectChanges();
		expect(fixture.componentInstance.error).toBe('Access denied to Customer movie.');
		messages.locale.set('fr');
		fixture.detectChanges();
		expect(fixture.componentInstance.error).toBe('Accès refusé à Customer movie.');
		expect(service.createGrant).toHaveBeenCalledTimes(1);
		expect(service.renewGrant).not.toHaveBeenCalled();
		fixture.destroy();
	});
	it('keeps active media and caller error text stable across locale changes', () => {
		const fixture = TestBed.createComponent(Host);
		fixture.detectChanges();
		const media = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
		const loads = (media.load as jasmine.Spy).calls.count();
		media.currentTime = 42;
		media.playbackRate = 1.5;
		TestBed.inject(WebUiMessages).locale.set('ro');
		fixture.detectChanges();
		expect(media.currentTime).toBe(42);
		expect(media.playbackRate).toBe(1.5);
		expect((media.load as jasmine.Spy).calls.count()).toBe(loads);
		expect(service.createGrant).toHaveBeenCalledTimes(1);
		fixture.destroy();
		service.createGrant.and.returnValue(throwError(() => new Error('Customer policy')));
		const failed = TestBed.createComponent(Host);
		failed.detectChanges();
		TestBed.inject(WebUiMessages).locale.set('fr');
		failed.detectChanges();
		expect(failed.componentInstance.error).toBe('Customer policy');
		failed.destroy();
	});
});
