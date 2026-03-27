# DevFlow — VS Code Extension

Complete workflow from GitHub Issue to Pull Request. You write one prompt, the AI gives you options, you choose — and the extension does the rest.

## Installation (Development Mode)

```bash
git clone https://github.com/your-username/devflow-vscode
cd devflow-vscode
npm install
```

Open the project in VS Code and press F5 (macbook maybe Fn+F5). A new Extension Development Host window will open.

## Publish to Marketplace


```bash
npm install -g @vscode/vsce
vsce package          # Creates .vsix file
vsce publish          # Publish to the Marketplace (requires a publisher account) 
```

## Usage

| Command | Shortcut |
|---------|---------|
| DevFlow: Start Task | `Ctrl+Shift+D S` |
| DevFlow: Finish & Create PR | `Ctrl+Shift+D F` |
| DevFlow: Show Status | Command Palette |

## Settings

Press `Ctrl+`, and search for DevFlow:

| Setting  | Default | Description |
|----------|---------|------|
| `devflow.anthropicApiKey` | `""` | Anthropic API key for AI features (optional) |
| `devflow.defaultBranch` | `"main"` | Default main branch name |
| `devflow.branchPrefix` | `"feature"` | feature / feat / bugfix | fix | bug |
| `devflow.autoAssign` | `true` | Automatically assign the issue to yourself |

## Requirements

- VS Code 1.85 or higher
- Git
- GitHub account (uses VS Code built-in authentication — no extra token needed)

## Cursor / Windsurf support

This extension uses the standard VS Code API.
It works perfectly in Cursor and Windsurf — the same `.vsix` file can be installed.

## JetBrains Support

Planned for the future.
The core logic will be moved to a separate `@devflow/core` npm package, and the JetBrains plugin will be written in Kotlin, calling the same core.
