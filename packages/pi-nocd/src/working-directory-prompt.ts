/**
 * Builds the working-directory instruction pi-nocd adds to the system prompt.
 *
 * Pi already states the resolved CWD: its system prompt carries a `<cwd>`
 * section naming the path, and that section survives downstream shaping (e.g.
 * pi-anthropic-auth, which only rewrites Pi's own `tools`, `rules`, and `docs`
 * sections). What Pi ships nowhere is any *instruction* against `cd`-prefixing
 * the CWD; the `<cwd>` section is a bare statement of fact, not a rule.
 *
 * This instruction adds that missing prohibition. It repeats the literal
 * resolved path only to make the forbidden `cd <path> &&` example concrete, not
 * because the path is otherwise unavailable to the agent.
 */

/**
 * Name of the system-prompt section the instruction is written to.
 *
 * Pi renders a section as `<working_directory>…</working_directory>`, after its
 * own `<cwd>` section.
 */
export const WORKING_DIRECTORY_SECTION = "working_directory";

/**
 * Build the instruction for a given resolved working directory.
 *
 * The tag Pi wraps the section in already names it, so the content is the
 * instruction sentence alone, with no heading.
 *
 * @param cwd - The resolved current working directory (e.g. `ctx.cwd`).
 * @returns A sentence naming the literal path and forbidding `cd`-into-cwd.
 */
export function buildWorkingDirectoryPrompt(cwd: string): string {
  return (
    `Shell commands already execute in \`${cwd}\`. ` +
    "Never prefix a command with `cd` into the current working directory — " +
    `neither \`cd ${cwd} &&\` nor \`cd $(pwd) &&\`. ` +
    "Just run the command directly."
  );
}
