"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode4 = __toESM(require("vscode"));
var path2 = __toESM(require("path"));

// src/wizard.ts
var vscode = __toESM(require("vscode"));
async function getAiSuggestions(prompt) {
  const apiKey = vscode.workspace.getConfiguration("devflow-ai-x").get("anthropicApiKey");
  if (!apiKey) return null;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: `You are a developer workflow assistant. Based on this task description, suggest GitHub issue options.
Respond ONLY with valid JSON, no markdown, no explanation.

Task: "${prompt}"

JSON format:
{
  "titles": ["concise title option 1", "concise title option 2", "concise title option 3"],
  "type": "feature" | "bug" | "chore" | "docs",
  "labels": ["label1", "label2"],
  "description": "2-3 sentence description of what needs to be done and why"
}

Rules:
- titles: 3 alternatives, max 60 chars each, imperative mood (Add, Fix, Implement...)
- type: best matching type
- labels: 1-3 from: enhancement, bug, documentation, chore, frontend, backend, api, ui, performance, security
- description: professional, technical, in English`
        }]
      })
    });
    if (!response.ok) return null;
    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}
function getFallbackSuggestions(prompt) {
  const lower = prompt.toLowerCase();
  const isBug = /fix|bug|error|broken|crash|fail|issue/.test(lower);
  const isDocs = /doc|readme|comment|guide|tutorial/.test(lower);
  const isChore = /refactor|cleanup|update dep|upgrade|ci|cd|lint/.test(lower);
  const type = isBug ? "bug" : isDocs ? "docs" : isChore ? "chore" : "feature";
  const prefix = isBug ? "Fix" : isDocs ? "Document" : isChore ? "Chore:" : "Implement";
  const base = prompt.slice(0, 55);
  return {
    titles: [
      `${prefix} ${base}`,
      base.slice(0, 60),
      `[${type}] ${base.slice(0, 50)}`
    ],
    type,
    labels: [isBug ? "bug" : "enhancement"],
    description: prompt
  };
}
async function runStartWizard(context) {
  const prompt = await vscode.window.showInputBox({
    title: "DevFlow \u2014 Step 1/4: Task description",
    prompt: "What do you want to work on?",
    placeHolder: "e.g. Fix validation error on login form",
    ignoreFocusOut: true,
    validateInput: (v) => v.trim().length < 5 ? "Please enter at least 5 characters" : null
  });
  if (!prompt) return null;
  let suggestions;
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "DevFlow: Generating suggestions...",
      cancellable: false
    },
    async () => {
      const ai = await getAiSuggestions(prompt);
      suggestions = ai ?? getFallbackSuggestions(prompt);
    }
  );
  suggestions = suggestions;
  const titleItems = [
    ...suggestions.titles.map((t, i) => ({
      label: t,
      description: i === 0 ? "$(sparkle) AI suggestion" : "",
      detail: i === 0 ? "Best match for your description" : void 0
    })),
    { label: "$(edit) Write my own...", description: "Custom title" }
  ];
  const titlePick = await vscode.window.showQuickPick(titleItems, {
    title: "DevFlow \u2014 Step 2/4: Issue title",
    placeHolder: "Select a title for the issue",
    ignoreFocusOut: true
  });
  if (!titlePick) return null;
  let title = titlePick.label;
  if (title.startsWith("$(edit)")) {
    const custom = await vscode.window.showInputBox({
      title: "Custom title",
      prompt: "Enter the issue title",
      value: prompt.slice(0, 60),
      ignoreFocusOut: true
    });
    if (!custom) return null;
    title = custom;
  }
  const typeItems = [
    { label: "$(rocket) feature", description: "New functionality", detail: suggestions.type === "feature" ? "$(sparkle) Recommended" : void 0 },
    { label: "$(bug) bug", description: "Bug fix", detail: suggestions.type === "bug" ? "$(sparkle) Recommended" : void 0 },
    { label: "$(tools) chore", description: "Refactor / cleanup", detail: suggestions.type === "chore" ? "$(sparkle) Recommended" : void 0 },
    { label: "$(book) docs", description: "Documentation", detail: suggestions.type === "docs" ? "$(sparkle) Recommended" : void 0 }
  ];
  const recommended = typeItems.find((i) => i.label.includes(suggestions.type));
  if (recommended) {
    typeItems.splice(typeItems.indexOf(recommended), 1);
    typeItems.unshift(recommended);
  }
  const typePick = await vscode.window.showQuickPick(typeItems, {
    title: "DevFlow \u2014 Step 3/4: Task type",
    placeHolder: "Select the type of task",
    ignoreFocusOut: true
  });
  if (!typePick) return null;
  const typeMap = {
    "$(rocket) feature": "feature",
    "$(bug) bug": "bug",
    "$(tools) chore": "chore",
    "$(book) docs": "docs"
  };
  const type = typeMap[typePick.label] ?? "feature";
  const priorityItems = [
    { label: "$(circle-large-filled) High", description: "Needs to be done today" },
    { label: "$(circle-filled) Medium", description: "Within this sprint", detail: "$(sparkle) Good default" },
    { label: "$(circle-outline) Low", description: "When time allows" }
  ];
  const priorityPick = await vscode.window.showQuickPick(priorityItems, {
    title: "DevFlow \u2014 Step 4/4: Priority",
    placeHolder: "Select task priority",
    ignoreFocusOut: true
  });
  if (!priorityPick) return null;
  const priority = priorityPick.label.includes("High") ? "high" : priorityPick.label.includes("Low") ? "low" : "medium";
  const branchPrefix = vscode.workspace.getConfiguration("devflow-ai-x").get("branchPrefix", "feature");
  const sizePick = await vscode.window.showQuickPick([
    { label: "XS", description: "Extra Small" },
    { label: "S", description: "Small" },
    { label: "M", description: "Medium" },
    { label: "L", description: "Large" },
    { label: "XL", description: "Extra Large" }
  ], {
    title: "DevFlow \u2014 Step 5/8: Size",
    placeHolder: "Select size",
    ignoreFocusOut: true
  });
  if (!sizePick) return null;
  const size = sizePick.label;
  const ghPriorityPick = await vscode.window.showQuickPick([
    { label: "P1", description: "Top priority" },
    { label: "P2" },
    { label: "P3" },
    { label: "P4" },
    { label: "P5", description: "Lowest priority" }
  ], {
    title: "DevFlow \u2014 Step 6/8: Priority (P1-P5)",
    placeHolder: "Select priority",
    ignoreFocusOut: true
  });
  if (!ghPriorityPick) return null;
  const ghPriority = ghPriorityPick.label;
  const statusPick = await vscode.window.showQuickPick([
    { label: "Todo", description: "This item hasn't been started" },
    { label: "Blocked", description: "Blocked" },
    { label: "In progress", description: "Actively being worked on" },
    { label: "In review", description: "In review" },
    { label: "Changes Requested", description: "Changes requested" },
    { label: "Done", description: "Completed" }
  ], {
    title: "DevFlow \u2014 Step 7/8: Status",
    placeHolder: "Select status",
    ignoreFocusOut: true
  });
  if (!statusPick) return null;
  const status = statusPick.label;
  const issueTypePick = await vscode.window.showQuickPick([
    { label: "Bug", description: "An unexpected problem or behavior" },
    { label: "Epic", description: "A large, high-level piece of work" },
    { label: "Improvement", description: "Existing functionality which requires improvement" },
    { label: "New Feature", description: "New functionality" },
    { label: "Task", description: "A specific piece of work" }
  ], {
    title: "DevFlow \u2014 Step 8/8: Issue Type",
    placeHolder: "Select issue type",
    ignoreFocusOut: true
  });
  if (!issueTypePick) return null;
  const issueType = issueTypePick.label;
  const confirm = await vscode.window.showQuickPick(
    [
      { label: "$(check) Yes, start task", description: "Create issue and open branch" },
      { label: "$(close) Cancel" }
    ],
    {
      title: `DevFlow \u2014 Summary: "${title}"`,
      placeHolder: `[${type}] \xB7 ${priority} priority \xB7 ${branchPrefix}/<issue>-branch \xB7 Size: ${size} \xB7 P: ${ghPriority} \xB7 Status: ${status} \xB7 Type: ${issueType}`,
      ignoreFocusOut: true
    }
  );
  if (!confirm || confirm.label.includes("Cancel")) return null;
  return { title, type, branchPrefix, labels: suggestions.labels, priority, description: suggestions.description, size, ghPriority, status, issueType };
}
async function runFinishWizard() {
  const commitMsg = await vscode.window.showInputBox({
    title: "DevFlow: Commit message",
    prompt: "Write a meaningful commit message",
    placeHolder: "feat(auth): add JWT refresh token logic",
    ignoreFocusOut: true,
    validateInput: (v) => v.trim().length < 5 ? "Please enter at least 5 characters" : null
  });
  if (!commitMsg) return null;
  const testChoice = await vscode.window.showQuickPick(
    [
      { label: "$(beaker) Run tests, then push", description: "Recommended" },
      { label: "$(arrow-up) Push without tests", description: "Faster" }
    ],
    {
      title: "DevFlow: Run tests?",
      ignoreFocusOut: true
    }
  );
  if (!testChoice) return null;
  return {
    commitMsg,
    runTests: testChoice.label.includes("Run tests")
  };
}

