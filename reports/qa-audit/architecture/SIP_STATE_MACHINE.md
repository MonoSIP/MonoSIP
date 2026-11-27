# SIP / Call State Machine

## Important clarification

MonoSIP does **not** implement a formal SIP transaction state machine in TypeScript. SIP signaling is **Asterisk/PJSIP**. The application tracks:

1. **ARI channel snapshots** (`ari.calls: Map<id, LiveCall>`)
2. **Extension presence** (`idle | ringing | busy | unavailable | dnd`)
3. **CDR rows** (started / answered / ended + billsec)
4. **IVR pending transfer** map + open CDR helper map

## Live call model

```typescript
// apps/api/src/asterisk/ari.ts
type LiveCall = {
  id: string; name: string; caller: string; callee: string;
  state: string; // Asterisk channel state passthrough
  startedAt: string; tech: string;
};
```

**Population:** `poll()` every 5s clears and rebuilds `this.calls` from `GET /ari/channels` (orphans drop when absent).

**Events:** ARI WS for apps `monosip-inbound`, `monosip-flow`, `monosip-outbound`.

## Extension presence states

| State | Meaning |
|---|---|
| idle | Registered, free |
| ringing | Incoming |
| busy | In call |
| unavailable | Not registered |
| dnd | Do-not-disturb flag |

Closed union in `ari.ts` `ExtensionState`.

## CDR lifecycle

```
cdrStart (Stasis / dialplan curl)
    │
    ├─► cdrAnswered (ANSWERED / billsec > 0)
    │
    └─► cdrEnd / ChannelDestroyed finalize
            → duration, billsec, disposition, mos/jitter optional
```

Owner: `lib/cdr.ts` in-memory `open` Map + Postgres `cdr` table.  
Dialplan emits JSON to internal admin ingest (`admin-resources` recording/CDR endpoints).

## IVR / transfer transitions

| Transition | Mechanism | File |
|---|---|---|
| Enter flow | StasisStart → `executeFlow` | `flow-runtime.ts` |
| Node walk | `executeFlowLoop` + `visited` + `MAX_FLOW_STEPS=300` | same |
| Transfer park | `pendingTransfers.set(channelId, …)` | ~L808 |
| Transfer complete | consume pending on StasisStart / hangup | ~L1079 |
| Redirect to dialplan/queue | ARI continue / dialplan Goto | config-writer + runtime |
| Hangup | `ari.hangup` / ChannelDestroyed | ari + runtime |

## Hold

- Music-on-hold via channel var `CHANNEL(musicclass)` and `sound:` playback during API wait nodes (`flow-runtime` hold-while-requesting tests).
- Queue wait uses Asterisk Queue + MOH classes from DB — not a separate app “HOLD” state enum.

## Valid vs invalid (application layer)

| Valid | Invalid / guarded |
|---|---|
| ChannelDestroyed ends CDR | Open CDR without destroy (mitigated by dialplan curl + destroy hook) |
| Transfer to extension/queue/vm | Transfer to self (refused) |
| Menu digit with edge | Unknown digit with `strict` nextNode → undefined |
| Flow steps ≤ 300 | Step limit → hangup |
| Subflow depth ≤ 5 | Deeper → refuse |

## Gaps (evidence-based)

| Gap | Impact | Sev |
|---|---|---|
| No explicit enum for `LiveCall.state` | UI must tolerate Asterisk strings | INFO |
| App vs Asterisk consistency is poll-based (5s) | Brief UI lag / missed micro-states | INFO |
| `queue_events` table unused | No durable queue state machine in DB | P2 |
| Dual CDR writers (Stasis `lib/cdr` + dialplan `POST /internal/cdr`) | Same table, two ingest paths — regressions if one path changes alone | P2 |
| `channelDestroyed` only on `ChannelDestroyed` (not HangupRequest alone) | End depends on destroy +/or dialplan curl; `subscribeChannel` required after Stasis redirect | P2 |
| `pendingTransfers` process-local | API restart mid-ring loses dial-failed resume → hangup | P2 |
| Early `call.ended` webhook vs open CDR | Webhook can fire when Stasis returns after redirect while DB `ended_at` still null | P2 |
| `cdr.trunk_id` unused | Trunk choice lives in routing/dialplan only | P2 |

## Cleanup after termination

- ARI: DTMF waiters / buffers / playback maps cleared on hangup-related events  
- Flow: `pendingTransfers.delete`  
- CDR: destroy / ingest end  
- Orphan snoop channels: hung up in `poll()`  

Architectural tests: `architecture/sip-state-machine.test.ts`.
