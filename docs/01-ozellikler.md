# Özellik kapsamı

Bu liste, kararlaştırılan özelliklerle Netsipp, Verimor, Karel, Yeastar ve Aircall incelemesinden alınanları birleştirir. Hangi özelliğin hangi fazda geleceği [TASKS.md](../TASKS.md) dosyasında.

## Dahililer

- Dahili ekleme, düzenleme, silme (yalnızca admin); CSV ile toplu içe ve dışa aktarma.
- Arama yetkileri: yurt içi sabit, cep, 444, yurt dışı; dahili bazında ses kaydı ve arama engelleme.
- Dahiliye özel dış numara (giden aramada görünen numara).
- Yönlendirme: cevap yok (çalma süresiyle), meşgul, ulaşılamıyor; her biri ayrı hedef. Zincirleme en fazla 5 adım, aynı dahiliye ikinci kez gitmez.
- Cep telefonuna yönlendirme, dahili bazında izinle.
- Sunucu taraflı DND: telefon tuşu, `*78` aç / `*79` kapat, panel ve portaldan anahtar. DND'deki dahiliye gelen çağrı "meşgul" hedefine gider; kuyrukta atlanır.
- Sesli mesaj, e-posta ile iletim.
- Çağrı çekme (pickup), dahililerin birlikte çalması.
- Danışarak ve doğrudan aktarma, bekletme.
- BLF meşguliyet ışıkları, iç/dış aramaya göre farklı zil sesi.
- 112 her zaman açık: yetki kısıtı veya fatura limiti onu engellemez.
- IP telefon otomatik provizyonu (Yealink, Fanvil, Grandstream; MAC ile) ve karekodla hazır softphone kurulumu.

## Gruplar ve kuyruklar

- Zil grupları: hepsi birden veya sırayla çalar.
- Kuyruklar: dağıtım stratejisi (hepsi birden, en uzun boşta kalan, en az çağrı alan, sırayla, sabit sıra, rastgele).
- Üyeler yalnızca panelden eklenip çıkarılır; admin üyeyi molaya alabilir.
- Temsilci çalma süresi, toparlanma süresi (wrap-up), öncelik (penalty).
- Arayan tarafı: bekleme müziği, sıra ve tahmini bekleme anonsu.
- Taşma hedefleri: azami bekleme süresi doldu, kuyruk dolu, hiç temsilci yok.
- Geri arama: "Sıranızı kaybetmeden geri aranmak için 1'e basın."
- Öncelikli sıra: akıştaki bir değişken (ör. `vip=true`) arayanı öne alır.

## Zaman planları

- Haftalık plan: günde birden fazla aralık, öğle arası ayrı durum.
- Resmi tatiller: sabit tatiller otomatik, bayramlar yıllık liste, arifeler yarım gün; şirkete özel günler.
- Öncelik: özel gün > tatil > haftalık plan.
- Elle geçersiz kılma: Otomatik / Şimdi açık / Şimdi kapalı, isteğe bağlı bitiş saatiyle.
- Her duruma (açık, öğle arası, mesai dışı, tatil) ayrı hedef veya menü; saate göre farklı karşılama.
- Saat dilimi: Europe/Istanbul.

## Hatlar ve rotalar

- Birden fazla SIP sağlayıcı: kayıtlı (kullanıcı/şifre) veya IP tabanlı; protokol, codec, kanal sınırı, numara formatı.
- Hat durumu (kayıt, gecikme) panelde; hat düşerse e-posta uyarısı.
- Giden rotalar: önek kuralları, sağlayıcı önceliği ve yedeklemesi.
- Gelen rotalar: numara (DID) → hedef; arayan numaraya göre kural; kara liste; gizli numara engelleme; varsayılan rota.
- Ortak hedef yapısı: dahili, zil grubu, kuyruk, menü, zaman planı, sesli mesaj, harici numara, anons çal ve kapat. Sistemin her yerinde aynı hedef seçici.
- Geri dönen aramayı arayana bağlama: dahilinin son 12 saatte ulaşamadığı numara geri ararsa doğrudan o dahiliye gider.
- Fatura stop: günlük ve aylık dakika/tutar limiti.
- Ülkeye göre giden arama kısıtı, anormal arama sıklığında dahiliyi durdurma.

## Kayıt ve loglar

