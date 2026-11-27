# Operatör erişim teslim listesi (production uygulama öncesi)

**Amaç:** CDR remediation üretim uygulaması için gereken erişimleri tek seferde tamamlamak.  
**Uygulama otoritesi:** `OPERATOR_APPLY_SEQUENCE.md`  
**Güvenlik ayrıntısı:** `OPERATOR_PREFLIGHT_CHECKLIST.md`

Şifre / private key / raw `DATABASE_URL` bu dosyaya veya sohbete yazılmaz. Secret’ler vault / encrypted channel ile verilir.

Agent ortamında erişim **hazır sayılır** ancak şu doğrulamalar geçerse:

1. Production `psql` (geçici min-privilege rol) çalışır  
2. Tüm API + Asterisk instance’larına ops erişimi vardır  
3. Restore-tested backup kanıtı vardır  
4. Idempotent API deploy edilebilir ve `GET /api/v1/health` TLS ile `cdr` nesnesi döner  

Sonra onaylı sıra uygulanır (tekrar onay istenmez; veri/backup/SQL sapmasında **DUR**):

`backup → idempotent API deploy → ingest pause → preflight → SQL A → SQL B → 0019 → post-verification → ingest resume`  
**0020 ayrı pencere.**

---

## Teslim checklist (operatör doldurur)

### 1. PostgreSQL

- [ ] Erişim yöntemi: vault `DATABASE_URL` **veya** bastion/`docker exec` + `psql`
- [ ] Geçici rol (örn. `cdr_dedupe_ops_<tarih>`), superuser değil
- [ ] Yetkiler: `CONNECT`; `cdr` SELECT/INSERT/UPDATE/DELETE; archive için CREATE veya önceden tablo; 0019 için index CREATE/DROP
- [ ] TLS: `sslmode=require` veya `verify-full` (mümkünse)
- [ ] İşlem sonrası: REVOKE / DROP ROLE / secret rotate planı
- [ ] Doğrulama: `SELECT current_database(), current_user;` → production DB + geçici rol

### 2. SSH / Docker / orchestration

- [ ] Tüm API replica + Asterisk için ops hesabı
- [ ] Yetki: list, logs, scale/stop/start, `exec` (Asterisk CLI)
- [ ] Envanter dokümante (kaç API, kaç Asterisk)
- [ ] Local Compose host production değildir

### 3. Backup + restore

- [ ] Pre-dedupe tagged snapshot veya dump
- [ ] İzole restore denemesi yapıldı
- [ ] Restore sonrası `count(*)` CDR kaydı + zaman damgası

### 4. Ingest stop / start

- [ ] Tüm instance’da durdurma prosedürü yazılı
- [ ] Doğrulama: API/ARI/Stasis/dialplan/retry/`pg_stat_activity` + ≥2 dk insert=0  
      (yalnızca 60s COUNT değil — checklist §3)
- [ ] Açma yalnızca post-verify PASS sonrası

### 5. Idempotent API deploy

- [ ] Remediation image/tag registry’de
- [ ] Production deploy yetkisi
- [ ] `curl --fail-with-body https://<prod>/api/v1/health` → **`cdr` alanı var**  
      (`curl -k` / `-sk` yasak)

### 6. Ağ / TLS / allowlist

- [ ] VPN veya bastion
- [ ] Ops/runner IP → `pg_hba` + SSH (+ gerekirse admin API)
- [ ] Geçerli sunucu sertifikası (veya private CA trust); TLS doğrulama açık
- [ ] Admin `cdr-integrity` için auth secret vault’ta

---

## Agent’a “erişim hazır” sinyali

Operatör yukarıdakileri tamamlayıp agent’a **yalnızca** şunu bildirir (secret içermeden):

- Vault/env referans adları (değer değil)
- SSH host alias / orchestration target adları
- Backup kanıtının konumu (path veya ticket id)
- Deploy edilen API tag
- Health’te `cdr` görüldüğüne dair onay

Agent o zaman SEQUENCE’i uygular ve başarıda durumu **PRODUCTION EXECUTION VERIFIED** yapar.

---

## Şu anki durum (2026-11-27T21:00Z)

| Madde | Durum |
|-------|--------|
| Kod + SQL + lab + docs paketi | Hazır |
| Remediating image on `sip.dgn.tr` | **Live** (`monosip-352`, health + `cdr`) |
| Preflight | **MATCH** then applied |
| SQL A / SQL B / UNIQUE (`03_enforce_unique`) | **DONE** |
| Post-verify | **PASS** — 259 rows, 0 dups, `cdr_call_id_uidx` |
| Record | `PRODUCTION_EXECUTION_RECORD.md` |

**PRODUCTION EXECUTION VERIFIED.**
