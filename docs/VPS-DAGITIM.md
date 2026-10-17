# VPS üzerinde DSip dağıtımı (Docker)

**Linux’ta Docker kullanın.** Güçlü bir gerekçe yoksa Asterisk / Node / Postgres’i elle kurmayın. Mac Docker Desktop NAT sorunu, UDP portları yayınlanmış normal bir Linux sanal sunucuda geçerli değildir.

Öneri: Debian 12/13 veya Ubuntu 22.04+, 2–4 vCPU, 4–8 GB RAM, genel IPv4.

## 1. Sunucu hazırlığı

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git curl
sudo usermod -aG docker "$USER"   # ardından yeniden giriş yapın
```

Depoyu klonlayın, sonra:

```bash
cp .env.example .env
```

`.env` dosyasını düzenleyin (`pbx.example.com` / `203.0.113.10` örneği):

```env
EXTERNAL_IP=203.0.113.10
PUBLIC_HOST=pbx.example.com
PUBLIC_URL=https://pbx.example.com
SIP_DOMAIN=pbx.example.com
SIP_WSS_URL=wss://pbx.example.com/asterisk-ws
TURN_REALM=pbx.example.com

POSTGRES_PASSWORD=…          # güçlü
SESSION_SECRET=…             # ≥32 rastgele karakter
ENCRYPTION_KEY=…             # 64 hex karakter
ADMIN_PASSWORD=…
ASTERISK_ARI_PASSWORD=…
ASTERISK_AMI_PASSWORD=…

# İsteğe bağlı
# RECORDING_ARCHIVE_PATH=/data/archive
# TZ=Europe/Istanbul
```

## 2. TLS sertifikası

**Tercih edilen:** yığın ayağa kalktıktan sonra **Yönetici → Ayarlar → Hostname ve SSL** açın, genel hostname yazın, **Otomatik SSL**’i açıp kaydedin. DSip Let's Encrypt kullanır (80. portta HTTP-01), `docker/nginx/certs/cert.pem` + `key.pem` yazar ve otomatik yeniler.

Yalnızca laboratuvar / çevrimdışı:

```bash
./scripts/gen-certs.sh   # kendi imzalı
```

## 3. Güvenlik duvarı

Yalnızca gerekeni açın:

| Port | Protokol | Kim |
| --- | --- | --- |
| 443 | TCP | Herkes (panel + WSS softphone) |
| 80 | TCP | ACME / yönlendirme (isteğe bağlı) |
| 5060 | UDP/TCP | Masa / softphone **veya** yalnızca SIP trunk sağlayıcı |
| 10000–10100 | UDP | RTP (SIP ile aynı eşler) |
| 3478 | UDP/TCP | TURN (ofis dışı WebRTC) |
| 49152–49200 | UDP | TURN rölesi |

**5060 + RTP**’yi ofis / VPN / trunk IP’leriyle sınırlamak tercih edilir. SIP’i tüm internete açmak ücretli dolandırıcılık taramalarını davet eder.

```bash
# ufw örneği
sudo ufw allow 443/tcp
sudo ufw allow 80/tcp
sudo ufw allow from OFIS_VEYA_VPN_CIDR to any port 5060 proto udp
sudo ufw allow from OFIS_VEYA_VPN_CIDR to any port 10000:10100 proto udp
sudo ufw allow 3478
sudo ufw enable
```

Masa telefonları NAT arkasındaysa ofis yönlendiricisinde **SIP ALG**’yi kapatın.

## 4. Başlatma

```bash
docker compose up --build -d
docker compose ps
curl -sk https://"$PUBLIC_HOST"/api/v1/health || true
```

İlk açılıştan sonra PJSIP yapılandırmasının `EXTERNAL_IP` ile yazılması için **Yönetici → Dahililer** ekranını açın (veya API seed’ini bekleyin). Uç noktalar `.env`’de `EXTERNAL_IP` yokken üretildiyse API’yi bir kez yeniden başlatın:

```bash
docker compose restart api asterisk
```

## 5. Telefon bağlama

### Portal WebRTC softphone

1. `https://pbx.example.com` adresine gidin
2. `101` / `portal101` ile giriş yapın (üretimde şifreleri değiştirin)
3. Mikrofon izni verin → **Kayıtlı** görünmeli

