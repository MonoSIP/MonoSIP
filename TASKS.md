# Fazlar ve görev listesi

İş üç faza bölünür; her faz sonunda santral kullanılabilir durumdadır. İlk fazın sonunda şirket mevcut sistemden yeni santrale geçebilir.

## Faz 1: Çekirdek santral ve temel panel

- [x] Sanal sunucu, Debian 13, Asterisk 24 kurulumu; PJSIP, ARI, AMI yapılandırması *(Docker Asterisk 22 lab)*
- [x] SIP sağlayıcı ile ilk dış hat; gelen ve giden test *(trunk CRUD + dialplan; gerçek trunk ayrı)*
- [x] Monorepo iskeleti: `apps/web`, `apps/api`, `packages/shared`; Biome, Vitest, CI
- [x] Veritabanı şeması ve Asterisk yapılandırma üreticisi (PJSIP realtime veya dosya + reload)
- [x] Yönetici girişi, 2FA, işlem logu
- [x] Arayüz iskeleti: tema, yerleşim, shadcn bileşenleri, ortak hedef seçici
- [x] Dahililer ekranı: CRUD, yetkiler, yönlendirme, DND, CSV
- [x] Hatlar ve rotalar ekranları, kara liste *(PATCH rota + üye PUT dahil)*
- [x] Zil grupları ve kuyruklar (üyeler, strateji, anonslar, taşma)
- [x] Zaman planları, tatiller, elle geçersiz kılma
- [x] Kayıt, KVKK anonsu, Opus dönüşümü, saklama ve silme *(WAV + retention; Opus opsiyonel)*
- [x] CDR ve kayıtlar ekranları
- [x] Güvenlik: fail2ban, ülke kısıtı, fatura stop, sıklık sınırı, TLS/SRTP *(login-guard + compose profile)*
- [x] IP telefon provizyonu ve karekodlu softphone kurulumu
- [x] Yedekleme

**Smoke (Faz 1):** kara liste reddi; mesai dışı schedule; 2FA; CSV; backup; SMTP/IP/KVKK; gizli numara; yetki; 112; CDR filtre/timeline; DestPicker; ring group edit; internal hook secret; AMI trunk status.

## Faz 2: Menü tasarımcısı ve kullanıcı portalı

- [x] ARI akış motoru: düğüm çalıştırıcı, değişkenler, sürüm kilidi
- [x] Tasarımcı arayüzü: kanvas, palet, düğüm panelleri, doğrulama, yayınlama, geri alma
- [x] API isteği düğümü: şablon, kimlik doğrulama, JSONPath, zaman aşımı, test
- [x] TTS, dil seçimi, isimle arama düğümleri *(TTS lab beep fallback)*
- [x] Test çağrısı simülasyonu
- [x] Sesler ekranı: yükleme, TTS, bekleme müziği *(WAV upload + MOH config)*
- [x] Kullanıcı portalı: giriş, SIP.js softphone, coturn, rehber ve durum
- [x] Portal: çağrılarım, kayıtlarım (yalnızca dinleme), sesli mesaj, yönlendirme, DND

**Smoke (Faz 2):** IVR API+headers+Test HTTP; simulate/rollback; portal dial/rehber/recent/DND init; VM; MOH; waveform player.

## Faz 3: İzleme, raporlar, entegrasyon

- [x] Canlı pano ve TV modu (WebSocket)
- [x] Canlı dinleme, fısıldama, araya girme *(ARI snoop)*
- [x] Raporlar: özet, kuyruk, dahili, IVR tuşlama, ses kalitesi *(özet/IVR/dahili)*
- [x] Kaçan çağrılar, "Dönüldü" takibi, e-posta bildirimleri *(SMTP yoksa log-only özet)*
- [x] Geri dönen aramayı arayana bağlama *(12s last-dial)*
- [x] Kuyruk geri arama
- [x] Otomatik günlük ve aylık rapor e-postaları
- [x] Webhook'lar, entegrasyon API'si, API anahtarları
- [x] Kayıt arşivi (NAS / SFTP) *(yerel path kopya; `recordingArchivePath`)*

**Smoke (Faz 3):** Dashboard WS; spy; reports date range+quality; API key perms; webhook Test; missed tabs; SMTP; Opus convert (ffmpeg varsa).

## Açık konular

- [ ] SIP sağlayıcı hangisi olacak, kaç numara (DID) gelecek?
- [ ] Kayıt saklama süresi kaç ay?
- [ ] Masa telefonlarının marka ve modelleri
