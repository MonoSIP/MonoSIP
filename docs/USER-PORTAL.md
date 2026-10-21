# User portal and softphone

Each employee signs in with their extension number and password; they call from the browser, see their own calls, and listen to their own recordings only.

## Sign-in

- Username is the extension number.
- **One password per extension** for the portal and SIP (browser softphone, desk phone). The admin sets it on the extension or generates one (14 characters, no look-alike letters); leaving it empty on create generates one.
- Rules: 8–64 characters, no spaces, quotes, `;` or `\` (the secret is written into `pjsip.conf`).
- Changing the password (admin edit, “Generate new password”, or the portal) updates the portal login and the SIP secret together; desk phones then need the new password, browser softphones pick it up on their next sign-in.
- Extensions created before this change keep their separate random SIP secret until the password is changed.
- Portal access can be enabled / disabled per extension. Generated passwords prefer length over memorability — the password is also exposed to SIP brute force.

## Softphone

- **One phone for the whole portal:** the softphone lives in the portal layout, so moving between pages keeps the registration and any active call.
- **Mini phone** on every other portal page (bottom of the menu; a bar above the bottom navigation on phones): registration state, answer / decline an incoming call, peer and timer, mute and hang up. Tapping it opens the full phone.
- Phone-like design: the call appears on the phone’s screen, recent calls open from a button on the screen, follows the light / dark theme
- Dial, answer, DTMF keypad (quick key presses are never dropped)
- Hold, mute, blind and attended transfer
- Microphone, speaker, and ringtone device selection
- Directory and live presence (idle, on a call, DND); click a name to dial
- DND toggle
- Desktop notification on inbound; works when the tab is in the background
- Same extension can ring on desk phone and browser together; the first to answer keeps the call

## Call history

- Inbound, outbound, missed; filters; one-click callback
- Includes queue-answered and transferred-to-me calls

## Recordings

- Only calls the user was a party to
- Listen only; no download. Player streams audio; no download link
- Admin can disable listen permission per extension
- Every listen is audited (who, which recording, when)

## Voicemail and forwarding

- Listen to voicemail, mark as read
- Change own forwarding: no-answer, busy, unavailable. Mobile destination only if admin allowed it

## Technical notes

- Browser connects to Asterisk over WSS (proxied by the API); media is DTLS-SRTP
- Reloading the browser tab ends the call (the call belongs to the page); moving between portal pages does not
- Microphone requires HTTPS; Let’s Encrypt (or equivalent) is required
- coturn (TURN) on the same host for off-site use
- Mobile browsers suspend background tabs; inbound while the screen is off is unreliable. Users who must stay reachable on mobile should use a QR-provisioned native softphone
