# DSip

**Şirket santrali** — açık kaynak Asterisk VoIP; yönetim paneli ve tarayıcı softphone. Küçük ofisler için (~20 dahili). Linux sanal sunucuda Docker Compose olarak çalışır.

[Kurulum](docs/KURULUM.md) · [Özellikler](docs/01-ozellikler.md) · [Mimari](docs/MIMARI.md) · [Site](site/index.html) · [Sürüm v1.0.0](https://github.com/diggyen/DSip/releases/tag/v1.0.0)

Varsayılan arayüz dili: **İngilizce** (uygulamada Türkçe seçilebilir).

## Hızlı başlangıç

```bash
git clone https://github.com/diggyen/DSip.git
cd DSip
cp .env.example .env
chmod +x scripts/gen-certs.sh && ./scripts/gen-certs.sh
docker compose up --build -d
```

**https://localhost** adresini açın (kendi imzalı sertifika — tarayıcı uyarısını kabul edin).

| Rol | Giriş | Şifre |
| --- | --- | --- |
| Yönetici | `admin@example.com` | `Admin123!` |
| Portal (dahili 101) | `101` | `portal101` |

Bunlar laboratuvar şifreleridir — üretimde değiştirin.

## Neler gelir

- Dahililer, hatlar, gelen/giden rotalar, kara liste  
- Zil grupları, kuyruklar (anons + geri arama), zaman planları ve tatiller  
- Görsel IVR / akış tasarımcısı (ARI)  
- Portal softphone (SIP.js + coturn), masa telefonu provizyonu  
- Canlı pano, dinleme/fısıldama, CDR, kayıtlar, raporlar  
- Ayarlardan hostname + otomatik Let's Encrypt SSL  

Tam liste: **[docs/01-ozellikler.md](docs/01-ozellikler.md)**

## Yığın

| Servis | Rol |
| --- | --- |
| `nginx` | HTTPS, ACME, ters vekil (API, web, Asterisk WSS) |
| `web` | Yönetici + portal (React) |
| `api` | Fastify, ARI akış motoru, yapılandırma yazıcı, SSL istemcisi |
| `asterisk` | Asterisk 22 (PJSIP, ARI, AMI, WebRTC) |
| `postgres` | Ayarlar, CDR, akışlar (**kalıcı birim**) |
| `coturn` | Ofis dışı softphone için TURN |
| `tts` | Piper TTS (TR/EN anonslar) |

Veri, adlı birimler sayesinde yeniden derlemede kalır (`pgdata`, `recordings`, …). Bkz. [KURULUM.md](docs/KURULUM.md).

## Üretim

Linux’ta Docker kullanın. `EXTERNAL_IP`, `PUBLIC_HOST`, güçlü gizliler ayarlayın; sonra Yönetici → Ayarlar’da **Otomatik SSL**’i açın. Masa telefonları → `EXTERNAL_IP:5060`.

Rehber: **[docs/VPS-DAGITIM.md](docs/VPS-DAGITIM.md)**

## Belgeler

Tüm belgeler **[docs/](docs/README.md)** altında. Statik ürün sitesi: **[site/](site/index.html)** (yerelde açın veya GitHub Pages ile `/site` yayınlayın).

## Lisans / sahiplik

[@diggyen](https://github.com/diggyen) tarafından sürdürülür.
