Mobile chat verification
========================

The fix is shared by parent-chat.html, teacher-chat.html, and sgb-chat.html. It keeps the composer/input mounted during workspace refreshes, updates the message pane in place, retains history scrolling, and sizes the mobile shell to VisualViewport with a 100dvh fallback. Reduced keyboard space hides the introductory/contact section temporarily; closing the keyboard restores it. Safe-area padding protects the composer on devices with a home indicator. Enter does not submit during IME composition.

Run unit/regression tests:

    node --test tests/chat-mobile.test.cjs tests/chat.test.cjs tests/portal-scope.test.cjs tests/announcements.test.cjs tests/invitations.test.cjs

Run the browser test with Playwright installed outside the repository and PLAYWRIGHT_MODULE set to that module directory:

    node tests/mobile-chat.browser.cjs

The browser test uses installed Microsoft Edge headlessly. CHAT_BROWSER_EXECUTABLE can point to a Chromium/Chrome executable instead. It uses the production stylesheet, shared chat markup, render function and viewport script with synthetic conversation data and viewport events. It checks each chat at 360x800, 390x844 and 412x915, visual-viewport shrinking/panning, layout-viewport resizing, continued typing during incoming messages, input identity/focus/selection, reading history, bottom following and message alignment. It does not send live messages or validate backend permissions.

Physical Android Chrome and iOS Safari are not available in this Windows environment. On those devices, open each chat, type with the keyboard visible while another account sends replies, select part of the draft, scroll older messages, dismiss/reopen the keyboard and rotate the screen. Confirm that the composer stays visible, the draft and selection remain, history does not jump to the bottom, and selecting/sending a message works normally. Include iOS home-indicator safe-area and Android resizes-content behaviour in that device check.
