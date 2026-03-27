import * as vscode from 'vscode';

export interface WizardResult {
  title: string;
  type: 'feature' | 'bug' | 'chore' | 'docs';
  branchPrefix: string;
  labels: string[];
  priority: 'high' | 'medium' | 'low';
  description: string;
  size: 'XS' | 'S' | 'M' | 'L' | 'XL';
  ghPriority: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  status: 'Todo' | 'Blocked' | 'In progress' | 'In review' | 'Changes Requested' | 'Done';
  issueType: 'Bug' | 'Epic' | 'Improvement' | 'New Feature' | 'Task';
}

interface AiSuggestions {
  titles: string[];
  type: 'feature' | 'bug' | 'chore' | 'docs';
  labels: string[];
  description: string;
}

async function getAiSuggestions(prompt: string): Promise<AiSuggestions | null> {
  const apiKey = vscode.workspace.getConfiguration('devflow-ai-x').get<string>('anthropicApiKey');
  if (!apiKey) return null;

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
        max_tokens: 600,
        messages: [{
          role: 'user',
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
- description: professional, technical, in English`,
        }],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json() as { content: Array<{ text: string }> };
    const text = data.content?.[0]?.text ?? '';
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean) as AiSuggestions;
  } catch {
    return null;
  }
}

function getFallbackSuggestions(prompt: string): AiSuggestions {
  const lower = prompt.toLowerCase();
  const isBug = /fix|bug|error|broken|crash|fail|issue/.test(lower);
  const isDocs = /doc|readme|comment|guide|tutorial/.test(lower);
  const isChore = /refactor|cleanup|update dep|upgrade|ci|cd|lint/.test(lower);

  const type = isBug ? 'bug' : isDocs ? 'docs' : isChore ? 'chore' : 'feature';
  const prefix = isBug ? 'Fix' : isDocs ? 'Document' : isChore ? 'Chore:' : 'Implement';

  const base = prompt.slice(0, 55);
  return {
    titles: [
      `${prefix} ${base}`,
      base.slice(0, 60),
      `[${type}] ${base.slice(0, 50)}`,
    ],
    type,
    labels: [isBug ? 'bug' : 'enhancement'],
    description: prompt,
  };
}

export async function runStartWizard(
  context: vscode.ExtensionContext
): Promise<WizardResult | null> {

  const prompt = await vscode.window.showInputBox({
    title: 'DevFlow — Step 1/8: Task description',
    prompt: 'What do you want to work on?',
    placeHolder: 'e.g. Fix validation error on login form',
    ignoreFocusOut: true,
    validateInput: (v) => v.trim().length < 5 ? 'Please enter at least 5 characters' : null,
  });
  if (!prompt) return null;

  let suggestions: AiSuggestions;
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'DevFlow: Generating suggestions...',
      cancellable: false,
    },
    async () => {
      const ai = await getAiSuggestions(prompt);
      suggestions = ai ?? getFallbackSuggestions(prompt);
    }
  );
  suggestions = suggestions!;

  const titleItems: vscode.QuickPickItem[] = [
    ...suggestions.titles.map((t, i) => ({
      label: t,
      description: i === 0 ? '$(sparkle) AI suggestion' : '',
      detail: i === 0 ? 'Best match for your description' : undefined,
    })),
    { label: '$(edit) Write my own...', description: 'Custom title' },
  ];

  const titlePick = await vscode.window.showQuickPick(titleItems, {
    title: 'DevFlow — Step 2/8: Issue title',
    placeHolder: 'Select a title for the issue',
    ignoreFocusOut: true,
  });
  if (!titlePick) return null;

  let title = titlePick.label;
  if (title.startsWith('$(edit)')) {
    const custom = await vscode.window.showInputBox({
      title: 'Custom title',
      prompt: 'Enter the issue title',
      value: prompt.slice(0, 60),
      ignoreFocusOut: true,
    });
    if (!custom) return null;
    title = custom;
  }

  const typeItems: vscode.QuickPickItem[] = [
    { label: '$(rocket) feature', description: 'New functionality', detail: suggestions.type === 'feature' ? '$(sparkle) Recommended' : undefined },
    { label: '$(bug) bug', description: 'Bug fix', detail: suggestions.type === 'bug' ? '$(sparkle) Recommended' : undefined },
    { label: '$(tools) chore', description: 'Refactor / cleanup', detail: suggestions.type === 'chore' ? '$(sparkle) Recommended' : undefined },
    { label: '$(book) docs', description: 'Documentation', detail: suggestions.type === 'docs' ? '$(sparkle) Recommended' : undefined },
  ];

  const recommended = typeItems.find(i => i.label.includes(suggestions.type));
  if (recommended) {
    typeItems.splice(typeItems.indexOf(recommended), 1);
    typeItems.unshift(recommended);
  }

  const typePick = await vscode.window.showQuickPick(typeItems, {
    title: 'DevFlow — Step 3/8: Task type',
    placeHolder: 'Select the type of task',
    ignoreFocusOut: true,
  });
  if (!typePick) return null;

  const typeMap: Record<string, WizardResult['type']> = {
    '$(rocket) feature': 'feature',
    '$(bug) bug': 'bug',
    '$(tools) chore': 'chore',
    '$(book) docs': 'docs',
  };
  const type = typeMap[typePick.label] ?? 'feature';

  const priorityItems: vscode.QuickPickItem[] = [
    { label: '$(circle-large-filled) High', description: 'Needs to be done today' },
    { label: '$(circle-filled) Medium', description: 'Within this sprint', detail: '$(sparkle) Good default' },
    { label: '$(circle-outline) Low', description: 'When time allows' },
  ];

  const priorityPick = await vscode.window.showQuickPick(priorityItems, {
    title: 'DevFlow — Step 4/8: Priority',
    placeHolder: 'Select task priority',
    ignoreFocusOut: true,
  });
  if (!priorityPick) return null;

  const priority = priorityPick.label.includes('High') ? 'high'
    : priorityPick.label.includes('Low') ? 'low' : 'medium';

  const branchPrefix = vscode.workspace
    .getConfiguration('devflow-ai-x')
    .get<string>('branchPrefix', 'feature');


  // Size selection
  const sizePick = await vscode.window.showQuickPick([
    { label: 'XS', description: 'Extra Small' },
    { label: 'S', description: 'Small' },
    { label: 'M', description: 'Medium' },
    { label: 'L', description: 'Large' },
    { label: 'XL', description: 'Extra Large' },
  ], {
    title: 'DevFlow — Step 5/8: Size',
    placeHolder: 'Select size (XS, S, M, L, XL)',
    ignoreFocusOut: true,
  });
  if (!sizePick) return null;
  const size = sizePick.label as WizardResult['size'];

  // Priority (P1-P5)
  const ghPriorityPick = await vscode.window.showQuickPick([
    { label: 'P1', description: 'Top priority' },
    { label: 'P2' },
    { label: 'P3' },
    { label: 'P4' },
    { label: 'P5', description: 'Lowest priority' },
  ], {
    title: 'DevFlow — Step 6/8: P-level (P1–P5)',
    placeHolder: 'Select P-level (P1–P5)',
    ignoreFocusOut: true,
  });
  if (!ghPriorityPick) return null;
  const ghPriority = ghPriorityPick.label as WizardResult['ghPriority'];

  // Status
  const statusPick = await vscode.window.showQuickPick([
    { label: 'Todo', description: "This item hasn't been started" },
    { label: 'Blocked', description: 'Blocked' },
    { label: 'In progress', description: 'Actively being worked on' },
    { label: 'In review', description: 'In review' },
    { label: 'Changes Requested', description: 'Changes requested' },
    { label: 'Done', description: 'Completed' },
  ], {
    title: 'DevFlow — Step 7/8: Status',
    placeHolder: 'Select status (Todo, Blocked, In progress, In review, Changes Requested, Done)',
    ignoreFocusOut: true,
  });
  if (!statusPick) return null;
  const status = statusPick.label as WizardResult['status'];

  // Issue Type
  const issueTypePick = await vscode.window.showQuickPick([
    { label: 'Bug', description: 'An unexpected problem or behavior' },
    { label: 'Epic', description: 'A large, high-level piece of work' },
    { label: 'Improvement', description: 'Existing functionality which requires improvement' },
    { label: 'New Feature', description: 'New functionality' },
    { label: 'Task', description: 'A specific piece of work' },
  ], {
    title: 'DevFlow — Step 8/8: Issue Type',
    placeHolder: 'Select issue type (Bug, Epic, Improvement, New Feature, Task)',
    ignoreFocusOut: true,
  });
  if (!issueTypePick) return null;
  const issueType = issueTypePick.label as WizardResult['issueType'];

  const confirm = await vscode.window.showQuickPick(
    [
      { label: '$(check) Yes, start task', description: 'Create issue and open branch' },
      { label: '$(close) Cancel' },
    ],
    {
      title: `DevFlow — Summary: "${title}"`,
      placeHolder: `[${type}] · ${priority} priority · ${branchPrefix}/<issue>-branch · Size: ${size} · P: ${ghPriority} · Status: ${status} · Type: ${issueType}`,
      ignoreFocusOut: true,
    }
  );
  if (!confirm || confirm.label.includes('Cancel')) return null;

  return { title, type, branchPrefix, labels: suggestions.labels, priority, description: suggestions.description, size, ghPriority, status, issueType };
}

export async function runFinishWizard(): Promise<{ commitMsg: string; runTests: boolean } | null> {
  const commitMsg = await vscode.window.showInputBox({
    title: 'DevFlow: Commit message',
    prompt: 'Write a meaningful commit message',
    placeHolder: 'feat(auth): add JWT refresh token logic',
    ignoreFocusOut: true,
    validateInput: (v) => v.trim().length < 5 ? 'Please enter at least 5 characters' : null,
  });
  if (!commitMsg) return null;

  const testChoice = await vscode.window.showQuickPick(
    [
      { label: '$(beaker) Run tests, then push', description: 'Recommended' },
      { label: '$(arrow-up) Push without tests', description: 'Faster' },
    ],
    {
      title: 'DevFlow: Run tests?',
      ignoreFocusOut: true,
    }
  );
  if (!testChoice) return null;

  return {
    commitMsg,
    runTests: testChoice.label.includes('Run tests'),
  };
}