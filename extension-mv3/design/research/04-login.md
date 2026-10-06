# 04 · Login prompt and sign-in hand-off

Method: 14 screen searches, 4 flow searches, 2 flows read (Navan 9347, Cursor 9917), 18 screens viewed. Gap: Refero has no extension logins and no device-code flows (those searches return only OTP inputs). The nearest matches are tab and window hand-offs.

## 1. Top references (ranked)

| # | Product · id | Done well | Adopt |
|---|---|---|---|
| 1 | Wynde · 7fcf156e → d49aea79 | It explains first and opens the tab only on "Open tab". The opened tab says "go back to the tab you just came from". | The tab opens on click. The login tab has a return line. |
| 2 | Xbox · 85362106 | The prompt appears on Save and names the blocked action. One primary button and an X. | Name the action in the body. One primary button. |
| 3 | Navan · flow 9347 / df65798b | The auth tab ends on "You're logged in!" / "You can close this tab." | A success page on app.myscreenbreak.com. |
| 4 | Anthropic · 87e3397d | "Successfully signed in as {email}". | Show which account is logged in. |
| 5 | Plaid (iOS) · ad464b8a | The first window stays open and says where to continue. | The waiting card names the tab to use. |
| 6 | Teams · 61939138; Rarible · 1f029922 | Spinner, one line of reassurance, a visible Cancel. | Cancel is always visible during the wait. |
| 7 | Cursor · flow 9917 | After OAuth, the user is back on the same screen, which shows "connected". | One card goes Waiting → Saving → Saved. |
| 8 | PayPal · 4b51f581 | "You're all set." + "Redirecting...": it continues and shows the status. | Show "Saving…". No silent jump. |
| 9 | Pocket · f96968cc | The saved card shows the item title and "View List". | Show the article title and a link to the library. |
| 10 | Luma · f34cea7a; Klarna · d4eb902f | The profile gate has a reason and one button. The timeout has one sentence and a retry button. | Use the same pattern for both states. |

## 2. Recommended Save-login flow

**Surface:** the in-page card (bottom-right, 300 px) holds the whole flow. Chrome closes the toolbar popup when the new tab gets focus, so the popup cannot hold the wait. If the user opens the popup again, it mirrors the card with one status line and Cancel. Use "log in" everywhere.

**The login tab opens only on click.** Each hand-off reference waits for a click before it opens a tab or window: Wynde 7fcf156e, Xbox 85362106, LottieFiles a3d21d38, Plaid ad464b8a. No reference opens a tab without a click. Clicking Save means "save this article", not "go to another page".

1. **Trigger.** The user clicks Save, and the API says "not logged in". This response must be different from "profile incomplete".
2. **Prompt (card).** Title: "Log in to save this article". Body: "Saving needs your Screenbreak account. We'll open the login page in a new tab and save this article when you're in." Buttons: **Log in** (primary #005D4C) and **Not now** (text). *Xbox 85362106, LottieFiles a3d21d38.*
3. **Hand-off.** Open `app.myscreenbreak.com/login?from=extension` next to the article and focus it. *Wynde 7fcf156e.*
4. **Waiting (card on the article tab).** Spinner. Title: "Waiting for you to log in". Body: "Finish logging in on the Screenbreak tab. This article saves automatically." Actions: **Open login tab** (link) and **Cancel**. No countdown. *Plaid ad464b8a, Teams 61939138.*
5. **Success.**
   - Login tab: "You're logged in as {email}" / "Go back to your article. Screenbreak is saving it. You can close this tab." *Navan df65798b, Anthropic 87e3397d, Wynde d49aea79.*
   - The extension focuses the article tab again.
   - Card: "Saving…", then "Saved to your library", the article title and **Open in Screenbreak**. The card closes after about 6 s, but stays while the pointer is on it. *PayPal 4b51f581, Cursor 9917, Pocket f96968cc.*
6. **Cancel.** One click, no confirm dialog. Polling stops. Card: "Not saved. You can save this article any time." *Teams 61939138.*
7. **Timeout (5 min).** Title: "Still not logged in". Body: "We stopped waiting, so this article isn't saved yet." Buttons: **Try again** and **Dismiss**. *Klarna d4eb902f, Revolut 9bd98344.*
8. **Profile incomplete (its own state).** Title: "Finish your profile to save". Body: "You're logged in, but your account needs a few details before it can save articles." Buttons: **Finish profile** and **Not now**. Then "Waiting for your profile…" with Cancel. Steps 5–7 do not change. *Luma f34cea7a, Cal 730c3de6.*

## 3. Copy patterns seen (exact strings)

- "In order to save the design, you'll need to sign in with your Microsoft account." / "SIGN IN" (Xbox 85362106)
- "Please sign up or log in to continue." / "Already have an account? Log in" (LottieFiles a3d21d38)
- "Open tab" / "Great, now go back to the tab you just came from" (Wynde 7fcf156e, d49aea79)
- "You're logged in!" / "You can close this tab." (Navan df65798b)
- "Return to the Chase window to continue linking your account" (Plaid ad464b8a)
- "This may take a few seconds" / "Cancel" (Teams 61939138)
- "Oops, we ran out of time." / "Sign in again" (Klarna d4eb902f)
- "You're not signed in yet" / "Are you sure you want to go back?" (Coinbase 5f821306)

## 4. Reject

- **Opening the tab automatically on Save (today's behaviour).** No reference does this, and it takes focus with no reason given.
- **Full-page dimming modals** (Xbox, LottieFiles, Teams). The page is someone else's article. Keep the corner card.
- **A spinner with no exit** (Cursor e9202e93; Curater 014a6c90, "Signing in..."). This is today's problem.
- **A confirm dialog on Cancel** (Coinbase 5f821306). Cancel loses nothing.
- **"Oops" copy and mascots** (Klarna, Navan). They do not fit the calm tone or a 300 px card.
- **A countdown or "expires in" line** (Navan a203eae3). Give the limit only at the timeout.
- **Device-code flow.** The extension uses the browser cookie session, so it is not needed.