// src/github.ts
var vscode2 = __toESM(require("vscode"));
var import_rest = require("@octokit/rest");
async function getOctokit() {
  const session = await vscode2.authentication.getSession(
    "github",
    ["repo", "read:user"],
    { createIfNone: true }
  );
  return new import_rest.Octokit({ auth: session.accessToken });
}
async function getRepoInfo(repoPath) {
  try {
    const { simpleGit } = await import("simple-git");
    const git2 = simpleGit(repoPath);
    const remotes = await git2.getRemotes(true);
    const origin = remotes.find((r) => r.name === "origin");
    if (!origin) return null;
    const url = origin.refs.fetch || origin.refs.push || "";
    const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/) || url.match(/github\.com\/([^/]+)\/([^/.]+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2].replace(".git", "") };
  } catch {
    return null;
  }
}
async function createIssue(repoInfo, options) {
  const octokit = await getOctokit();
  for (const label of options.labels) {
    try {
      await octokit.issues.getLabel({ ...repoInfo, name: label });
    } catch {
      const colors = {
        enhancement: "84b6eb",
        bug: "ee0701",
        documentation: "0075ca",
        chore: "e4e669"
      };
      await octokit.issues.createLabel({
        ...repoInfo,
        name: label,
        color: colors[label] || "ededed"
      }).catch(() => {
      });
    }
  }
  const response = await octokit.issues.create({
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    title: options.title,
    body: options.body,
    labels: options.labels,
    ...options.assignee ? { assignees: [options.assignee] } : {}
  });
  return {
    number: response.data.number,
    url: response.data.html_url,
    title: response.data.title
  };
}
async function createPullRequest(repoInfo, opts) {
  const octokit = await getOctokit();
  const response = await octokit.pulls.create({
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    title: opts.title,
    body: opts.body,
    head: opts.head,
    base: opts.base
  });
  return { url: response.data.html_url, number: response.data.number };
}
async function getCurrentUsername() {
  try {
    const octokit = await getOctokit();
    const { data } = await octokit.users.getAuthenticated();
    return data.login;
  } catch {
    return void 0;
  }
}
async function commentOnIssue(repoInfo, issueNumber, body) {
  const octokit = await getOctokit();
  await octokit.issues.createComment({
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    issue_number: issueNumber,
    body
  });
}

