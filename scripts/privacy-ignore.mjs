// Keeps private files out of GitHub. Run with `npm run privacy` (it also runs after `npm install`).
//  1. adds every privacy-related pattern below to .gitignore (the ones already there are left alone)
//  2. stops tracking any file Git already tracks that .gitignore now covers (the file stays on your disk)
// Anything already pushed stays in GitHub's history: rotate those keys, then clean the history.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PATTERNS = [
  ["Environment files and keys", [
    ".env", ".env.*", "!.env.example", "functions/.env", "functions/.env.*", "functions/.secret.local", ".runtimeconfig.json",
  ]],
  ["Service accounts and certificates", [
    "service-account*.json", "serviceAccountKey*.json", "*-adminsdk-*.json", "*.pem", "*.key", "*.p12", "*.p8", "*.mobileprovision",
  ]],
  ["App signing", ["keystore.properties", "*.jks", "*.keystore"]],
  ["Firebase caches and logs (they can hold emails and project details)", [".firebase/", "firebase-debug.log*", "firebase-debug.*.log", "ui-debug.log"]],
  ["Editor workspaces (personal paths and history)", [".idea/"]],
];

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const file = ".gitignore";
const text = existsSync(file) ? readFileSync(file, "utf8") : "";
const have = new Set(text.split(/\r?\n/).map((l) => l.trim()));

let added = "";
for (const [title, patterns] of PATTERNS) {
  const missing = patterns.filter((p) => !have.has(p));
  if (missing.length) added += `\n# ${title}\n${missing.join("\n")}\n`;
}
if (added) {
  writeFileSync(file, `${text}${text && !text.endsWith("\n") ? "\n" : ""}${added}`);
  console.log(`privacy: added to ${file}:${added.replace(/\n/g, "\n  ")}`);
} else {
  console.log(`privacy: ${file} already covers everything`);
}

let inRepo = true;
try { git("rev-parse", "--is-inside-work-tree"); } catch { inRepo = false; }
if (!inRepo) {
  console.log("privacy: this folder is not a Git repository yet, so nothing is tracked. Run this again after `git init`.");
} else {
  // tracked (-c) and ignored (-i): files committed before they were ignored
  const tracked = git("ls-files", "-ci", "--exclude-standard", "-z").split("\0").filter(Boolean);
  if (tracked.length) {
    git("rm", "--cached", "-q", "--", ...tracked);
    console.log(`privacy: stopped tracking ${tracked.length} file(s) (still on your disk). Commit this change:\n  ${tracked.join("\n  ")}`);
    console.log("privacy: if any of these were already pushed to GitHub, they are still in its history. Change those keys and passwords.");
  }
}
