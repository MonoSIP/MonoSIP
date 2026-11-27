# Operatör hazırlık + güvenlik checklist’i

**Production not touched by agents without separate apply approval.**  
**Tek operasyon otoritesi:** `OPERATOR_APPLY_SEQUENCE.md` — bu checklist o sırayı destekler; çelişkide **sequence kazanır**.

Health kontrollerinde **TLS doğrulamasını kapatma** (`curl -k` / `curl -sk`) **yasaktır**. Geçerli CA / doğru hostname kullan.

---

## SEQUENCE ile birebir sıra

| # | SEQUENCE adımı | Bu checklist’te |
|---|----------------|-----------------|
| 1 | Idempotent CDR API deploy | §4 |
| 2 | Backup doğrula | §2 |
| 3 | CDR ingest durdur | §3 |
| 4 | Integrity / yazma yok | §3 + §5 |
| 5 | `00_lock_and_preflight.sql` | §5 + §6 |
| 6 | Baseline `SUM(billsec)` | §5 |
| 7–11 | SQL A → verify → SQL B → verify → 0019 | §7 |
| 12 | Post-migration verification | §8 |
| 13 | Ingest aç | §3 (açma) |
| 14 | 0020 ayrı pencere | §7 not |

---

## 1. Güvenli production PostgreSQL erişimi

| Madde | Değer |
|-------|--------|
| **Yetki** | Geçici, **minimum yetkili** rol (aşağıda); kalıcı superuser kullanma |
| **Secret** | Vault / one-time secret; shell history’ye yazma; chat/log’a URL+şifre yapıştırma; işlem bitince rol revoke + secret rotate |
| **Minimum rol (öneri)** | `CONNECT` DB; `cdr` üzerinde `SELECT, INSERT, UPDATE, DELETE`; `CREATE` (yalnızca `cdr_dup_archive` için) veya tabloyu önceden oluşturup yalnızca DML; `CREATE INDEX` / `DROP INDEX` (0019 için) — mümkünse ayrı kısa ömürlü migration rolü |
| **Komut** | `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT current_database(), current_user, inet_server_addr(), now();"` |
| **Beklenen** | Production DB adı; beklenen host; geçici rol adı |
| **Başarısızlık** | Bağlantı yok / yanlış DB / local Compose → **DUR**. Tahmin etme. |

Local `.env` (`postgres:5432/dsip`) production değildir.

---

## 2. Backup ve restore doğrulaması (SEQUENCE #2)

| Madde | Değer |
|-------|--------|
| **Yetki** | Backup/snapshot + restore test |
| **Komut** | Snapshot veya `pg_dump` → izole hedefe restore → `SELECT count(*) FROM cdr;` |
| **Beklenen** | Zaman damgalı, geri yüklenebilir kanıt; CDR sayısı biliniyor |
| **Başarısızlık** | Restore kanıtı yok → **DUR** |

---

## 3. CDR ingest durdurma / doğrulama / açma (SEQUENCE #3–4, #13)

**Yalnızca 60 sn `COUNT(*)` yeterli değildir.** Aşağıdakilerin **hepsi** PASS olmalı.

### 3.1 Durdurma (tüm instance)

| Katman | Yapılacak | Beklenen |
|--------|-----------|----------|
| API process | Tüm API replica/instance scale-down veya CDR yazan worker’ları stop | Instance envanteri = 0 aktif writer |
| ARI | Stasis uygulamalarına bağlı ARI websocket/session yok | ARI client disconnected / no subscribed apps |
| Asterisk Stasis | `monosip-outbound` / `monosip-inbound` / `monosip-flow` yeni kanal almıyor veya app unload/redirect freeze | Yeni StasisStart yok (log) |
| Dialplan ingest | `/api/v1/internal/cdr` (ve recording finalize) curl hedefleri yanıt vermiyor veya firewall drop | 401/timeout/connection refused — **yazma yok** |
| Retry | Kuyruk/retry (webhook retry, dialplan re-curl, client retry) boşaltıldı veya hedef kapalı | Retry log’unda başarılı CDR yazımı yok |
| DB | Writer session’ları | `pg_stat_activity` içinde `cdr`’ye yazan uygulama oturumu yok (ops session hariç) |

### 3.2 Doğrulama kontrolleri (hepsi zorunlu)

| # | Kontrol | Komut / yöntem | Beklenen | Fail |
|---|---------|----------------|----------|------|
| A | Instance envanteri | Orchestrator / process list | Writer API = 0 | **DUR** |
| B | ARI | ARI apps / connection list | Bağlı MonoSIP ARI yok | **DUR** |
| C | Stasis log | Asterisk/API log (pencere ≥ 2 dk) | Yeni `[flow]` / StasisStart yok | **DUR** |
| D | Internal CDR | Bilinen secret ile `POST /api/v1/internal/cdr` probe (lab callId) | Bağlantı yok veya yazma engelli; **yeni satır oluşmaz** | **DUR** |
| E | DB writers | `SELECT pid, usename, state, query FROM pg_stat_activity WHERE datname = current_database() AND query ILIKE '%cdr%';` | Ops `psql` dışında mutate yok | **DUR** |
| F | Insert freeze | `SELECT count(*) FROM cdr WHERE started_at > now() - interval '2 minutes';` (en az **2 dakika**, tercihen iki ölçüm) | Yeni satır **0** | **DUR** |
| G | Integrity | `GET https://<prod>/api/v1/admin/cdr-integrity` (**TLS doğrulamalı** `curl`, `-k` yok) | Auth OK; yazma durmuş; pre-dedupe’de `duplicateCallIdGroups` = **8** beklenir | Auth/TLS fail → **DUR** |