// src/git.ts
var vscode3 = __toESM(require("vscode"));
var path = __toESM(require("path"));
function getWorkspacePath() {
  return vscode3.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
}
async function git(workspacePath) {
  const { simpleGit } = await import("simple-git");
  return simpleGit(workspacePath);
}
function makeBranchName(issueNumber, title, prefix) {
  const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 40).replace(/-$/, "");
  return `${issueNumber}-${slug}`;
}
async function syncWithRemote(defaultBranch) {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) throw new Error("No workspace folder found");
  const g = await git(workspacePath);
  const status = await g.status();
  let stashed = false;
  if (!status.isClean()) {
    await g.stash(["push", "-m", `devflow-auto-${Date.now()}`]);
    stashed = true;
  }
  await g.fetch(["origin", "--prune"]);
  await g.checkout(defaultBranch);
  await g.pull("origin", defaultBranch, { "--ff-only": null }).catch(async () => {
    await g.pull("origin", defaultBranch);
  });
  if (stashed) {
    vscode3.window.showInformationMessage("DevFlow: Your previous changes were stashed.");
  }
}
async function createAndCheckoutBranch(branchName) {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) throw new Error("No workspace folder found");
  const g = await git(workspacePath);
  await g.checkoutLocalBranch(branchName);
  await g.push(["--set-upstream", "origin", branchName]);
}
async function getCurrentBranch() {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) throw new Error("No workspace folder found");
  const g = await git(workspacePath);
  const branch = await g.revparse(["--abbrev-ref", "HEAD"]);
  return branch.trim();
}
async function commitAndPush(message) {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) throw new Error("No workspace folder found");
  const g = await git(workspacePath);
  await g.add(".");
  await g.commit(message);
  await g.push();
}
async function getDiffStat(defaultBranch) {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) return "";
  const g = await git(workspacePath);
  try {
    const result = await g.diff([`origin/${defaultBranch}...HEAD`, "--stat"]);
    const lastLine = result.trim().split("\n").pop() ?? "";
    return lastLine;
  } catch {
    return "";
  }
}
async function scaffoldFiles(issueNumber, title, type) {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) return [];
  const fs = await import("fs/promises");
  const created = [];
  const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const slug = title.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30);
  const docDir = path.join(workspacePath, "docs", "issues");
  await fs.mkdir(docDir, { recursive: true });
  const docFile = path.join(docDir, `issue-${issueNumber}-${slug}.md`);
  try {
    await fs.access(docFile);
  } catch {
    await fs.writeFile(docFile, `# Issue #${issueNumber}: ${title}

**Date:** ${date}
**Type:** ${type}
**Status:** In Progress

## Goal

<!-- Why was this issue opened? -->

## Solution Implemented

<!-- Technical approach -->

## Notes

<!-- Any important notes or considerations -->
`);
    created.push(`docs/issues/issue-${issueNumber}-${slug}.md`);
  }
  const testFile = await scaffoldTestFile(workspacePath, issueNumber, slug, title);
  if (testFile) created.push(testFile);
  return created;
}
async function scaffoldTestFile(workspacePath, issueNumber, slug, title) {
  const fs = await import("fs/promises");
  const checks = [
    { file: "package.json", fn: () => scaffoldJsTest(workspacePath, issueNumber, slug, title) },
    { file: "pyproject.toml", fn: () => scaffoldPyTest(workspacePath, issueNumber, slug, title) },
    { file: "requirements.txt", fn: () => scaffoldPyTest(workspacePath, issueNumber, slug, title) },
    { file: "go.mod", fn: () => scaffoldGoTest(workspacePath, issueNumber, slug, title) },
    { file: "Cargo.toml", fn: () => scaffoldRustNote(workspacePath, issueNumber, slug) },
    { file: "composer.json", fn: () => scaffoldPhpTest(workspacePath, issueNumber, slug, title) }
  ];
  for (const check of checks) {
    try {
      await fs.access(path.join(workspacePath, check.file));
      return await check.fn();
    } catch {
      continue;
    }
  }
  return null;
}
async function scaffoldJsTest(wp, num, slug, title) {
  const fs = await import("fs/promises");
  const dirs = ["__tests__", "src/__tests__", "tests", "test"];
  let testDir = "tests";
  for (const d of dirs) {
    try {
      await fs.access(path.join(wp, d));
      testDir = d;
      break;
    } catch {
      continue;
    }
  }
  await fs.mkdir(path.join(wp, testDir), { recursive: true });
  const rel = `${testDir}/issue-${num}-${slug}.test.js`;
  const file = path.join(wp, rel);
  try {
    await fs.access(file);
    return null;
  } catch {
  }
  await fs.writeFile(file, `/**
 * Tests for Issue #${num}: ${title}
 */
describe('Issue #${num} \u2014 ${title}', () => {
  it('should TODO: add meaningful test description', () => {
    // Arrange
    // Act
    // Assert
    expect(true).toBe(true); // placeholder
  });
});
`);
  return rel;
}
async function scaffoldPyTest(wp, num, slug, title) {
  const fs = await import("fs/promises");
  await fs.mkdir(path.join(wp, "tests"), { recursive: true });
  const rel = `tests/test_issue_${num}_${slug.replace(/-/g, "_")}.py`;
  const file = path.join(wp, rel);
  try {
    await fs.access(file);
    return null;
  } catch {
  }
  await fs.writeFile(file, `"""Tests for Issue #${num}: ${title}"""
import pytest


class TestIssue${num}:
    def test_basic(self):
        """TODO: meaningful test."""
        assert True  # placeholder
`);
  return rel;
}
async function scaffoldGoTest(wp, num, slug, title) {
  const fs = await import("fs/promises");
  const rel = `issue_${num}_${slug.replace(/-/g, "_")}_test.go`;
  const file = path.join(wp, rel);
  try {
    await fs.access(file);
    return null;
  } catch {
  }
  await fs.writeFile(file, `package main

import "testing"

func TestIssue${num}(t *testing.T) {
    t.Run("basic", func(t *testing.T) {
        t.Skip("Not yet implemented \u2014 Issue #${num}: ${title}")
    })
}
`);
  return rel;
}
async function scaffoldRustNote(_wp, _num, _slug) {
  return null;
}
async function scaffoldPhpTest(wp, num, _slug, title) {
  const fs = await import("fs/promises");
  await fs.mkdir(path.join(wp, "tests"), { recursive: true });
  const rel = `tests/Issue${num}Test.php`;
  const file = path.join(wp, rel);
  try {
    await fs.access(file);
    return null;
  } catch {
  }
  await fs.writeFile(file, `<?php
use PHPUnit\\Framework\\TestCase;

class Issue${num}Test extends TestCase
{
    public function test_basic(): void
    {
        // TODO: Issue #${num} \u2014 ${title}
        $this->assertTrue(true);
    }
}
`);
  return rel;
}

