// Print the checked-out commit from .git without needing git in the image.
// Prints nothing when the build context has no repository metadata.
import { existsSync, readFileSync } from "node:fs";

function read(path) {
  return existsSync(path) ? readFileSync(path, "utf8").trim() : "";
}

const head = read(".git/HEAD");
let commit = /^[a-f0-9]{40,64}$/u.test(head) ? head : "";
const ref = head.match(/^ref: (refs\/[\w./-]+)$/u)?.[1];
if (ref) {
  commit = read(`.git/${ref}`);
  if (!commit) {
    const packed = read(".git/packed-refs").split("\n").find((line) => line.endsWith(` ${ref}`));
    commit = packed?.split(" ")[0] ?? "";
  }
}
if (/^[a-f0-9]{40,64}$/u.test(commit)) process.stdout.write(commit.slice(0, 12));
