import * as vscode from 'vscode';
import { Octokit } from '@octokit/rest';

export interface RepoInfo {
  owner: string;
  repo: string;
}

export interface IssueOptions {
  title: string;
  body: string;
  labels: string[];
  assignee?: string;
}

export interface CreatedIssue {
  number: number;
  url: string;
  title: string;
}

// Uses VS Code's built-in GitHub auth — no token required
async function getOctokit(): Promise<Octokit> {
  const session = await vscode.authentication.getSession(
    'github',
    ['repo', 'read:user'],
    { createIfNone: true }
  );
  return new Octokit({ auth: session.accessToken });
}

// Extract owner/repo from remote URL
export async function getRepoInfo(repoPath: string): Promise<RepoInfo | null> {
  try {
    const { simpleGit } = await import('simple-git');
    const git = simpleGit(repoPath);
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    if (!origin) return null;

    const url = origin.refs.fetch || origin.refs.push || '';
    // https://github.com/owner/repo.git  or  git@github.com:owner/repo.git
    const match =
      url.match(/github\.com[:/]([^/]+)\/([^/.]+)/) ||
      url.match(/github\.com\/([^/]+)\/([^/.]+)/);

    if (!match) return null;
    return { owner: match[1], repo: match[2].replace('.git', '') };
  } catch {
    return null;
  }
}

// Create GitHub issue
export async function createIssue(
  repoInfo: RepoInfo,
  options: IssueOptions
): Promise<CreatedIssue> {
  const octokit = await getOctokit();

  // Label mövcudluğunu yoxla, yoxdursa yarat
  for (const label of options.labels) {
    try {
      await octokit.issues.getLabel({ ...repoInfo, name: label });
    } catch {
      const colors: Record<string, string> = {
        enhancement: '84b6eb',
        bug: 'ee0701',
        documentation: '0075ca',
        chore: 'e4e669',
      };
      await octokit.issues.createLabel({
        ...repoInfo,
        name: label,
        color: colors[label] || 'ededed',
      }).catch(() => { }); // artıq varsa keç
    }
  }

  const response = await octokit.issues.create({
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    title: options.title,
    body: options.body,
    labels: options.labels,
    ...(options.assignee ? { assignees: [options.assignee] } : {}),
  });

  return {
    number: response.data.number,
    url: response.data.html_url,
    title: response.data.title,
  };
}

// Create Pull Request
export async function createPullRequest(
  repoInfo: RepoInfo,
  opts: {
    title: string;
    body: string;
    head: string;
    base: string;
  }
): Promise<{ url: string; number: number }> {
  const octokit = await getOctokit();
  const response = await octokit.pulls.create({
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    title: opts.title,
    body: opts.body,
    head: opts.head,
    base: opts.base,
  });
  return { url: response.data.html_url, number: response.data.number };
}

// Get GitHub username (for issue assign)
export async function getCurrentUsername(): Promise<string | undefined> {
  try {
    const octokit = await getOctokit();
    const { data } = await octokit.users.getAuthenticated();
    return data.login;
  } catch {
    return undefined;
  }
}

// Add comment to issue
export async function commentOnIssue(
  repoInfo: RepoInfo,
  issueNumber: number,
  body: string
): Promise<void> {
  const octokit = await getOctokit();
  await octokit.issues.createComment({
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    issue_number: issueNumber,
    body,
  });
}
