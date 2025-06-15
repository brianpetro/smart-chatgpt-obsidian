# Smart ChatGPT
**Chat with ChatGPT, Claude, Gemini, and more—directly inside your Obsidian notes!** Keep your AI conversations organized and connected to your work, without ever leaving your vault.

![](./assets/smart-chatgpt-getting_started.gif)

> [!NOTE] Stop losing your conversations!
> Hey there! I'm 🌴 Brian. I found myself constantly juggling browser tabs for different AI chats while working on my notes. I'd lose track of important conversation threads and waste time trying to map them back to the right project.
>
> This plugin is my solution. It brings your AI chats right into the Obsidian notes where they belong. It's built to create a seamless, asynchronous workflow with AI, making sure your valuable discussions are always organized and right where you need them.

## Key Features
- 💬 **Embed Multiple AIs**: Works with ChatGPT, Anthropic Claude, Google Gemini, Perplexity, DeepSeek, xAI Grok, and Google AI Studio.
- 🔗 **Automatic Link Saving**: Never lose a conversation. New thread URLs are automatically saved back into your note.
- ✅ **Simple Task Management**: Mark conversations as "active" or "done" to track your progress on AI‑assisted tasks.
- 📂 **Multi‑Thread Management**: Easily switch between multiple conversation threads within a single note using a dropdown menu.
- 📊 **Dataview Integration**: Create dynamic dashboards to see all your active and completed AI chats across your entire vault.
- ⚙️ **Customizable View**: Adjust the height and zoom of the embedded chat window for your comfort.

## Getting Started

1. **Install the Plugin**: Find **Smart ChatGPT** in the Obsidian Community Plugins and install it.
2. **Insert a Codeblock**: Open the command palette (`⌘/Ctrl + P`) and type `Insert...`. You will see commands like `Insert OpenAI ChatGPT codeblock`, `Insert Anthropic Claude codeblock`, etc. Choose one!
3. **Start Chatting**: An interactive chat window will appear in your note. As you start a new conversation, the plugin will automatically detect the new URL and save it for you.

## How It Works

### Smart AI Codeblocks

The core of the plugin is the dynamic codeblock. When you insert a codeblock for an AI service (e.g., `smart-chatgpt`), it becomes a live window to that service.

````md
```smart-chatgpt
```
````

When you start a conversation, the plugin automatically updates the codeblock with the new thread's URL, marking it as `chat-active`.

````md
```smart-chatgpt
chat-active:: 1709719305 https://chatgpt.com/c/some-new-thread
```
````

### Managing Conversations

* **Mark as Done**: When you're finished with a conversation, click the **“Mark Done”** button. The plugin will update the line to `chat-done`. This is great for tracking tasks.
* **Switching Threads**: If you have multiple threads in one codeblock, a dropdown menu appears, letting you easily switch between them. Done threads are marked with a ✓.

### Power Up with Dataview

Because the plugin saves thread status directly in your notes as `chat-active` or `chat-done`, you can use [Dataview](https://github.com/blacksmithgu/obsidian-dataview) to create powerful dashboards.

#### Example: In‑Progress AI Tasks

````md
# In Progress
```dataview
LIST WITHOUT ID file.link
WHERE chat-active
SORT file.mtime DESC
```
````

#### Example: Completed AI Tasks

````md
# Completed
```dataview
LIST length(file.chat-done) + " completed"
WHERE chat-done
SORT length(file.chat-done) DESC
```
````

## Supported AI Services

Use a specific codeblock for each service:

| Codeblock          | Service              |
| ------------------ | -------------------- |
| `smart-chatgpt`    | **OpenAI ChatGPT**   |
| `smart-claude`     | **Anthropic Claude** |
| `smart-gemini`     | **Google Gemini**    |
| `smart-deepseek`   | **DeepSeek**         |
| `smart-perplexity` | **Perplexity**       |
| `smart-grok`       | **xAI Grok**         |
| `smart-aistudio`   | **Google AI Studio** |

## FAQ

### I’m getting the Google sign‑in error:

```
Couldn't sign you in
This browser or app may not be secure. Learn more
Try using a different browser. If you’re already using a supported browser, you can try again to sign in.
```

Google sometimes blocks Electron‑based webviews (like the one Obsidian uses) from OAuth sign‑in flows.
**Fix:**

1. Enable Obsidian’s built‑in **Web viewer** core plugin.
2. Open the AI service link with **Web viewer** (right‑click → *Open in Web viewer*).
3. Complete the Google login in that window.
4. Return to your note and press **Refresh** at the bottom of the Smart Chat window.
   Your authenticated Google session is now reused inside the embedded chat.

### AI Studio thread link isn't being saved

AI Studio does **not** assign a permanent URL to a brand‑new chat until you explicitly save it.  
After you've sent the first message in a new AI Studio conversation, click the **Save** button that appears at the top of the chat window.  
Once saved, Smart Chat Notes plugin can detect the final thread URL and write it back into the `smart‑aistudio` codeblock.

---

## Part of the Smart Ecosystem

Smart ChatGPT is a proud member of the [Smart Plugins](https://smartconnections.app) family, which includes the flagship **[Smart Connections](https://obsidian.md/plugins?id=smart-connections)** plugin.

Our mission is to build user‑aligned, privacy‑first tools that empower you to think better and achieve your goals. We believe in software that is:

* 🔐 **Private & Local‑First**: Your data stays with you.
* 🌐 **Open‑Source**: Transparent and community‑driven.
* ⚔️ **Mission‑Driven**: Built to empower you, not to profit from your data.

Come for the tools, stay for the community and our shared vision of thriving with AI.

---

Developed by 🌴 Brian | [smartconnections.app](https://smartconnections.app)