# 🚀 DevFlow AI X — Supercharge Your GitHub Workflow

**Complete workflow from GitHub Issue to Pull Request with a single command.** Tired of the context-switching overhead? DevFlow AI X is a VS Code extension that automates the tedious parts of your development cycle. You write one simple prompt, the AI provides smart options, and the extension handles the rest — creating issues, checking out branches, scaffolding files, and opening Pull Requests.

---

## ✨ Features

- 🤖 **AI-Powered Issue Creation:** Describe your task in one sentence; AI generates the title, professional description, labels, and issue type.
- 🌿 **Automatic Branching:** Instantly creates a new Git branch linked to your newly generated GitHub issue and checks it out.
- 🏗️ **Smart Scaffolding:** Automatically generates placeholder Markdown documentation and test files based on your project language (JS/TS, Python, Go, PHP).
- 🚀 **1-Click Pull Requests:** Generates conventional commit messages and rich PR descriptions detailing your changes, pushing them directly to GitHub.

> 💡 **Tip:** *Want to see it in action? Add a GIF or short video here demonstrating the `Ctrl+Shift+D S` workflow!*

---

## 🚀 Getting Started

### Usage
Once installed, use the following shortcuts to trigger the DevFlow wizard:

| Command | Shortcut | Description |
|---------|----------|-------------|
| **Start Task** | `Ctrl+Shift+D S` | Opens the wizard to create an issue, branch, and scaffold files. |
| **Finish & Create PR** | `Ctrl+Shift+D F` | Commits changes, runs tests (optional), and opens a PR. |
| **Show Status** | *Command Palette* | Shows current branch, linked issue, and git diff status. |

*(Mac users: Use `Cmd+Shift+D` instead of `Ctrl+Shift+D`)*

### Requirements
- **VS Code:** Version `1.85` or higher.
- **Git:** Must be installed and initialized in your workspace.
- **GitHub Account:** Uses VS Code's built-in authentication (no extra personal access tokens needed!).

---

## ⚙️ Configuration

Press `Ctrl + ,` (or `Cmd + ,`), search for **DevFlow**, and customize the extension to fit your team's exact workflow:

| Setting | Default | Description |
|---------|---------|-------------|
| `devflow-ai-x.anthropicApiKey` | `""` | Anthropic API key to enable AI-powered titles and descriptions. *(Highly Recommended)* |
| `devflow-ai-x.defaultBranch` | `"main"` | Your target base branch (e.g., `main`, `master`, `develop`). |
| `devflow-ai-x.branchPrefix` | `"feature"` | Default prefix for new branches (`feature`, `feat`, `bugfix`, `fix`). |
| `devflow-ai-x.autoAssign` | `true` | Automatically assigns the newly created GitHub issue to your user account. |

---

## 🔌 Editor Compatibility

- **VS Code:** Full native support.
- **Cursor / Windsurf:** Works flawlessly out of the box. You can install the `.vsix` file directly in these AI editors.
- **JetBrains Support:** *Planned for the future.* The core logic will be extracted into a `@devflow/core` npm package, paving the way for a native Kotlin plugin.

---

## 🛠️ Contributing (Development Mode)

Want to contribute or build your own version? Setting up the local development environment is easy:

```bash
# 1. Clone the repository
git clone [https://github.com/your-username/devflow-vscode](https://github.com/your-username/devflow-vscode)
cd devflow-vscode

# 2. Install dependencies
npm install

# 3. Open in VS Code
code .

Press F5 inside VS Code to launch a new Extension Development Host window and test your changes.

To package and publish:

npm install -g @vscode/vsce
vsce package          # Creates the .vsix file
vsce publish          # Publishes to the Marketplace (requires publisher account)