### Klasik SIP softphone / masa telefonu (UDP)

| Ayar | Değer |
| --- | --- |
| SIP sunucu / registrar | `EXTERNAL_IP` veya `SIP_DOMAIN` |
| Port | `5060` UDP |
| Kullanıcı / Auth ID | dahili numarası (`101`) |
| Şifre | **Portal → Kimlik bilgileri**ndeki SIP gizli anahtarı (veya yönetici ayarı) |
| Taşıma | UDP |
| Codec | Opus / G.711 μ-law / A-law |

Sunucuda doğrulayın:

```bash
docker compose exec asterisk asterisk -rx 'pjsip show contacts'
docker compose exec asterisk asterisk -rx 'pjsip show endpoints'
```

`Contact: 101/sip:101@…` ve kayıt sonrası uç nokta **Not in use** / **In use** beklenir.

### Çağrı testi

İki dahili kaydedin (ör. 101 ve 102), 101’den `102` arayın. Asterisk günlüğünde `Dial(PJSIP/102…)` ve köprü görünmelidir.

## 6. Neden çıplak kurulum değil?

| | Docker (bu proje) | Elle kurulum |
| --- | --- | --- |
| Asterisk + API + DB + nginx + TURN | Tek `compose up` | Çok paket, yol, systemd birimi |
| Yapılandırma senkronu | API `/var/lib/asterisk/dsip` yazar | Kendiniz bağlarsınız |
| Güncelleme | İmajları yeniden derleyin | apt + Node sürümleri karışır |
| NAT | `EXTERNAL_IP` ayarlayın | Aynı Asterisk ayarları, daha fazla tuzak |

Yalnızca barındırıcı Docker yasaklıyorsa veya çekirdek düzeyinde RTP ayarı gerekiyorsa çıplak kurulum düşünün. O durumda bile tüm yığını yeniden yazmak yerine Asterisk için `network_mode: host` tercih edin.

## 7. İşletim ekleri

- **Kayıt saklama:** Yönetici → Ayarlar → ay; API saklama işi süresi dolan dosyaları siler.
- **Kayıt arşivi:** Ayarlarda `recordingArchivePath` veya ortamda `RECORDING_ARCHIVE_PATH`.
- **Günlük rapor e-postası:** Ayarlar SMTP alanları (`smtpHost`, `smtpTo`, …); SMTP yoksa API özeti yalnızca günlüğe yazar.
- **Fail2ban (lab):** `docker compose --profile fail2ban up -d` — `asterisk_logs` + `api_logs` bağlar (yapılandırma birimi değil). Üretimde SIP için ana makine güvenlik duvarını tercih edin.
- **Ana makine güvenlik duvarı:** Yönetici → Ayarlar → Güvenlik → nftables/ufw indirin veya `SIP_ALLOW=… sudo ./scripts/harden-firewall.sh`.
- **IP politikası:** Ayarlarda `adminIpAllowlist` / `portalIpAllowlist` / `sipIpAllowlist` / `sipIpDenylist`; yasaklar Güvenlik bölümünde.
- **Giriş taşkın koruması:** Tekrarlayan hatalardan sonra API belleği + `ip_bans` tablosu (fail2ban’ı tamamlar).
- **Metinden sese (Piper):** compose’taki `tts` servisi — bkz. [METINDEN-SESE.md](METINDEN-SESE.md). İlk derleme TR/EN ses modellerini indirir.

## 8. Sorun giderme

- **Kayıt oluyor ama ses yok:** `EXTERNAL_IP` yanlış / RTP portları kapalı / SIP ALG açık.
- **Sürekli 401:** yanlış SIP şifresi; AOR adı dahili numarasına eşit olmalı (API böyle üretir).
- **WSS başarısız:** nginx sertifikası / `SIP_WSS_URL` host uyumsuzluğu / 443 kapalı.
- **Ofis dışı WebRTC tek yönlü ses:** TURN `EXTERNAL_IP` ve röle UDP aralığı açık olmalı.
