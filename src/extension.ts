import * as vscode from 'vscode';
import * as path from 'path';
import { runStartWizard, runFinishWizard } from './wizard';
import { getRepoInfo, createIssue, createPullRequest, getCurrentUsername, commentOnIssue } from './github';
import {
  syncWithRemote,
  createAndCheckoutBranch,
  makeBranchName,
  getCurrentBranch,
  commitAndPush,
  getDiffStat,
  scaffoldFiles,
} from './git';

// Get the path of the active workspace
function getWorkspacePath(): string | null {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
}

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('devflow-ai-x');
  return {
    defaultBranch: cfg.get<string>('defaultBranch', 'main'),
    branchPrefix: cfg.get<string>('branchPrefix', 'feature'),
    autoAssign: cfg.get<boolean>('autoAssign', true),
  };
}

// Generate PR description with AI
async function generatePrDescription(
  issueTitle: string,
  issueDescription: string,
  diffStat: string,
  issueNumber: number
): Promise<string> {
  const apiKey = vscode.workspace.getConfiguration('devflow-ai-x').get<string>('anthropicApiKey');

  if (apiKey) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          messages: [{
            role: 'user',
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

Closes #${issueNumber}`,
          }],
        }),
      });

      if (response.ok) {
        const data = await response.json() as { content: Array<{ text: string }> };
        return data.content?.[0]?.text ?? fallbackPrBody(issueTitle, issueNumber);
      }
    } catch { /* fallback on error */ }
  }

  return fallbackPrBody(issueTitle, issueNumber);
}

function fallbackPrBody(title: string, issueNumber: number): string {
  return `## Summary

${title}

## Changes

- See diff for details

## Testing

- [ ] Manual testing completed
- [ ] Unit tests pass

Closes #${issueNumber}`;
}

// ─── devflow.start ────────────────────────────────────────────
async function commandStart(context: vscode.ExtensionContext): Promise<void> {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) {
    vscode.window.showErrorMessage('DevFlow: No workspace folder found.');
    return;
  }

  // 1. Wizard
  const wizard = await runStartWizard(context);
  if (!wizard) return;

  const cfg = getConfig();

  // 2. Operations with progress bar
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'DevFlow',
      cancellable: false,
    },
    async (progress) => {
      // ── Sync repository ──
      progress.report({ message: 'Syncing repository...', increment: 10 });
      try {
        await syncWithRemote(cfg.defaultBranch);
      } catch (err) {
        vscode.window.showWarningMessage(`DevFlow: Repo sync failed — ${err}. Continuing...`);
      }

      // ── Create GitHub Issue ──
      progress.report({ message: 'Creating GitHub issue...', increment: 20 });

      const repoInfo = await getRepoInfo(workspacePath);
      if (!repoInfo) {
        throw new Error('GitHub repo not found. Is remote "origin" set?');
      }

      const assignee = cfg.autoAssign ? await getCurrentUsername() : undefined;
      const priorityLabel = wizard.priority === 'high' ? '🔴' : wizard.priority === 'low' ? '🟢' : '🟡';

      const issue = await createIssue(repoInfo, {
        title: wizard.title,
        body: `**Type:** ${wizard.type}
**Priority:** ${priorityLabel} ${wizard.priority}
**Size:** ${wizard.size}
**P-level:** ${wizard.ghPriority}
**Status:** ${wizard.status}
**Issue Type:** ${wizard.issueType}
**Date:** ${new Date().toISOString().slice(0, 10)}

## Description

${wizard.description}

## Acceptance criteria

- [ ] 
- [ ] 

---
*Created by DevFlow extension*`,
        labels: wizard.labels,
        assignee,
      });

      // ── Create branch ──
      progress.report({ message: 'Creating branch...', increment: 30 });
      const branchName = makeBranchName(issue.number, wizard.title, wizard.branchPrefix);
      await createAndCheckoutBranch(branchName);

      progress.report({ message: 'Scaffolding files...', increment: 20 });
      const created = await scaffoldFiles(issue.number, wizard.title, wizard.type);

      if (created.length > 0) {
        try {
          await commitAndPush(
            `chore(#${issue.number}): scaffold doc and test files\n\nIssue: ${issue.url}`
          );
        } catch { }
      }

      progress.report({ message: 'Done!', increment: 20 });

      const action = await vscode.window.showInformationMessage(
        `DevFlow: Issue #${issue.number} created · Branch: ${branchName}`,
        'View Issue',
        'Dismiss'
      );

      if (action === 'View Issue') {
        vscode.env.openExternal(vscode.Uri.parse(issue.url));
      }

      // Open created files in editor
      if (created.length > 0) {
        const docFile = created.find(f => f.includes('docs/'));
        if (docFile) {
          const uri = vscode.Uri.file(path.join(workspacePath, docFile));
          await vscode.window.showTextDocument(uri, { preview: true, viewColumn: vscode.ViewColumn.Beside });
        }
      }
    }
  );
}

