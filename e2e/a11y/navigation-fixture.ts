import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	inject,
	input,
	signal,
} from '@angular/core';
import {
	DocumentViewsComponent,
	DocumentViewContext,
	ExtensionRegistry,
	GuardedView,
	defineDocumentView,
	NuxeoTreeComponent,
	NuxeoTreeNodeComponent,
} from '@maretha/webui-sdk';

const arabic = new URLSearchParams(location.search).get('locale') === 'ar';
@Component({
	selector: 'nx-fixture-draft',
	template: `<h2>{{ arabic ? 'مسودة العميل' : 'Customer draft' }}</h2>
		<label for="view-draft">{{ arabic ? 'عنوان المسودة' : 'Draft title' }}</label>
		<input id="view-draft" [value]="draft()" (input)="draft.set($any($event.target).value)" />
		<label
			><input
				type="checkbox"
				[checked]="block()"
				(change)="block.set($any($event.target).checked)"
				data-block-departure
			/>{{ arabic ? 'منع مغادرة المسودة' : 'Prevent leaving draft' }}</label
		>`,
	styles: ':host{display:block;color:var(--nuxeo-text-default)} h2{color:inherit}',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
class DraftPage implements GuardedView {
	readonly context = input.required<DocumentViewContext>();
	readonly arabic = arabic;
	readonly draft = signal('');
	readonly block = signal(false);
	canDeactivate(): Promise<boolean> {
		return Promise.resolve(!this.block());
	}
	hasPendingChanges(): boolean {
		return !!this.draft();
	}
}
@Component({
	selector: 'nx-fixture-summary',
	template: `<h2>{{ arabic ? 'تفاصيل العميل' : 'Customer details' }}</h2>
		<p>{{ arabic ? 'تفاصيل صفحة الاختبار.' : 'Fixture page details.' }}</p>`,
	styles: ':host{display:block;color:var(--nuxeo-text-default)} h2{color:inherit}',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
class SummaryPage {
	readonly context = input.required<DocumentViewContext>();
	readonly arabic = arabic;
}

@Component({
	selector: 'nx-navigation-fixture',
	imports: [DocumentViewsComponent, NuxeoTreeComponent, NuxeoTreeNodeComponent],
	template: `@if (surface() === 'document-tabs') {
			<button type="button" data-before-tabs>
				{{ arabic ? 'قبل طرق العرض' : 'Before views' }}
			</button>
			<nx-document-views
				[context]="context"
				[label]="arabic ? 'طرق عرض الوثيقة' : 'Document views'"
			/>
			<button type="button" data-after-tabs>{{ arabic ? 'بعد طرق العرض' : 'After views' }}</button>
			<button type="button" data-remove-last (click)="removeLater()">
				{{ arabic ? 'إزالة المساهمة الأخيرة' : 'Remove last contribution' }}
			</button>
		} @else {
			<button type="button" data-before-tree>{{ arabic ? 'قبل الشجرة' : 'Before tree' }}</button>
			<nx-tree [label]="arabic ? 'مجلدات العميل' : 'Customer folders'">
				<nx-tree-node
					[item]="parent"
					[(opened)]="opened"
					[selectedItem]="selected"
					(selected)="selected = $event"
				>
					<ng-template #content let-item>{{ item.title }}</ng-template>
					<nx-tree-node
						[item]="child"
						[depth]="1"
						[isLeaf]="true"
						[selectedItem]="selected"
						(selected)="selected = $event"
						><ng-template #content let-item>{{ item.title }}</ng-template></nx-tree-node
					>
				</nx-tree-node>
				@if (lastVisible()) {
					<nx-tree-node
						[item]="last"
						[isLeaf]="true"
						[selectedItem]="selected"
						(selected)="selected = $event"
						><ng-template #content let-item>{{ item.title }}</ng-template></nx-tree-node
					>
				}
			</nx-tree>
			<button type="button" data-after-tree>{{ arabic ? 'بعد الشجرة' : 'After tree' }}</button>
			<button type="button" data-remove-last (click)="removeLater()">
				{{ arabic ? 'إزالة العقدة الأخيرة' : 'Remove last node' }}
			</button>
			<p data-tree-selection>{{ selected?.title }}</p>
		}`,
	styles: `
		:host {
			display: block;
			min-width: 0;
		}
		button {
			padding: 8px;
			color: var(--nuxeo-text-default);
			background: var(--nuxeo-box);
			border: 1px solid var(--nuxeo-border);
		}
		nx-document-views {
			display: block;
			margin: 1rem 0;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavigationFixture {
	readonly surface = input.required<string>();
	readonly arabic = arabic;
	readonly lastVisible = signal(true);
	readonly context: DocumentViewContext = {
		noEdit: false,
		document: { uid: 'fixture-views', repository: 'default' },
	};
	readonly parent = { title: arabic ? 'المجلد الرئيسي' : 'Parent folder' };
	readonly child = { title: arabic ? 'مجلد فرعي' : 'Child folder' };
	readonly last = { title: arabic ? 'المجلد الأخير' : 'Last folder' };
	opened = true;
	selected: typeof this.parent | null = null;
	private timer: ReturnType<typeof setTimeout> | undefined;
	constructor() {
		const dispose = inject(ExtensionRegistry).register({
			id: 'fixture.views',
			contributions: [
				...defineDocumentView({
					id: 'fixture.draft',
					viewId: 'draft',
					label: arabic ? 'المسودة' : 'Draft',
					component: DraftPage,
					retain: true,
					order: 1,
				}),
				...defineDocumentView({
					id: 'fixture.summary',
					viewId: 'summary',
					label: arabic ? 'الملخص' : 'Summary',
					component: SummaryPage,
					order: 2,
				}),
				...defineDocumentView({
					id: 'fixture.last',
					viewId: 'last',
					label: arabic ? 'الأخير' : 'Last',
					component: SummaryPage,
					when: () => this.lastVisible(),
					order: 3,
				}),
			],
		});
		inject(DestroyRef).onDestroy(() => {
			dispose();
			if (this.timer) clearTimeout(this.timer);
		});
	}
	removeLater(): void {
		this.timer = setTimeout(() => this.lastVisible.set(false), 300);
	}
}
