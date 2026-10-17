# Ekranlar

Yönetici paneli 15 ekrandan, kullanıcı portalı 5 ekrandan oluşur. İkisi aynı Vite uygulamasında, giriş yapanın rolüne göre farklı yerleşimle açılır.

## Yönetici paneli

| Ekran | İçerik |
| --- | --- |
| Pano | Aktif çağrılar, kuyrukta bekleyenler, dahili durumları, hat durumu, bugünün özeti; tam ekran (TV) modu |
| Dahililer | Liste (durum, DND, cihaz); detay sekmeleri: genel, yönlendirme, yetkiler, kayıt, portal, cihazlar; CSV içe/dışa aktarma |
| Zil grupları | Liste ve düzenleme |
| Kuyruklar | Liste; detay: ayarlar, üyeler (sürükle-bırak sıra, mola), anonslar, taşma hedefleri |
| Zaman planları | Haftalık plan editörü, tatil takvimi, elle geçersiz kılma, "şu an" durumu |
| Menüler (akışlar) | Liste; tasarımcı: kanvas, düğüm paleti, düğüm ayarları paneli, test çağrısı paneli, sürüm geçmişi |
| Hatlar | SIP sağlayıcı listesi, ekleme formu, canlı durum |
| Rotalar | Gelen ve giden rotalar, kara liste |
| Sesler | Anons yükleme, TTS ile üretme, bekleme müzikleri |
| Ses kayıtları | Filtreli liste, dalga formlu oynatıcı, indirme, erişim logu |
| Çağrı logları | Filtreli CDR tablosu, çağrı zaman çizelgesi (akış adımları dahil), Excel çıktısı |
| Kaçan çağrılar | Bekliyor / dönüldü listesi |
| Raporlar | Özet, kuyruk, dahili, IVR tuşlama, ses kalitesi; tarih aralığı |
| Entegrasyon | Webhook'lar, API anahtarları |
| Ayarlar | Genel; güvenlik (yönetici/portal/SIP IP izin ve engel listeleri, yasak listesi, güvenlik duvarı dışa aktarma, giriş taşkını); ülke/fatura limiti; KVKK; e-posta; yedekleme; işlem logları; 2FA |

## Kullanıcı portalı

| Ekran | İçerik |
| --- | --- |
| Telefon | Softphone: tuş takımı, aktif görüşme kontrolleri, son aramalar |
| Rehber | İş arkadaşları ve durumları, arama |
| Çağrılarım | Gelen, giden, cevapsız; geri arama |
| Kayıtlarım | Liste ve oynatıcı (yalnızca dinleme) |
| Ayarlarım | DND, yönlendirme, sesli mesajlar, şifre, ses cihazları |

## Ortak arayüz kuralları

- Masaüstünde sol menü, mobilde alt sekme çubuğu (portal) veya açılır menü (yönetici).
- Açık/koyu tema; sistem tercihini izler, elle değiştirilebilir.
- Tablolar mobilde kart görünümüne geçer; akış tasarımcısı mobilde salt görüntüleme olur.
- Arayüz metinleri İngilizce varsayılan; Türkçe seçilebilir. Tarih ve sayı biçimleri tr-TR.
