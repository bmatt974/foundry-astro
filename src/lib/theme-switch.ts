/**
 * Whether `?theme=<name>` may swap the website's theme for a visitor.
 *
 * Under `astro dev`, always. In a build, only when it carries a preview
 * token: such a build sees the drafts, so it is a private preview — the
 * one slab serves to the home network — and never a public site. A
 * public build has no token, and the parameter stays inert there.
 */
export function allowsThemeSwitch(options: { isDev: boolean; previewToken: string | null | undefined }): boolean {
    return options.isDev || (options.previewToken ?? '').trim() !== '';
}