// src/extension.ts
function getWorkspacePath2() {
  return vscode4.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
}
function getConfig() {
  const cfg = vscode4.workspace.getConfiguration("devflow-ai-x");
  return {
    defaultBranch: cfg.get("defaultBranch", "main"),
    branchPrefix: cfg.get("branchPrefix", "feature"),
    autoAssign: cfg.get("autoAssign", true)
  };
}
async function generatePrDescription(issueTitle, issueDescription, diffStat, issueNumber) {
  const apiKey = vscode4.workspace.getConfiguration("devflow-ai-x").get("anthropicApiKey");
  if (apiKey) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          messages: [{
            role: "user",
            content: `Write a concise GitHub Pull Request description in Markdown (max 150 words).

Issue title: ${issueTitle}
Issue description: ${issueDescription}
Changes: ${diffStat}
Issue number: #${issueNumber}

Format:
## Summary
(1-2 sentences)

## Changes
- bullet list

## Testing
- [ ] item

Closes #${issueNumber}`
          }]
        })
      });
      if (response.ok) {
        const data = await response.json();
        return data.content?.[0]?.text ?? fallbackPrBody(issueTitle, issueNumber);
      }
    } catch {
    }
  }
  return fallbackPrBody(issueTitle, issueNumber);
}
function fallbackPrBody(title, issueNumber) {
  return `## Summary

${title}

## Changes

- See diff for details

## Testing

- [ ] Manual testing completed
- [ ] Unit tests pass

Closes #${issueNumber}`;
}
async function commandStart(context) {
  const workspacePath = getWorkspacePath2();
  if (!workspacePath) {
    vscode4.window.showErrorMessage("DevFlow: No workspace folder found.");
    return;
  }
  const wizard = await runStartWizard(context);
  if (!wizard) return;
  const cfg = getConfig();
  await vscode4.window.withProgress(
    {
      location: vscode4.ProgressLocation.Notification,
      title: "DevFlow",
      cancellable: false
    },
    async (progress) => {
      progress.report({ message: "Syncing repository...", increment: 10 });
      try {
        await syncWithRemote(cfg.defaultBranch);
      } catch (err) {
        vscode4.window.showWarningMessage(`DevFlow: Repo sync failed \u2014 ${err}. Continuing...`);
      }
      progress.report({ message: "Creating GitHub issue...", increment: 20 });
      const repoInfo = await getRepoInfo(workspacePath);
      if (!repoInfo) {
        throw new Error('GitHub repo not found. Is remote "origin" set?');
      }
      const assignee = cfg.autoAssign ? await getCurrentUsername() : void 0;
      const priorityLabel = wizard.priority === "high" ? "\u{1F534}" : wizard.priority === "low" ? "\u{1F7E2}" : "\u{1F7E1}";
      const issue = await createIssue(repoInfo, {
        title: wizard.title,
        body: `**Type:** ${wizard.type}
**Priority:** ${priorityLabel} ${wizard.priority}
**Size:** ${wizard.size}
**P-level:** ${wizard.ghPriority}
**Status:** ${wizard.status}
**Issue Type:** ${wizard.issueType}
**Date:** ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}

## Description

${wizard.description}

## Acceptance criteria

- [ ] 
- [ ] 

---
*Created by DevFlow extension*`,
        labels: wizard.labels,
        assignee
      });
      progress.report({ message: "Creating branch...", increment: 30 });
      const branchName = makeBranchName(issue.number, wizard.title, wizard.branchPrefix);
      await createAndCheckoutBranch(branchName);
      progress.report({ message: "Scaffolding files...", increment: 20 });
      const created = await scaffoldFiles(issue.number, wizard.title, wizard.type);
      if (created.length > 0) {
        try {
          await commitAndPush(
            `chore(#${issue.number}): scaffold doc and test files

Issue: ${issue.url}`
          );
        } catch {
        }
      }
      progress.report({ message: "Done!", increment: 20 });
      const action = await vscode4.window.showInformationMessage(
        `DevFlow: Issue #${issue.number} created \xB7 Branch: ${branchName}`,
        "View Issue",
        "Dismiss"
      );
      if (action === "View Issue") {
        vscode4.env.openExternal(vscode4.Uri.parse(issue.url));
      }
      if (created.length > 0) {
        const docFile = created.find((f) => f.includes("docs/"));
        if (docFile) {
          const uri = vscode4.Uri.file(path2.join(workspacePath, docFile));
          await vscode4.window.showTextDocument(uri, { preview: true, viewColumn: vscode4.ViewColumn.Beside });
        }
      }
    }
  );
}
async function commandFinish() {
  const workspacePath = getWorkspacePath2();
  if (!workspacePath) {
    vscode4.window.showErrorMessage("DevFlow: No workspace folder found.");
    return;
  }
  const currentBranch = await getCurrentBranch();
  if (currentBranch === "main" || currentBranch === "master" || currentBranch === "develop") {
    const ok = await vscode4.window.showWarningMessage(
      `DevFlow: You are on ${currentBranch}. Continue anyway?`,
      "Yes",
      "No"
    );
    if (ok !== "Yes") return;
  }
  const issueMatch = currentBranch.match(/\/(\d+)-/);
  const issueNumber = issueMatch ? parseInt(issueMatch[1]) : null;
  const wizard = await runFinishWizard();
  if (!wizard) return;
  const cfg = getConfig();
  await vscode4.window.withProgress(
    {
      location: vscode4.ProgressLocation.Notification,
      title: "DevFlow",
      cancellable: false
    },
    async (progress) => {
      if (wizard.runTests) {
        progress.report({ message: "Running tests...", increment: 20 });
        const terminal = vscode4.window.createTerminal({ name: "DevFlow Tests", hideFromUser: false });
        terminal.show();
        const testCmd = await detectTestCommand(workspacePath);
        if (testCmd) {
          terminal.sendText(testCmd);
          await new Promise((r) => setTimeout(r, 2e3));
          const cont = await vscode4.window.showQuickPick(
            ["$(check) Tests passed, continue", "$(close) Cancel"],
            { title: "DevFlow: Test result?", ignoreFocusOut: true }
          );
          if (!cont || cont.includes("Cancel")) return;
        }
      }
      progress.report({ message: "Committing...", increment: 30 });
      const fullMsg = issueNumber ? `${wizard.commitMsg}

Closes #${issueNumber}` : wizard.commitMsg;
      try {
        await commitAndPush(fullMsg);
      } catch (err) {
        const msg = String(err);
        if (msg.includes("nothing to commit")) {
          vscode4.window.showInformationMessage("DevFlow: Nothing to commit, creating PR...");
        } else {
          throw err;
        }
      }
      progress.report({ message: "Creating Pull Request...", increment: 30 });
      const repoInfo = await getRepoInfo(workspacePath);
      if (!repoInfo) throw new Error("GitHub repo not found");
      const diffStat = await getDiffStat(cfg.defaultBranch);
      const prBody = await generatePrDescription(
        wizard.commitMsg,
        "",
        diffStat,
        issueNumber ?? 0
      );
      const pr = await createPullRequest(repoInfo, {
        title: wizard.commitMsg,
        body: prBody,
        head: currentBranch,
        base: cfg.defaultBranch
      });
      if (issueNumber) {
        await commentOnIssue(repoInfo, issueNumber, `\u{1F500} PR created: ${pr.url}`).catch(() => {
        });
      }
      progress.report({ message: "Done!", increment: 20 });
      const action = await vscode4.window.showInformationMessage(
        `DevFlow: PR #${pr.number} created!`,
        "View PR",
        "Dismiss"
      );
      if (action === "View PR") {
        vscode4.env.openExternal(vscode4.Uri.parse(pr.url));
      }
    }
  );
}
async function commandStatus() {
  const workspacePath = getWorkspacePath2();
  if (!workspacePath) return;
  const branch = await getCurrentBranch().catch(() => "N/A");
  const cfg = getConfig();
  const diff = await getDiffStat(cfg.defaultBranch).catch(() => "");
  const repoInfo = await getRepoInfo(workspacePath);
  const msg = [
    `Branch: ${branch}`,
    repoInfo ? `Repo: ${repoInfo.owner}/${repoInfo.repo}` : "",
    diff ? `Diff: ${diff}` : ""
  ].filter(Boolean).join(" \xB7 ");
  vscode4.window.showInformationMessage(`DevFlow: ${msg}`);
}
async function detectTestCommand(workspacePath) {
  const fs = await import("fs/promises");
  const checks = [
    ["package.json", "npm test"],
    ["pyproject.toml", "python -m pytest -q"],
    ["requirements.txt", "python -m pytest -q"],
    ["go.mod", "go test ./..."],
    ["Cargo.toml", "cargo test"],
    ["composer.json", "./vendor/bin/phpunit"]
  ];
  for (const [file, cmd] of checks) {
    try {
      await fs.access(path2.join(workspacePath, file));
      return cmd;
    } catch {
      continue;
    }
  }
  return null;
}
function activate(context) {
  context.subscriptions.push(
    vscode4.commands.registerCommand("devflow-ai-x.start", () => commandStart(context)),
    vscode4.commands.registerCommand("devflow-ai-x.finish", () => commandFinish()),
    vscode4.commands.registerCommand("devflow-ai-x.status", () => commandStatus())
  );
  const isConfigured = context.globalState.get("devflow-ai-x.configured");
  if (!isConfigured) {
    vscode4.window.showInformationMessage(
      "DevFlow AI X installed! Press Ctrl+Shift+D S to start.",
      "Open Settings"
    ).then((action) => {
      if (action === "Open Settings") {
        vscode4.commands.executeCommand("workbench.action.openSettings", "devflow-ai-x");
      }
    });
    context.globalState.update("devflow-ai-x.configured", true);
  }
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
