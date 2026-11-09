import { ElementRef, SimpleChange } from '@angular/core';
import { of } from 'rxjs';
import { LazyCacheService } from 'app/helpers/lazy-cache.service';
import { LazyLoadDirective } from './lazy-load.directive';

describe('LazyLoadDirective', () => {
	let image: HTMLImageElement;
	let directive: LazyLoadDirective;
	let cache: jasmine.SpyObj<LazyCacheService>;
	let observer: jasmine.SpyObj<IntersectionObserver>;
	let observerFactory: jasmine.Spy;

	beforeEach(() => {
		image = document.createElement('img');
		cache = jasmine.createSpyObj<LazyCacheService>('LazyCacheService', ['getBlob']);
		cache.getBlob.and.returnValue(of('blob:cached-image'));
		observer = jasmine.createSpyObj<IntersectionObserver>('IntersectionObserver', [
			'observe',
			'disconnect',
		]);
		observerFactory = spyOn(window, 'IntersectionObserver').and.returnValue(observer);
		directive = new LazyLoadDirective(new ElementRef(image), cache);
		directive.src = '/thumbnail';
	});

	it('waits for intersection before fetching and announces the loaded media', () => {
		const willLoad = spyOn(directive.willLoadMedia, 'emit');
		const didLoad = spyOn(directive.didLoadMedia, 'emit');
		directive.ngAfterViewInit();
		const intersect: IntersectionObserverCallback = observerFactory.calls.mostRecent().args[0];

		expect(observer.observe).toHaveBeenCalledWith(image);
		intersect([{ isIntersecting: false } as IntersectionObserverEntry], observer);
		expect(cache.getBlob).not.toHaveBeenCalled();
		intersect([{ isIntersecting: true } as IntersectionObserverEntry], observer);

		expect(cache.getBlob).toHaveBeenCalledWith('/thumbnail', false, true);
		expect(directive.srcAttr).toBe('blob:cached-image');
		expect(willLoad).toHaveBeenCalledTimes(1);
		expect(didLoad).not.toHaveBeenCalled();
		image.dispatchEvent(new Event('load'));
		expect(didLoad).toHaveBeenCalledTimes(1);
		expect(observer.disconnect).toHaveBeenCalledTimes(1);
	});

	it('does not start loading when the source is cleared', () => {
		directive.src = undefined;
		directive.ngOnChanges({ src: new SimpleChange('/thumbnail', undefined, false) });

		expect(observerFactory).not.toHaveBeenCalled();
		expect(cache.getBlob).not.toHaveBeenCalled();
	});

	it('reports an image load failure', () => {
		const failed = spyOn(directive.loadError, 'emit');
		directive.ngAfterViewInit();

		image.dispatchEvent(new Event('error'));

		expect(failed).toHaveBeenCalledWith(image);
	});
});
