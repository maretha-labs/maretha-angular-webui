import assert from 'node:assert/strict';
import test from 'node:test';
import { messageReferences, missingMessageReferences } from './source-references.mjs';

test('explicit template keys include switch cases, key attributes and nested display branches', () => {
	const source = `@switch(mode) { @case('edit') { <button titleKey="app.title">{{ flag ? ('app.yes' | webuiMessage:'Yes') : ('app.no' | translate) }}</button> } } <x [labelKey]="'app.label'" [titleKey]="customer.key">{{ customer.title }}</x>`;
	const references = messageReferences('app/view.html', source);
	assert.deepEqual(references.map((x) => x.key).sort(), [
		'app.label',
		'app.no',
		'app.title',
		'app.yes',
	]);
	assert.deepEqual(
		missingMessageReferences(references, {
			'app.yes': 'Yes',
			'app.no': 'No',
			'app.label': 'Label',
		}).map((x) => x.key),
		['app.title'],
	);
});

test('SDK localized state, constructor injection and explicit input key defaults stay covered', () => {
	const source = `import {WebUiMessages, localizedState} from '@maretha/webui-sdk'; class View {
error=localizedState(''); labelKey=input('app.default'); constructor(private messages:WebUiMessages) {}
run(){ this.error.setMessage('app.state','Fallback'); this.error.setError(problem,'app.failed','Fallback'); this.messages.text('app.constructor','Fallback'); }
}`;
	assert.deepEqual(
		messageReferences('app/view.ts', source)
			.map((x) => x.key)
			.sort(),
		['app.constructor', 'app.default', 'app.failed', 'app.state'],
	);
});

test('imported SDK/helper aliases and explicit label metadata are checked without guessing customer values', () => {
	const source = `import {WebUiMessages as Messages, LocalizedUiError as UiError} from '@maretha/webui-sdk';
import {messageText as authored, localizedMessage as state} from 'app/helpers/localized-message';
class View { messages=inject(Messages); error=state(); run(){this.messages.format('app.message',{name:'customer.literal'},'Fallback');this.error.set('app.status','English');return authored('app.error','Failure');} }
const metadata={labelKey:'app.label',label:'customer.literal'};
const error=new UiError('app.thrown','Failure');
other.text('customer.literal');`;
	const references = messageReferences('app/view.ts', source);
	assert.deepEqual(references.map((x) => x.key).sort(), [
		'app.error',
		'app.label',
		'app.message',
		'app.status',
		'app.thrown',
	]);
	assert.equal(
		missingMessageReferences(
			references,
			Object.fromEntries(references.map((x) => [x.key, 'translated'])),
		).length,
		0,
	);
	assert.equal(missingMessageReferences(references, {}).length, 5);
});
