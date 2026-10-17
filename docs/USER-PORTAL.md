# User portal and softphone

Each employee signs in with their extension number and portal password; they dial from the browser, see their own calls, and listen to their own recordings only. The portal ships in the first release.

## Sign-in

- Username is the extension number. Portal password is separate from the SIP secret.
- SIP secret is long and random; the backend issues softphone credentials only after a portal session.
- A leaked portal password does not expose desk phones; changing the portal password does not require re-provisioning phones.
- Admin resets passwords; portal access can be enabled/disabled per extension.

## Softphone

- Dial, answer, DTMF keypad
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

- Browser connects to Asterisk over WSS; media is DTLS-SRTP, Opus codec
- Microphone requires HTTPS; Let’s Encrypt (or equivalent) is required
- coturn (TURN) on the same host for off-site use
- Mobile browsers suspend background tabs; inbound while the screen is off is unreliable. Users who must stay reachable on mobile should use a QR-provisioned native softphone
