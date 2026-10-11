import { describe, expect, it } from "vitest";
import { buildWorkingDirectoryPrompt } from "#src/working-directory-prompt.js";

describe("buildWorkingDirectoryPrompt", () => {
  it("names the literal resolved working directory", () => {
    const cwd = "/Users/chris/development/pi/pi-packages";
    const block = buildWorkingDirectoryPrompt(cwd);
    expect(block).toContain(`\`${cwd}\``);
  });

  it("forbids cd-prefixing the literal cwd", () => {
    const cwd = "/srv/project";
    const block = buildWorkingDirectoryPrompt(cwd);
    expect(block).toContain(`cd ${cwd} &&`);
  });

  it("forbids the generic cd $(pwd) prefix", () => {
    const block = buildWorkingDirectoryPrompt("/srv/project");
    expect(block).toContain("cd $(pwd) &&");
  });

  // Pi wraps a section in `<working_directory>` tags, which already name it,
  // so the content is the instruction alone, with no markdown heading.
  it("is the instruction sentence alone", () => {
    const block = buildWorkingDirectoryPrompt("/srv/project");
    expect(block).toBe(
      "Shell commands already execute in `/srv/project`. " +
        "Never prefix a command with `cd` into the current working directory — " +
        "neither `cd /srv/project &&` nor `cd $(pwd) &&`. " +
        "Just run the command directly.",
    );
  });
});
