export function taskUrl(taskId: string): string {
	return `/tasks/${encodeURIComponent(taskId)}`;
}
