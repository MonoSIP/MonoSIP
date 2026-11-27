# CDR Idempotency Hardening (Phase 1 → completed in remediation)

**Date:** 2026-11-27  
**Update:** Final remediation added single-row `cdrEnd`/`cdrAnswered`, finished-billsec no-op, `call.ended` after DB commit, metrics, SQL B, migration 0020. See `CDR_FINAL_REMEDIATION.md`.  
**Environments:** throwaway Postgres. Production not touched. No commit/push/deploy.

---

## 1. Veri modeli doğrulaması

### `call_id` anlamı ve yaşam döngüsü

| Kaynak | Değer |
|---|---|
| Stasis / ARI | ARI `channel.id` → `cdrStart({ callId: channelId })` |
| Dialplan | `${UNIQUEID}` → `POST /api/v1/internal/cdr` JSON `callId` |
| Kayıt / VM | Aynı UNIQUEID dosya adında (`voicemail-inbox` yorumu) |

Asterisk’te her kanalın `UNIQUEID`’si tektir. MonoSIP **çağrı kaydını bu kimliğe bağlar**; bridge peer, transfer hedefi veya queue agent için **ayrı bir CDR satırı açılmaz**. Tek satır, dialplan finalize ile `billsec` / `disposition` / `extensionNumber` / `queueNumber` güncellenir.

### Meşru “çoklu CDR” senaryoları?

| Senaryo | Ayrı satır aynı `call_id` ile mi? | Gerçek model |
|---|---|---|
| Inbound → IVR → queue/extension | Hayır | Aynı UNIQUEID, satır güncellenir |
| Transfer (flow-dial) | Hayır | Aynı kanal UNIQUEID |
| Bridge / peer channel | Hayır | Peer farklı UNIQUEID; app peer için CDR yazmaz |
| Retry / ARI reconnect / çift StasisStart | **Gayrimeşru duplicate** | Eskiden ≥2 satır mümkündü |
| İki bağımsız çağrı | Evet ama **farklı** `call_id` | Beklenen |

API/UI zaten `eq(cdr.callId, …).limit(1)` / `Map` by callId kullanıyor — **çağrı başına tek satır varsayımı**.

### `UNIQUE(call_id)` veri kaybına yol açar mı?

**Hayır**, mevcut ürün modelinde:

- Meşru çoklu-leg zaten tek satırda tutuluyor.
- Constraint yalnızca retry/race ile oluşan **kopyaları** engeller.
- Migration **duplicate varsa RAISE** eder; silme/birleştirme yapmaz.

**Alternatif anahtar** (gerekmedi): `(call_id, leg)` — app hiç leg yazmadığı için over-design olurdu.

---

## 2. Uygulama

### Kod — `apps/api/src/lib/cdr.ts`

1. `cdrStart`: process-local `open` kısa devre  
2. `pg_advisory_xact_lock(hashtext(callId))` ile transaction içinde serialize  
3. Var olan satır → hydrate (açıksa) / no-op (bitmişse); **INSERT yok**  
4. Yoksa tek `INSERT`  
5. Unique ihlali yakalanırsa hydrate  
6. `cdrEnd`: mem yok + overrides yok + `endedAt` dolu → **no-op** (retry billsec’i silmez)  
7. Overrides varsa dialplan finalize güncellemesi devam eder  

### Schema — `apps/api/src/db/schema.ts`

- `cdr_call_id_idx` → **`uniqueIndex("cdr_call_id_uidx")`**

### Migration — `apps/api/drizzle/0019_cdr_call_id_unique.sql`

- Duplicate grup sayısı > 0 ise **EXCEPTION** (veri silinmez)  
- Eski non-unique index drop  
- `CREATE UNIQUE INDEX cdr_call_id_uidx`  
- Rollback: `0019_cdr_call_id_unique.down.sql`  
- Journal: `_journal.json` idx 19  

**Production’a uygulanmadı.** Throwaway’de migrate (test setup) ile uygulandı.

---

## 3. Regresyon testleri (Postgres)

Dosya: `apps/api/src/architecture/cdr-idempotency.int.test.ts` (**14** test)

| Senaryo | Sonuç |
|---|---|
| İlk CDR create | 1 satır |
| Aynı event tekrar `cdrStart` | 1 satır |
| Paralel 4× `cdrStart` | `count=1` |
| End sonrası reconnect `cdrStart` | 1 satır, open kapalı |
| `cdrEnd` tekrar (overrides yok) | billsec korunur |
| `cdrEnd` overrides (dialplan) | billsec güncellenir |
| Transfer-style aynı callId + `/internal/cdr` | 1 satır, agent/queue set |
| Ayrı callId’ler | bağımsız 2 satır |
| Dialplan create / retry POST | 1 satır |
| Auth fail | 0 satır |
| Catalog UNIQUE | `cdr_call_id_uidx` |
| Ham 2. INSERT | Postgres `23505` |
| Rollback sonrası retry | 0 → sonra 1 |

Ayrıca: `internal-ingest.int.test.ts` **46** geçti (mevcut ingest sözleşmesi).

Throwaway kanıt: `duplicate_groups: []`, unique index mevcut, ikinci INSERT `23505`.

---

## 4. Migration güvenliği

| Adım | Durum |
|---|---|
| Duplicate kontrolü (throwaway) | 0 grup |
| Otomatik silme/birleştirme | **Yok** |
| Throwaway apply | Evet (vitest `db-setup` migrate) |
| Production apply | **Hayır** |
| Rollback prosedürü | `0019_cdr_call_id_unique.down.sql` |

### Production’a alma (onay sonrası önerilen sıra)

1. `SELECT call_id, count(*) FROM cdr GROUP BY 1 HAVING count(*) > 1;`  
2. Dup varsa **manuel** inceleme / birleştirme (otomatik script yok)  
3. Lab’de `pnpm db:migrate`  
4. Sonra prod bakım penceresi  

---

## 5. Kabul kriterleri

| Kriter | Durum |
|---|---|
| Meşru CDR kaybolmaz | Pass — unique + no auto-delete |
| Retry duplicate üretmez | Pass — int tests |
| Paralel istekler güvenli | Pass — advisory lock + unique |
| API/frontend sözleşmesi | Pass — aynı alanlar; ingest 46 yeşil |
| Mevcut testler | Pass — arch unit 60; lib+arch 225; ingest 46 |
| Yeni regresyon | Pass — 14 idempotency int |

---

## Dokunulmayanlar (bilinçli)

- `call.ended` webhook ordering  
- `pendingTransfers` persistence (hâlâ P2; uygulanmadı)  
- Production storm SQL A/B + ilk `0019` (operatör penceresi — `AUDIT_CLOSEOUT.md`)

---

## Çalışma ağacı özeti

| Dosya | Değişiklik |
|---|---|
| `apps/api/src/lib/cdr.ts` | Idempotent start/end |
| `apps/api/src/db/schema.ts` | uniqueIndex |
| `apps/api/drizzle/0019_cdr_call_id_unique.sql` | Prod-ready migration (uygulanmadı prod’da) |
| `apps/api/drizzle/0019_cdr_call_id_unique.down.sql` | Rollback |
| `apps/api/drizzle/meta/_journal.json` | idx 19 |
| `apps/api/src/architecture/cdr-idempotency.int.test.ts` | Yenilendi |
| `schema-integrity` / `hotpath-indexes` tests | Index adı güncellendi |