- Dahili veya kuyruk bazında kayıt; gelen ve giden aramada KVKK anonsu.
- Kayıtlar Opus'a dönüştürülür; saklama süresi dolunca otomatik silinir; NAS veya SFTP'ye otomatik arşiv.
- Panelde dalga formlu oynatıcı; admin indirebilir.
- Çağrı logları (CDR): filtre, Excel çıktısı, kayda bağlantı, DND'de gelen çağrılar işaretli.
- Kaçan çağrılar: liste, e-posta bildirimi, geri dönülünce otomatik "Dönüldü" işareti.

## İzleme ve raporlar

- Canlı pano: aktif çağrılar, kuyrukta bekleyenler, dahili durumları; TV için tam ekran modu.
- Yönetici için canlı dinleme, fısıldama, araya girme (her kullanım loglanır).
- Raporlar: cevaplanan, cevapsız, terk edilen; bekleme ve konuşma süreleri; hizmet seviyesi; dahili ve kuyruk bazında.
- IVR tuşlama raporu: hangi tuşa basıldı, nerede kapatıldı.
- Ses kalitesi: her çağrı için jitter, paket kaybı, MOS.
- Otomatik e-posta raporları: günlük özet ve aylık rapor (PDF, Excel).

## Entegrasyon

- Webhook: çağrı geldi, cevaplandı, bitti, kaçtı (CRM'de müşteri kartı açmak için).
- REST API: arama başlatma (click-to-call), CDR ve kayıt erişimi; API anahtarıyla.
- Kritik olaylarda e-posta: hat düştü, fatura limiti, şüpheli arama.

## Kapsam dışı

| Özellik | Neden |
| --- | --- |
| Kredi kartı tahsilatı, kapıda ödeme onayı | PCI yükü; şirket santrali için gereksiz |
| Hazır e-ticaret entegrasyonları | Gerekirse API düğümüyle kurulur |
| Otomatik arama kampanyası, İYS | Çağrı merkezi ölçeği |
| Ticket sistemi, çağrı formları, etiketleme | Webhook ile mevcut araçlara bağlanır |
| Temsilci puanlama | Akış içinde kısa anketle karşılanır |
| Ayrı TV uygulaması | Panonun tam ekran modu yeterli |
| Dijital faks, GSM SIM hattı, şubeler arası trunk | Donanım veya ek yapı gerekir; trunk yapısı genel olduğu için sonra eklenebilir |
| Uzaktan santral üzerinden arama (DISA) | Dolandırıcılık riski |
| Kendi mobil ve masaüstü uygulamamız | Portal + hazır softphone yeterli |
| Google Drive, Google Kişiler | Yerine NAS / SFTP arşivi |
| WhatsApp, canlı sohbet, video, ekip sohbeti | Santralin işi değil |
| Hot desking, LDAP / AD | 20 dahili ve tek admin için fazla |
| Otel modülü | Kapsam dışı |
| Çağrı park, camp-on, sayfalama / interkom, yönetici–sekreter | Kapsam dışı |
| AI transkript (Whisper), AI sesli asistan düğümü | Kapsam dışı |
| SMS düğümü | Kapsam dışı |

## Teknik yığın

| Katman | Teknoloji |
| --- | --- |
| Medya / SIP | Asterisk 22, PJSIP, ARI, AMI, WebRTC |
| API | Node 24, Fastify, Drizzle, PostgreSQL 17 |
| Arayüz | React, Vite, TanStack Query, SIP.js |
| Kenar | nginx (TLS, WSS), coturn |
| Metinden sese | Piper (+ TTS servisinde edge-tts yedek) |

Kalıcılık: Docker adlı birimleri (`pgdata`, `recordings`, …) — bkz. [KURULUM.md](KURULUM.md).

## Yönetim ve işletim (özet)

- Canlı pano + TV modu (WebSocket): çağrılar, kuyruklar, dahililer, hatlar
- Dinleme / fısıldama / araya girme (ARI snoop), kapatma
- Raporlar: özet, kuyruk, dahili, IVR tuşlama, kalite; günlük/aylık e-posta (SMTP veya yalnızca günlük)
- Webhook + API anahtarları (arama başlatma, CDR, kayıtlar)
- Yedek / geri yükleme JSON; panelden Asterisk yapılandırma yenileme
- **Hostname ve otomatik SSL** — Let's Encrypt HTTP-01, nginx sertifikalarına kurulum, periyodik yenileme kontrolü
- Güvenlik: yönetici 2FA (TOTP + Apple Passwords bağlantısı), IP izin listeleri, giriş taşkın yasağı, isteğe bağlı fail2ban profili, güvenlik duvarı dışa aktarma
