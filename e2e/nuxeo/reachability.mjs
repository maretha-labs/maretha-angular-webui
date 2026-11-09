/** Anonymous reachability is separate from the suite's actual authenticated-shell check. */
export async function assertNativeReachability(app, api, fetcher = fetch) {
	const application = `${app.replace(/\/$/, '')}/`;
	const health = `${api.replace(/\/$/, '')}/runningstatus`;
	for (const [url, isApplication] of [
		[application, true],
		[health, false],
	]) {
		const response = await fetcher(url, {
			redirect: 'manual',
			signal: AbortSignal.timeout(5000),
		});
		if (response.status >= 300 && response.status < 400)
			throw new Error(
				'PRECONDITION NOT MET: local reachability endpoint redirected. Supply final application and health URLs.',
			);
		if (
			!(response.status >= 200 && response.status < 300) &&
			!(isApplication && response.status === 401)
		)
			throw new Error(
				'PRECONDITION NOT MET: local application or Nuxeo health endpoint is unavailable. The application may require sign-in; Nuxeo health must return 2xx.',
			);
	}
}
