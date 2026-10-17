# Kurulum

DSip bir **Docker Compose** yığını olarak çalışır. Üretim için önerilen yol: Linux sanal sunucu (Debian/Ubuntu). Yerel Mac’te yönetim paneli denenebilir; masa telefonu ve RTP için gerçek bir VPS daha uygundur.

## Gereksinimler

| Madde | Not |
| --- | --- |
| Docker Engine + Compose v2 | Debian/Ubuntu’da `docker.io` + `docker-compose-v2` |
| ~2–4 vCPU, 4–8 GB RAM | Yaklaşık 20 dahili için yeterli |
| Portlar | `443` (panel + WSS), `80` (ACME / yönlendirme), gerekirse SIP/RTP |
| Git | Depoyu klonlamak için |

## Laboratuvar kurulumu (localhost)

```bash
git clone https://github.com/diggyen/DSip.git
cd DSip
git checkout v1.0.0   # veya main

cp .env.example .env
chmod +x scripts/gen-certs.sh
./scripts/gen-certs.sh

docker compose up --build -d
```

**https://localhost** adresini açın; tarayıcıdaki kendi imzalı sertifika uyarısını kabul edin.

| Rol | Giriş | Şifre |
| --- | --- | --- |
| Yönetici | `admin@example.com` | `Admin123!` |
| Portal | `101` | `portal101` |
| Portal | `100`–`103` | `portal{numara}` |

Üretime almadan önce bu şifreleri değiştirin.

### Yararlı komutlar

```bash
docker compose ps
docker compose logs -f api
curl -sk https://localhost/api/v1/health
docker compose down          # durdur (birimler kalır)
docker compose down -v       # durdur VE veritabanı/kayıt birimlerini sil
```

## Üretim (VPS)

1. `.env` içinde genel kimliği ayarlayın:

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
```

2. Yığını başlatın: `docker compose up --build -d`

3. **TLS:** Yönetici → **Ayarlar → Hostname ve SSL** — genel hostname yazın, **Otomatik SSL** (Let's Encrypt) açın. `80` portu sunucuya ulaşmalıdır.  
   Yalnızca çevrimdışı lab: `./scripts/gen-certs.sh`

4. Güvenlik duvarını açın: `443/tcp`, `80/tcp`; `5060` + RTP’yi ofis/VPN/trunk ile sınırlayın. Ayrıntı: [VPS-DAGITIM.md](VPS-DAGITIM.md).

5. Masa telefonlarını portal SIP şifresiyle `EXTERNAL_IP:5060` adresine yönlendirin.

## Kalıcı veri

Compose **adlı birimleri** yeniden derlemede durumu korur:

| Birim | İçerik |
| --- | --- |
| `pgdata` | PostgreSQL (dahililer, CDR, akışlar, ayarlar) |
| `recordings` | Çağrı kayıtları |
| `uploads` | Anons / bekleme müziği yüklemeleri |
| `asterisk_config` | Üretilen dialplan / PJSIP |
| `./docker/nginx/certs` | TLS sertifikaları (bağlı dizin) |

`docker compose up --build` birimleri silmez. Yalnızca `docker compose down -v` siler.

## İsteğe bağlı servisler

```bash
# Asterisk + API giriş hapishanesi
docker compose --profile fail2ban up -d
```

## Geliştirme (API / web ana makinede)

```bash
pnpm install
pnpm --filter @dsip/shared build
docker compose up -d postgres asterisk coturn tts
export DATABASE_URL=postgresql://dsip:dsip_secret_change_me@localhost:5432/dsip
pnpm --filter @dsip/api run db:migrate
pnpm --filter @dsip/api run db:seed
pnpm dev
```

## Sonraki adımlar

- [01-ozellikler.md](01-ozellikler.md) — ürün ne yapar  
- [MIMARI.md](MIMARI.md) — servisler ve veri akışı  
- [VPS-DAGITIM.md](VPS-DAGITIM.md) — telefonlar, NAT, güvenlik duvarı  
