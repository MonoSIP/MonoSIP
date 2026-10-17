# Menu (flow) designer

Menus are built with React Flow (drag-and-drop), stored as JSON, and executed by the ARI flow engine on the backend. Each node exit is a separate edge to the next node.

## Nodes

| Node | What it does | Exits |
| --- | --- | --- |
| Start | Call enters the flow; `caller`, `did`, `time` variables ready | next |
| Play | Plays an audio file | next |
| TTS | Speaks text; `{{variable}}` supported, voice/gender, TR/EN | next |
| Menu | Play + collect DTMF; single or multi-digit, timeout, retries | per digit, timeout, invalid |
| API request | HTTP call; map response into variables | success, error |
| Condition | Compare variables (=, ≠, >, <, contains, empty, regex); area/country codes | true, false |
| Schedule gate | Looks up a schedule’s current status | open, lunch, after hours, holiday |
| Set variable | Writes a variable | next |
| Language | Sets language for following prompts | next |
| Name lookup | Dial-by-name; connect to extension | found, not found |
| Transfer | Shared destination picker: extension, group, external number | no-answer, busy, unavailable |
| Queue | Enters a queue; uses `priority` variable | timeout, full, no agents, callback requested |
| Voicemail | Extension or general mailbox | — |
| Subflow | Calls another flow | return |
| Hangup | Ends the call | — |

## API request node

- **Request:** GET, POST, PUT, PATCH, DELETE; URL, headers, and body templates (`{{caller}}`, `{{dtmf}}`, variables from earlier API responses)
- **Auth:** None, Bearer, Basic; secrets stored encrypted, never in flow JSON
- **Response mapping:** JSONPath → variable, e.g. `$.data.agent → agent`; HTTP status → `http_status`
- **Safety:** Timeout (default 3s, max 10s); optional one retry. Can play MOH/announce while waiting
- **Error exit:** Timeout, non-2xx, or unparseable body. Flow cannot publish if the error exit is unconnected
- **Test:** Send a sample request from the node settings popup; show raw response and mapped variables

Example: inbound → POST caller to CRM → `{"customer":true,"agent":"201"}` → transfer to 201. If API fails → general queue.

## Editing nodes

- Click a node on the canvas to open its **settings popup** (Escape / Close / backdrop to dismiss)
- The right sidebar is **Test call** only (simulate with caller, DID, DTMF, optional mock API JSON)

## Call simulation

- Run the flow step-by-step with a caller number, date/time, and DTMF inputs
- Visited nodes and edges highlight on the canvas; variables visible at each step
- API nodes hit the real endpoint or use a saved sample response

## Versioning and validation

- Each flow has a draft and a published version; live calls use published only
- Pre-publish validation: unconnected exits, unreachable nodes, cycles (including subflows), missing destinations
- Old versions kept; one-click rollback
- Import/export as JSON
- If a new version publishes mid-call, the in-progress call finishes on the version it started with
