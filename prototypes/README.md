# Prototypes

UI mockups made on a Claude design canvas. Each `.dc.html` file is one screen, written as HTML with inline styles plus a small logic class at the bottom. They need the canvas runtime (`support.js`) to render, so treat them as design reference to read, not as pages to open directly.

| File | Screen | What it shows |
| --- | --- | --- |
| `Main.dc.html` | Process queue | Decision card with Drop / Keep / Move / Watch, AI summary panel, Up next list with jump, undo toast, session stats, empty "Inbox is clear" state. Interactive. |
| `Queues.dc.html` | Queue view | Queue sidebar with counts, over-threshold warning, rules routing into the queue, list of videos with capture method, age and row actions. |
| `Popup.dc.html` | Toolbar popup | Inbox count with Process button, queue counts, "Queue this tab", "Sweep open YouTube tabs", intercept switch. |
| `Capture.dc.html` | Capture | Right-click "Send to queue" submenu and the in-page "Added to …" toast with Undo. |

Video titles, channels and counts in the mockups are sample data.