Health: `curl --fail-with-body https://<prod>/api/v1/health` (sistem CA / doğru cert). **`curl -sk` kullanma.**

### 3.3 Açma (SEQUENCE #13 — yalnız post-verify PASS)

API+ARI geri getir → lab/non-customer çağrı → tek CDR; aynı `call_id` retry çift üretmez.

---

## 4. Idempotent CDR API deploy (SEQUENCE #1)

| Madde | Değer |
|-------|--------|
| **Yetki** | Production deploy |
| **Komut** | Remediation build deploy → `curl --fail-with-body https://<prod>/api/v1/health` |
| **Beklenen** | `ok: true`; JSON’da **`cdr`** metrik nesnesi (`startOk` / `endFinalized` vb.) |
| **Başarısızlık** | `cdr` yok → eski build → **DUR** (SQL yok) |

---

## 5. Production preflight (SEQUENCE #5–6)

### 5.1 `00_lock_and_preflight.sql` — gerçek davranış

Dosya **otomatik LOCK almaz**. Çalıştırılan gövde yalnızca **read-only `SELECT`**’lerdir.

| Özellik | Gerçek |
|---------|--------|
| Çalışan SQL | `SELECT` grup sayımları, discard adayı **7244**, `SUM(billsec)`, G8 satırları, dup group count |
| `LOCK TABLE` | **Yok** — yalnızca dosya başındaki **yorumda** opsiyonel örnek |
| Kapsam (yorumdaki opsiyonel lock) | `LOCK TABLE cdr IN SHARE ROW EXCLUSIVE MODE` — yalnızca `cdr`; `INSERT/UPDATE/DELETE` engeller; `SELECT` izinli |
| Süre | Yorum örneği: `SET LOCAL lock_timeout = '15s'` — timeout’ta lock statement fail |
| Oturum | Opsiyonel lock: `BEGIN` … session/transaction bitene kadar; A/B scriptleri kendi `BEGIN/COMMIT`’lerine sahip → lock’u **manuel** aynı oturumda A/B ile birleştirmek ayrı ops tasarımı gerektirir |
| Bu checklist önerisi | Önce §3 ile ingest’i durdur; preflight için dosyayı olduğu gibi çalıştır; mutate öncesi ek sertlik istenirse **ayrı** oturumda yorumdaki `LOCK`’u bilinçli uygula (dosya kendisi kilitlemez) |

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f reports/qa-audit/architecture/cdr-dedupe/00_lock_and_preflight.sql
```

### 5.2 Beklenen değerler

| Kontrol | Beklenen |
|---------|----------|
| G1–G7 counts | 3639, 2748, 402, 207, 125, 81, 49 |
| G8 rows | **2** |
| `definite_discard_candidates` | **7244** |
| G8 SUM(billsec) | **40** |
| `dup_groups` | **8** (A+B öncesi) |
| Baseline | `SELECT coalesce(sum(billsec),0) FROM cdr;` → **kaydet** (SEQUENCE #6) |

Sapma → **DUR**, re-forensics.

---

## 6. SQL A → SQL B → 0019 (SEQUENCE #7–11)

| # | Adım | Komut | Beklenen | Fail |
|---|------|-------|----------|------|
| 7 | SQL A | `psql … -f …/01_definite_dedupe.sql` | archive `definite-g1-g7`=7244 | **DUR** |
| 8 | Verify A | counts / billsec | 7 keeper; G8=2; billsec=baseline | **DUR** → A rollback öner |
| 9 | SQL B | `psql … -f …/02_g8_manual_dedupe.sql` | `g8-manual`=1; G8 sum=20 | **DUR** |
| 10 | Verify B | dup query | **0** dup group | **DUR** — 0019 yok |
| 11 | 0019 | `psql … -f apps/api/drizzle/0019_cdr_call_id_unique.sql` | `cdr_call_id_uidx` | **DUR**. **`db:migrate` yok. 0020 yok.** |

---

## 7. Post-verify + rollback (SEQUENCE #12 + hata yolu)

| Madde | Değer |
|-------|--------|
| **Kaynak** | `CDR_POST_MIGRATION_VERIFICATION.md` |
| **Beklenen** | 8 keeper; G8 billsec=20; UNIQUE; integrity `ok: true`; `duplicateCallIdGroups: 0` |
| **Health** | `curl --fail-with-body https://<prod>/api/v1/health` — **`-k` yok** |
| **Rollback sırası** | `0019_…down.sql` → `02_g8_manual_rollback.sql` → `01_definite_dedupe_rollback.sql` → G1–G7=**7251**, G8=**2** |
| **Karar** | Rollback’i otomatik uygulama; durumu raporla, operatör onaylasın |

---

## Yeşil ışık (uygulama öncesi)

- [ ] Geçici min-privilege DB erişimi + secret yönetimi  
- [ ] Backup restore-tested  
- [ ] SEQUENCE #1: health’te `cdr` (TLS doğrulamalı)  
- [ ] SEQUENCE #3–4: §3.2 A–G hepsi PASS (yalnızca 60s COUNT değil)  
- [ ] SEQUENCE #5–6: preflight discard=7244, G8=2; baseline kayıtlı  
- [ ] `00_lock_and_preflight.sql` = SELECT-only olduğu biliniyor; opsiyonel LOCK ayrı ve bilinçli  

Sonra SEQUENCE #7’den uygula.
