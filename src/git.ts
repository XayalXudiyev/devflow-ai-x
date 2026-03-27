import * as vscode from 'vscode';
import * as path from 'path';

function getWorkspacePath(): string | null {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
}

async function git(workspacePath: string) {
  const { simpleGit } = await import('simple-git');
  return simpleGit(workspacePath);
}

// Create branch name: feature/42-fix-login-form
export function makeBranchName(
  issueNumber: number,
  title: string,
  prefix: string
): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/-$/, '');
  return `${issueNumber}-${slug}`;
}

// Switch to default branch, fetch, and pull
export async function syncWithRemote(defaultBranch: string): Promise<void> {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) throw new Error('No workspace folder found');

  const g = await git(workspacePath);

  // Stash unstaged changes
  const status = await g.status();
  let stashed = false;
  if (!status.isClean()) {
    await g.stash(['push', '-m', `devflow-auto-${Date.now()}`]);
    stashed = true;
  }

  await g.fetch(['origin', '--prune']);
  await g.checkout(defaultBranch);
  await g.pull('origin', defaultBranch, { '--ff-only': null }).catch(async () => {
    await g.pull('origin', defaultBranch);
  });

  // Do not apply stash back — user will work on a new branch
  if (stashed) {
    vscode.window.showInformationMessage('DevFlow: Your previous changes were stashed.');
  }
}

// Create and checkout new branch + set upstream
export async function createAndCheckoutBranch(branchName: string): Promise<void> {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) throw new Error('No workspace folder found');

  const g = await git(workspacePath);
  await g.checkoutLocalBranch(branchName);
  await g.push(['--set-upstream', 'origin', branchName]);
}

// Get current branch name
export async function getCurrentBranch(): Promise<string> {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) throw new Error('No workspace folder found');

  const g = await git(workspacePath);
  const branch = await g.revparse(['--abbrev-ref', 'HEAD']);
  return branch.trim();
}

// Stage all changes, commit, and push
export async function commitAndPush(message: string): Promise<void> {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) throw new Error('No workspace folder found');

  const g = await git(workspacePath);
  await g.add('.');
  await g.commit(message);
  await g.push();
}

// Get diff statistics compared to default branch
export async function getDiffStat(defaultBranch: string): Promise<string> {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) return '';

  const g = await git(workspacePath);
  try {
    const result = await g.diff([`origin/${defaultBranch}...HEAD`, '--stat']);
    const lastLine = result.trim().split('\n').pop() ?? '';
    return lastLine;
  } catch {
    return '';
  }
}

// Create scaffold files (documentation + test file)
export async function scaffoldFiles(
  issueNumber: number,
  title: string,
  type: string
): Promise<string[]> {
  const workspacePath = getWorkspacePath();
  if (!workspacePath) return [];

  const fs = await import('fs/promises');
  const created: string[] = [];
  const date = new Date().toISOString().slice(0, 10);
  const slug = title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);

  // Create documentation file
  const docDir = path.join(workspacePath, 'docs', 'issues');
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

  // Create test file based on project type
  const testFile = await scaffoldTestFile(workspacePath, issueNumber, slug, title);
  if (testFile) created.push(testFile);

  return created;
}

async function scaffoldTestFile(
  workspacePath: string,
  issueNumber: number,
  slug: string,
  title: string
): Promise<string | null> {
  const fs = await import('fs/promises');

  const checks = [
    { file: 'package.json', fn: () => scaffoldJsTest(workspacePath, issueNumber, slug, title) },
    { file: 'pyproject.toml', fn: () => scaffoldPyTest(workspacePath, issueNumber, slug, title) },
    { file: 'requirements.txt', fn: () => scaffoldPyTest(workspacePath, issueNumber, slug, title) },
    { file: 'go.mod', fn: () => scaffoldGoTest(workspacePath, issueNumber, slug, title) },
    { file: 'Cargo.toml', fn: () => scaffoldRustNote(workspacePath, issueNumber, slug) },
    { file: 'composer.json', fn: () => scaffoldPhpTest(workspacePath, issueNumber, slug, title) },
  ];

  for (const check of checks) {
    try {
      await fs.access(path.join(workspacePath, check.file));
      return await check.fn();
    } catch { continue; }
  }
  return null;
}

async function scaffoldJsTest(wp: string, num: number, slug: string, title: string): Promise<string | null> {
  const fs = await import('fs/promises');
  const dirs = ['__tests__', 'src/__tests__', 'tests', 'test'];
  let testDir = 'tests';
  for (const d of dirs) {
    try {
      await fs.access(path.join(wp, d));
      testDir = d;
      break;
    } catch { continue; }
  }

  await fs.mkdir(path.join(wp, testDir), { recursive: true });
  const rel = `${testDir}/issue-${num}-${slug}.test.js`;
  const file = path.join(wp, rel);

  try { await fs.access(file); return null; } catch { }

  await fs.writeFile(file, `/**
 * Tests for Issue #${num}: ${title}
 */
describe('Issue #${num} — ${title}', () => {
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

async function scaffoldPyTest(wp: string, num: number, slug: string, title: string): Promise<string | null> {
  const fs = await import('fs/promises');
  await fs.mkdir(path.join(wp, 'tests'), { recursive: true });
  const rel = `tests/test_issue_${num}_${slug.replace(/-/g, '_')}.py`;
  const file = path.join(wp, rel);

  try { await fs.access(file); return null; } catch { }

  await fs.writeFile(file, `"""Tests for Issue #${num}: ${title}"""
import pytest


class TestIssue${num}:
    def test_basic(self):
        """TODO: meaningful test."""
        assert True  # placeholder
`);
  return rel;
}

async function scaffoldGoTest(wp: string, num: number, slug: string, title: string): Promise<string | null> {
  const fs = await import('fs/promises');
  const rel = `issue_${num}_${slug.replace(/-/g, '_')}_test.go`;
  const file = path.join(wp, rel);

  try { await fs.access(file); return null; } catch { }

  await fs.writeFile(file, `package main

import "testing"

func TestIssue${num}(t *testing.T) {
    t.Run("basic", func(t *testing.T) {
        t.Skip("Not yet implemented — Issue #${num}: ${title}")
    })
}
`);
  return rel;
}

async function scaffoldRustNote(_wp: string, _num: number, _slug: string): Promise<string | null> {
  return null; // Rust support: should be added to src/lib.rs or tests/
}

async function scaffoldPhpTest(wp: string, num: number, _slug: string, title: string): Promise<string | null> {
  const fs = await import('fs/promises');
  await fs.mkdir(path.join(wp, 'tests'), { recursive: true });
  const rel = `tests/Issue${num}Test.php`;
  const file = path.join(wp, rel);

  try { await fs.access(file); return null; } catch { }

  await fs.writeFile(file, `<?php
use PHPUnit\\Framework\\TestCase;

class Issue${num}Test extends TestCase
{
    public function test_basic(): void
    {
        // TODO: Issue #${num} — ${title}
        $this->assertTrue(true);
    }
}
`);
  return rel;
}