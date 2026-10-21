# IVR (flow) designer

IVR flows are built with React Flow (drag-and-drop), stored as JSON, and executed by the ARI flow engine on the backend. Each node exit is a separate edge to the next node. Every node type has its own shape and color on the map (speech bubble for announcements, tag for menus, slanted card for API calls, hexagon for conditions, and so on).

## Nodes

| Node | What it does | Exits |
| --- | --- | --- |
| Start | Call enters the flow; `caller`, `did`, `time` variables ready | next |
| Announce | Speaks text or plays a prompt WAV; language (en/tr), voice / TTS model | next |
| TTS | Speaks text; `$var` / `{{var}}` and filters supported; language, voice | next |
| Menu | Plays a prompt and collects DTMF; single or multi-digit, timeout, retries | per digit, timeout, invalid |
| Get key | Collects keypad digits into a named variable (e.g. `pin` → `$pin`); min / max digits | next, timeout |
| API request | HTTP call; maps the JSON response into variables | success, error |
| If (condition) | Compares variables (=, ≠, >, <, contains, empty, regex); area / country codes | true, false |
| Set variable | Writes a variable (templates and filters allowed) | next |
| Pause | Waits 1–600 seconds in silence or with a hold-music class, then continues | next |
| Language | Sets the language for the following prompts | next |
| Schedule | Looks up a schedule’s current status | open, lunch, after hours, holiday |
| Directory | Dial-by-name; connects to the extension | found, not found |
| Subflow | Runs another flow and returns | return |
| Transfer | Shared destination picker: extension, group, queue, external number | no answer, busy, unavailable |
| Queue | Enters a queue; uses the `priority` variable | timeout, full, no agents, callback requested |
| Voicemail | Extension or general mailbox | — |
| Hangup | Ends the call | — |

A busy operator is detected before dialing: the caller hears “busy”, the **busy** exit runs, and the operator’s phone does not ring.

## API request node

- **Request:** GET, POST, PUT, PATCH, DELETE; URL, headers and body templates (`$caller`, `$pin`, `{{caller}}`)
- **Auth:** none, Bearer, Basic, or a custom header (e.g. `authorization: apikey …`). Secrets are stored encrypted in **Settings → Secrets** and never appear in the flow JSON
- **Response mapping:** JSON path → variable, e.g. `$.result.0.selling → gold`; arrays by index (`$.0.degree`)
- **Safety:** timeout (default 3 s, max 10 s) and an optional single retry
- **Error exit:** timeout, non-2xx or an unparseable body. A flow cannot publish while the error exit is unconnected
- **Test:** send a sample request from the node settings and see the raw response and mapped variables

Tip: put an Announce node such as “One moment, I’m looking that up.” in front of a lookup, so the caller knows the pause is the query.

Example: inbound → POST the caller to a CRM → `{"customer":true,"agent":"201"}` → transfer to 201; if the API fails → general queue.

## Variables, templates and filters

Use `$name` or `{{name}}` in announcements, TTS and menu prompts, and in API URLs, headers and bodies. Built-ins: `caller`, `did`, `time`. Get key, Set variable and API mappings add more.

`{{name|filter}}` reshapes a value for speech or for a URL:

| Filter | Input → output | Use |
| --- | --- | --- |
| `province` | `6` / `06` → `Ankara` | Turkish plate code to province name (empty when invalid — check it with an If node) |
| `digits` | `03128440695` → `0 3 1 2 8 4 4 0 6 9 5` | Read a phone or account number digit by digit |
| `round` | `15.72` → `16` | Whole numbers (temperatures, index points) |
| `amount` | `49.578` → “forty-nine point fifty-eight” in Turkish words | Prices and rates read naturally by the Turkish voices; `,00` is left out |
| `ascii` | `İzmir` → `izmir` | APIs that reject non-ASCII letters in a URL |

The short names `il`, `rakam`, `tamsayi` and `tl` are accepted as aliases.

## Speech

- **Sentence by sentence:** long text is split into sentences; the next one is synthesized while the current one plays, so a long read-out starts in about a second.
- **Type-ahead:** callers can press a key during a prompt; the digit is buffered and the prompt stops.
- **Clean edges:** the line carries near-silence while the flow waits, so the next prompt’s first syllable is not clipped, and the flow plays a short tail before hanging up so the last words arrive.
- **Cache:** synthesized sentences are cached; repeated prompts play instantly.

## Editing

- Drag nodes freely; click the **pencil** on a node to open its settings (Escape / Done / backdrop to close)
- The trash icon deletes a node (with confirmation). Adding from the palette opens its settings once
- Click a connection to select it, then press **×** on it (or Backspace) to remove it
- The right sidebar is **Test call** only (simulate with caller, DID, DTMF sequence and optional mock API JSON)

## Call simulation

- Runs the flow step by step with a caller number, date/time and DTMF inputs
- Visited nodes and edges highlight on the canvas; variables are visible at each step
- API nodes hit the real endpoint or use the mock response

## Versioning and validation

- Each flow has a draft and a published version; live calls use the published one
- Pre-publish validation: unconnected exits, unreachable nodes, cycles (including subflows), missing destinations
- Old versions are kept; one-click rollback
- Import / export as JSON
- If a new version publishes mid-call, the call in progress finishes on the version it started with
