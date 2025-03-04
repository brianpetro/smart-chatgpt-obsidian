# Smart ChatGPT Obsidian Plugin

A dynamic Obsidian plugin integrating ChatGPT directly within your notes. It simplifies managing and interacting with ChatGPT threads through specially formatted codeblocks, allowing seamless interaction and saving of ChatGPT sessions directly into your notes.

![](./assets/smart-chatgpt-getting_started.gif)

[Guide to Getting Started](https://docs.smartconnections.app/Smart-ChatGPT/Getting-Started).

## Features
- **Smart ChatGPT Codeblocks** (`smart-chatgpt`)
  - Insert ChatGPT sessions directly in notes.
  - Automatically track ChatGPT thread URLs.
  - Mark ChatGPT threads as "done" or "active" within your notes.

- **Dynamic URL Management**
  - Easily switch between multiple ChatGPT thread URLs within a single codeblock via a dropdown.
  - Automatically save new ChatGPT thread links.
  - Display real-time status of ChatGPT threads (Active or Done).

- **Embedded Webview Integration**
  - ChatGPT interface embedded within Obsidian notes.
  - Adjustable webview zoom and height.
  - Refresh, open externally, copy, and save URL functions built-in.

- **Automatic Dataview Integration**
  - Use Dataview to track incomplete and completed ChatGPT threads.

## Usage

### Inserting ChatGPT Codeblock
- Execute the command: `Insert Smart ChatGPT Codeblock` from the command palette.

### Interacting with ChatGPT
- Within the inserted codeblock, type your message and submit.
- URLs of new threads are auto-saved.
- Mark threads as completed by clicking the **Mark Done** button.


## Commands
- `Insert Smart ChatGPT Codeblock`

## Settings
Customize the plugin in Obsidian settings:

- **Iframe Height** (`number`): Height in pixels for the embedded ChatGPT webview (default: 800).
- **Zoom Factor** (`0.1 - 2.0`): Adjust zoom level of embedded ChatGPT interface.

## Codeblock Syntax
````md
```smart-chatgpt
chat-active:: 1709719305 https://chatgpt.com/c/some-thread
chat-done:: 1709719205 https://chatgpt.com/c/completed-thread
```
````

- Automatically marks threads active/done.
- Supports multiple threads per codeblock.

### Dataview Integration


````md
# in progress
```dataview
LIST WITHOUT ID file.folder + " " + file.link + " " + file.mday 
WHERE chat-active!=null
SORT file.mtime DESC
```
````

````md
# completed
```dataview
LIST choice(typeof(chat-done)="string", 1, length(chat-done))
WHERE chat-done
SORT choice(typeof(chat-done)="string", 1, length(chat-done)) DESC
```
````

- Dataviews dynamically update as thread statuses change.

---

Developed by 🌴 Brian | [smartconnections.app](https://smartconnections.app)
