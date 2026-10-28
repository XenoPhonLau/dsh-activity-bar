/**
 * Host half of dsh-activity-bar.
 *
 * The whole feature lives in the browser: the two rails are React components
 * registered into the `shell.overlay` slot, and the switches live in the
 * `settings.section` slot. Nothing runs on the Host, so this module only has to
 * exist for the loader to have an entry to mount.
 */

export const name = 'dsh-activity-bar'

export function apply() {}
