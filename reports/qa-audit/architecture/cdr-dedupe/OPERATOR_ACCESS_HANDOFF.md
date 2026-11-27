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

## Şu anki durum (son kontrol — 2026-11-27T19:56Z)

| Madde | Durum |
|-------|--------|
| Kod + SQL + lab + docs paketi | Hazır (`READY FOR CONTROLLED PRODUCTION EXECUTION`) |
| Preflight counts vs forensics (Admin CDR API walk) | **MATCH** — `prod_preflight_refresh.json` (7504 rows, 8 groups, discard 7244, G8 billsec 40) |
| Production health `cdr` metrik alanı | **Yok** |
| `GET /api/v1/admin/cdr-integrity` | **404** — remediating image **not live** on `sip.dgn.tr` |
| SSH to STUN IP `95.130.168.22:22` | **Connection refused** |
| Production DB `psql` / NineDeploy panel (agent) | **Yok** — SEQUENCE #1 (deploy) blocked until operator redeploys `ghcr.io/monosip/monosip:main` |
| Production SQL A/B / 0019 | **Not touched** |

### Agent’in devam edebilmesi için tek eksik sinyal

NineDeploy (veya mevcut orchestrator) üzerinde remediating image’ı deploy et; sonra doğrula:

```bash
curl --fail-with-body https://sip.dgn.tr/api/v1/health
# JSON içinde "cdr": { … } olmalı
```

Deploy + backup restore kanıtı + “ingest pause yetkisi var” mesajından sonra SEQUENCE #3’ten uygulanır.
