# IVR Engine Analysis

## Layers

| Layer | File | Role |
|---|---|---|
| Schema | `packages/shared/src/flow.ts` | Zod: node types, edges, variables |
| Pure logic | `asterisk/flow-logic.ts` | templates, `nextNode`, `compare`, keypad |
| Engine helpers | `asterisk/flow-engine.ts` | higher-level flow ops / simulation aids |
| Runtime | `asterisk/flow-runtime.ts` | ARI execution loop, Stasis handlers |
| Dialplan bridge | `asterisk/config-writer.ts` | `Stasis(monosip-flow,…)` entry for published flows |

## Node types (contract)

From `FlowNodeType`:  
`start`, `announce`, `tts`, `menu`, `get_key`, `api`, `condition`, `time_condition`, `set_var`, `wait`, `language`, `directory`, `transfer`, `queue`, `voicemail`, `subflow`, `hangup`.

Visual designer (`FlowDesignerPage`) edits the same JSON the runtime executes — single schema.

## Execution model

```
StasisStart (monosip-flow)
  → load published FlowJson
  → executeFlow / executeFlowLoop
       while node && !visited.has(id):
         steps++ > MAX_FLOW_STEPS(300) → hangup
         dispatch by node.type
         next = nextNode(...)
         menu/get_key → visited.clear()  // allow re-entry
  → transfer/queue/vm may leave Stasis
```

| Limit | Value | Location |
|---|---:|---|
| `MAX_FLOW_STEPS` | 300 | flow-runtime.ts |
| `MAX_WAIT_SECONDS` | 600 | flow-runtime.ts |
| Subflow `depth` | >5 refused | flow-runtime.ts ~L278, ~L298 |

## Graph properties (tested)

`architecture/ivr-graph-properties.test.ts`:

- Schema accepts `emptyFlow()`, rejects unknown types  
- Reachability / dangling edges  
- Property-style generators: even seeds → DAG fully reachable; odd seeds → cycle detected  
- Strict menu routing (`nextNode(..., strict=true)`)  
- Runtime limits exported  

## Cycles & unreachable nodes

- Runtime uses `visited` to stop simple loops; menus clear visit set intentionally.  
- Designer does not currently hard-block cycles; runtime step limit is the safety net.  
- Unreachable nodes after `start` are inert (storage waste only).

## Error / timeout propagation

- API nodes: HTTP errors → failure edge / hangup paths (covered by flow-runtime unit tests).  
- Wait / menu timeout: `sourceHandle: "timeout"`.  
- Transfer failure with no pending → hangup (unit test).  

## Dialplan vs visual definition

- **Authoring:** Flow JSON in `flow_versions.json`.  
- **Publish:** `publishedVersionId` on `flows`.  
- **Dialplan:** config-writer emits Stasis entry for flow extension numbers; **node graph is not compiled to dialplan apps** — Asterisk only enters Stasis; Node owns the graph.  
- This is an intentional architecture: visual ↔ runtime consistency is schema + runtime tests, not dialplan codegen per node.

## Backward compatibility

- Zod `FlowJsonSchema` is the gate on save/publish.  
- Adding node types requires shared enum + runtime case + designer — three-site change (P2 process risk).  
- `data: z.record(...)` is loose — invalid node payloads can pass schema and fail at runtime (P2).

## Property-based testing note

Deterministic seeded generators used (no `fast-check` dependency). Sufficient for DAG/cycle/reachability; recommend optional `fast-check` later for fuzzing `compare`/`expandTemplate` if desired.
