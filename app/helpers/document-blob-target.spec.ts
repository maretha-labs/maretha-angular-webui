import { resolveDocumentBlobTarget } from './document-blob-target';

describe('Persisted blob targets', () => {
	const main = { digest: 'main', data: 'https://ignored.invalid/blob' };
	const file = { digest: 'attachment' };
	const video = { digest: 'video' };
	const picture = { digest: 'picture' };
	const document = {
		uid: 'one',
		repository: 'archive',
		properties: {
			'file:content': main,
			'files:files': [null, { file }],
			'vid:transcodedVideos': [{ content: video }],
			'picture:views': [null, null, { content: picture }],
		},
	};

	it('uses persisted property positions without trusting blob URLs or filtered draft indexes', () => {
		for (const [blob, xpath] of [
			[main, 'file:content'],
			[file, 'files:files/1/file'],
			[video, 'vid:transcodedVideos/0/content'],
			[picture, 'picture:views/2/content'],
		] as const)
			expect(resolveDocumentBlobTarget(document, blob)).toEqual({
				repository: 'archive',
				documentId: 'one',
				xpath,
				expectedDigest: blob.digest,
			});
	});
	it('resolves copied metadata by unique digest and defaults the repository', () => {
		expect(resolveDocumentBlobTarget({ ...document, repository: undefined }, { ...file })).toEqual({
			repository: 'default',
			documentId: 'one',
			xpath: 'files:files/1/file',
			expectedDigest: 'attachment',
		});
	});
	it('uses object identity to disambiguate equal saved blobs but rejects ambiguous copied metadata', () => {
		const copy = { ...file };
		const doc = { ...document, properties: { 'files:files': [{ file }, { file: copy }] } };
		expect(resolveDocumentBlobTarget(doc, copy).xpath).toBe('files:files/1/file');
		expect(() => resolveDocumentBlobTarget(doc, { ...file })).toThrowError(/uniquely/);
	});
	it('rejects local files, missing digests, unknown blobs, arbitrary URLs and missing document identity', () => {
		for (const blob of [
			new File(['local'], 'local.mp4'),
			{ data: main.data },
			{ digest: 'unknown', data: main.data },
		])
			expect(() => resolveDocumentBlobTarget(document, blob)).toThrow();
		expect(() => resolveDocumentBlobTarget({ ...document, uid: undefined }, main)).toThrow();
		expect(() => resolveDocumentBlobTarget({ ...document, repository: '' }, main)).toThrow();
	});
});
