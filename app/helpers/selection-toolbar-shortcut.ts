import { DestroyRef, ElementRef, inject, signal } from '@angular/core';

/**
 * The stock selection toolbar's shortcut, for a component that renders the bar matching
 * `barSelector`: Command/Ctrl + . moves focus into the bar, and the bar's hint stays visible until
 * the bar itself is used (the shortcut, or a pointer inside it). Call from an injection context.
 */
export function selectionToolbarShortcut(barSelector: string) {
	const host = inject<ElementRef<HTMLElement>>(ElementRef, { optional: true });
	const keyboardHint = signal(true);
	const modifierKey: 'Command' | 'Ctrl' = /mac/i.test(
		(navigator as any).userAgentData?.platform ?? navigator.platform ?? navigator.userAgent,
	)
		? 'Command'
		: 'Ctrl';
	const onKeydown = (event: KeyboardEvent) => {
		const modifier = modifierKey === 'Command' ? event.metaKey : event.ctrlKey;
		if (!modifier || (event.key !== '.' && event.code !== 'Period')) return;
		const bar = (host?.nativeElement ?? document).querySelector<HTMLElement>(barSelector);
		if (!bar || bar.contains(document.activeElement)) return;
		event.preventDefault();
		keyboardHint.set(false);
		bar.querySelector<HTMLElement>('a, button, [tabindex]:not([tabindex="-1"])')?.focus();
	};
	const onPointer = (event: Event) => {
		if ((event.target as Element | null)?.closest?.(barSelector)) keyboardHint.set(false);
	};
	document.addEventListener('keydown', onKeydown);
	document.addEventListener('mousedown', onPointer);
	document.addEventListener('touchstart', onPointer);
	inject(DestroyRef).onDestroy(() => {
		document.removeEventListener('keydown', onKeydown);
		document.removeEventListener('mousedown', onPointer);
		document.removeEventListener('touchstart', onPointer);
	});
	return { keyboardHint, modifierKey } as const;
}
