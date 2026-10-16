# Veri modeli

Tüm ayarlar PostgreSQL'de tutulur; Asterisk yapılandırması buradan üretilir. Hedef alanları her tabloda aynı çift kolonla tutulur: `dest_type` + `dest_id`.

| Tablo | Ana alanlar |
| --- | --- |
| `extensions` | numara, ad, e-posta, sip_secret (şifreli), portal_password_hash, portal_enabled, recording_mode, recording_listen_allowed, outbound_cli, call_permissions, mobile_forward_allowed, dnd, voicemail_pin |
| `extension_forwarding` | extension_id, durum (no_answer / busy / unavailable), ring_seconds, dest_type, dest_id |
| `devices` | extension_id, model, mac, provisioning_profile, son kayıt zamanı |
| `ring_groups` | ad, numara, strateji, çalma süresi, cevapsız hedefi |
| `ring_group_members` | ring_group_id, extension_id, sıra |
| `queues` | ad, numara, strateji, member_timeout, wrapup, max_wait, max_callers, anons ayarları, moh_id, schedule_id, taşma hedefleri, callback_enabled |
| `queue_members` | queue_id, extension_id, penalty, paused, pause_reason |
| `schedules` | ad, timezone, override_mode, override_until |
| `schedule_ranges` | schedule_id, gün, başlangıç, bitiş, durum (open / lunch) |
| `holidays` | schedule_id (boşsa genel), tarih, yarım gün mü, ad |
| `trunks` | ad, host, port, transport, auth_type, username, secret (şifreli), codecs, max_channels, numara formatı kuralları, durum |
| `inbound_routes` | did, caller_pattern, öncelik, dest_type, dest_id |
| `outbound_routes` | ad, pattern, önek düzenleme, sıralı trunk listesi, gerekli izin |
| `blacklist` | numara veya desen, yön, not |
| `flows` | ad, draft_json, published_version_id |
| `flow_versions` | flow_id, sürüm no, json, yayınlanma zamanı |
| `secrets` | API düğümleri için şifreli token ve parolalar |
| `prompts` | ad, dil, dosya yolu, TTS kaynağı |
| `moh_classes` | ad, dosyalar |
| `cdr` | call_id (linkedid), başlangıç, cevap, bitiş, yön, arayan, aranan, did, dahili, kuyruk, sonuç, süre, trunk_id, recording_id, dnd_flag, kalite (jitter, kayıp, MOS) |
| `call_events` | call_id, zaman, tür, veri (CEL ve akış adımları; IVR tuşlama raporu buradan) |
| `queue_events` | Asterisk `queue_log` kayıtları |
| `recordings` | call_id, dosya yolu, süre, boyut, silinme zamanı, arşivlendi mi |
| `recording_access_log` | recording_id, kim (admin / dahili), zaman |
| `missed_calls` | numara, hedef, zaman, durum (bekliyor / dönüldü), dönüş call_id |
| `voicemails` | extension_id, arayan, zaman, dosya, okundu mu |
| `spend_limits` | kapsam (genel / dahili), günlük ve aylık limit, o anki tüketim |
| `webhooks` | URL, olay türleri, imza anahtarı, aktif mi |
| `api_keys` | ad, hash, izinler, son kullanım |
| `audit_log` | aktör, işlem, nesne, önceki ve sonraki değer, IP, zaman |
| `settings` | genel ayarlar (KVKK saklama süresi, e-posta sunucusu, yedekleme, IP kısıtları) |