// ─── devflow.finish ───────────────────────────────────────────
async function commandFinish(): Promise<void> {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) {
    vscode.window.showErrorMessage('DevFlow: No workspace folder found.');
    return;
  }

  const currentBranch = await getCurrentBranch();
  if (currentBranch === 'main' || currentBranch === 'master' || currentBranch === 'develop') {
    const ok = await vscode.window.showWarningMessage(
      `DevFlow: You are on ${currentBranch}. Continue anyway?`,
      'Yes', 'No'
    );
    if (ok !== 'Yes') return;
  }

  // Extract issue number from branch name
  const issueMatch = currentBranch.match(/\/(\d+)-/);
  const issueNumber = issueMatch ? parseInt(issueMatch[1]) : null;

  const wizard = await runFinishWizard();
  if (!wizard) return;

  const cfg = getConfig();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'DevFlow',
      cancellable: false,
    },
    async (progress) => {
      // ── Tests (optional) ──
      if (wizard.runTests) {
        progress.report({ message: 'Running tests...', increment: 20 });
        const terminal = vscode.window.createTerminal({ name: 'DevFlow Tests', hideFromUser: false });
        terminal.show();

        const testCmd = await detectTestCommand(workspacePath);
        if (testCmd) {
          terminal.sendText(testCmd);
          await new Promise(r => setTimeout(r, 2000));
          const cont = await vscode.window.showQuickPick(
            ['$(check) Tests passed, continue', '$(close) Cancel'],
            { title: 'DevFlow: Test result?', ignoreFocusOut: true }
          );
          if (!cont || cont.includes('Cancel')) return;
        }
      }

      progress.report({ message: 'Committing...', increment: 30 });
      const fullMsg = issueNumber
        ? `${wizard.commitMsg}\n\nCloses #${issueNumber}`
        : wizard.commitMsg;

      try {
        await commitAndPush(fullMsg);
      } catch (err) {
        const msg = String(err);
        if (msg.includes('nothing to commit')) {
          vscode.window.showInformationMessage('DevFlow: Nothing to commit, creating PR...');
        } else {
          throw err;
        }
      }

      progress.report({ message: 'Creating Pull Request...', increment: 30 });

      const repoInfo = await getRepoInfo(workspacePath);
      if (!repoInfo) throw new Error('GitHub repo not found');

      const diffStat = await getDiffStat(cfg.defaultBranch);
      const prBody = await generatePrDescription(
        wizard.commitMsg, '', diffStat, issueNumber ?? 0
      );

      const pr = await createPullRequest(repoInfo, {
        title: wizard.commitMsg,
        body: prBody,
        head: currentBranch,
        base: cfg.defaultBranch,
      });

      if (issueNumber) {
        await commentOnIssue(repoInfo, issueNumber, `🔀 PR created: ${pr.url}`).catch(() => { });
      }

      progress.report({ message: 'Done!', increment: 20 });

      const action = await vscode.window.showInformationMessage(
        `DevFlow: PR #${pr.number} created!`,
        'View PR',
        'Dismiss'
      );

      if (action === 'View PR') {
        vscode.env.openExternal(vscode.Uri.parse(pr.url));
      }
    }
  );
}

// ─── devflow.status ───────────────────────────────────────────
async function commandStatus(): Promise<void> {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) return;

  const branch = await getCurrentBranch().catch(() => 'N/A');
  const cfg = getConfig();
  const diff = await getDiffStat(cfg.defaultBranch).catch(() => '');
  const repoInfo = await getRepoInfo(workspacePath);

  const msg = [
    `Branch: ${branch}`,
    repoInfo ? `Repo: ${repoInfo.owner}/${repoInfo.repo}` : '',
    diff ? `Diff: ${diff}` : '',
  ].filter(Boolean).join(' · ');

  vscode.window.showInformationMessage(`DevFlow: ${msg}`);
}

// Detect test command by project type
async function detectTestCommand(workspacePath: string): Promise<string | null> {
  const fs = await import('fs/promises');
  const checks: Array<[string, string]> = [
    ['package.json', 'npm test'],
    ['pyproject.toml', 'python -m pytest -q'],
    ['requirements.txt', 'python -m pytest -q'],
    ['go.mod', 'go test ./...'],
    ['Cargo.toml', 'cargo test'],
    ['composer.json', './vendor/bin/phpunit'],
  ];
  for (const [file, cmd] of checks) {
    try {
      await fs.access(path.join(workspacePath, file));
      return cmd;
    } catch { continue; }
  }
  return null;
}

// ─── Extension activation ───────────────────────────────────
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('devflow-ai-x.start', () => commandStart(context)),
    vscode.commands.registerCommand('devflow-ai-x.finish', () => commandFinish()),
    vscode.commands.registerCommand('devflow-ai-x.status', () => commandStatus()),
  );

  // Show setup warning on first activation
  const isConfigured = context.globalState.get<boolean>('devflow-ai-x.configured');
  if (!isConfigured) {
    vscode.window.showInformationMessage(
      'DevFlow AI X installed! Press Ctrl+Shift+D S to start.',
      'Open Settings'
    ).then(action => {
      if (action === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'devflow-ai-x');
      }
    });
    context.globalState.update('devflow-ai-x.configured', true);
  }
}

export function deactivate(): void { }