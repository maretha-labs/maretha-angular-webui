// Shim for ngx-timeago subpath imports: the package ships `language-strings/*.d.ts`
// files with valid types but exposes them via a trailing-slash exports map
// (`"./language-strings/": "./language-strings/"`) that TypeScript's `bundler`
// resolver rejects. Still required as of ngx-timeago 4.1.0. Delete when the
// upstream exports map is migrated to the `"./language-strings/*"` pattern.
declare module 'ngx-timeago/language-strings/*' {
	export const strings: Record<string, string>;
}
