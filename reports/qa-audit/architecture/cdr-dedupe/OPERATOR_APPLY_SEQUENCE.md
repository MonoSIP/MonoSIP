# Operatör — tek uygulama sırası

**Bu dosya production CDR dedupe için tek sıralı listedir.**  
Onay yoksa çalıştırma. Production’a bu listeden bağımsız SQL/migrate uygulama.

Kaynak doğruluk: `keeper-manifest.json` · `01_*.sql` · `02_*.sql` · `03_enforce_unique.sql`  
Güvenlik / ingest ayrıntısı: `OPERATOR_PREFLIGHT_CHECKLIST.md`  
Erişim teslimi: `OPERATOR_ACCESS_HANDOFF.md`  
(çelişkide **bu sequence** esas).

---

## Beklenen sabitler

| Sabit | Değer |
|-------|------:|
| G1–G7 discard | **7244** |
| G1–G7 keepers after A | **7** |
| G1–G7 rows after rollback | **7251** |
| G8 before B | **2** (SUM billsec **40**) |
| G8 after B | **1** (SUM billsec **20**) |
| Dup groups after A+B | **0** |
| Archive A | `definite-g1-g7` = 7244 |
| Archive B | `g8-manual` = 1 |

### Keeper UUID’ler (manifest ile birebir)

| call_id | keeper UUID |
|---------|-------------|
| 1793211608.40 | `c80c248f-6b47-4e1f-8029-71add1b3d085` |
| 1793217547.7 | `91a91b63-75e2-4e50-9aa1-5e33e6533da7` |
| 1793211593.39 | `9476a2c5-d036-4341-8dbd-f103546c8aa4` |
| 1793211552.38 | `b623af1b-b7e2-4b17-8da0-443d4e751203` |
| 1793211511.36 | `4ee7b799-8e64-4e4d-b67d-95dc9d661b02` |
| 1793215834.0 | `f33e5eb0-0253-4c2b-88c9-ba8832b06c15` |
| 1793215885.1 | `ab81759e-2d08-4ccc-bb01-0df414a46259` |
| 1793233454.37 (G8) | `b28b0280-4f16-4c7c-a4b1-2777bb0c03de` |

G8 discard (archive only): `68da5aff-65d2-4773-aab3-2db95a417ca6`

---

## Sıra (birebir)

| # | Adım | Dosya / komut | Beklenen | Durdur |
|---|------|---------------|----------|--------|
| 1 | Idempotent CDR kodunu deploy et | API build (cdrStart/cdrEnd remediation) | Canlı sürümde tek-satır ingest | Deploy yok / eski kod |
| 2 | Backup doğrula | Snapshot / restore point | Geri yüklenebilir | Backup yok |
| 3 | CDR ingest’i durdur | Tüm API/ARI/Stasis + dialplan ingest | § checklist 3.1–3.2 (instance+ARI+Stasis+retry+DB; ≥2 dk insert=0) | Herhangi katman hâlâ yazıyor |
| 4 | Integrity / yazma yok | `GET /api/v1/admin/cdr-integrity` (**TLS doğrulamalı**; `-k` yok) | `duplicateCallIdGroups` = 8 (henüz); yazma durmuş | Insert / TLS fail |
| 5 | Preflight | `00_lock_and_preflight.sql` (**yalnız SELECT**; otomatik LOCK yok) | Counts = tablo; discard=7244; G8=2 | Herhangi sapma |
| 6 | Baseline billsec kaydet | `SELECT coalesce(sum(billsec),0) FROM cdr` | Not et | — |
| 7 | **SQL A** | `01_definite_dedupe.sql` | COMMIT; archive 7244 | ERROR / ROLLBACK |
| 8 | Verify A | 7 keepers; G8=2; sum(billsec)=baseline; batch `definite-g1-g7`=7244 | Aksi halde → rollback A |
| 9 | **SQL B** | `02_g8_manual_dedupe.sql` | COMMIT; archive 1; G8 sum=20 | ERROR → rollback B (A’yı da gerekirse) |
| 10 | Verify B | `HAVING count(*)>1` → **0 satır** | Dup kaldıysa UNIQUE yok |
| 11 | **UNIQUE enforce** | `psql -f …/cdr-dedupe/03_enforce_unique.sql` | `cdr_call_id_uidx` UNIQUE | Dup exception |
| 12 | Post-verify | `CDR_POST_MIGRATION_VERIFICATION.md` | 8 keeper; G8 billsec 20; integrity ok=true | Eksik keeper / dup |
| 13 | Ingest aç | API/ARI | Yeni çağrı → 1 CDR | — |
| 14 | *(ayrı pencere)* 0020 | zaten soft-0019 boot’ta gelmiş olabilir; yoksa `0020_….sql` | Indexler | Dedupe ile karıştırma |

### UNIQUE / migrate notu

`db:migrate` içindeki `0019_cdr_call_id_unique.sql` **soft-defer**: duplicate varken NOTICE + no-op (API boot düşmez).  
Production storm temizliği sonrası UNIQUE için **`03_enforce_unique.sql`** kullan (sert FAIL).

---

## Hata → rollback sırası

1. `0019_cdr_call_id_unique.down.sql` (UNIQUE varsa)  
2. `02_g8_manual_rollback.sql` (B uygulandıysa)  
3. `01_definite_dedupe_rollback.sql` (A uygulandıysa)  
4. Bekle: G1–G7 = 7251, G8 = 2  
5. Ya da pre-window backup restore  

Ayrıntı: `../CDR_ROLLBACK_RUNBOOK.md`
