# Mimari

```
                 ┌─────────────────────────────────────────┐
  Tarayıcı       │  nginx :443 / :80                       │
  Softphone ────►│  TLS, ACME doğrulama, /api /ws /asterisk-ws │
  Masa telefonu─►│                                         │
       │         └───────────┬─────────────┬───────────────┘
       │                     │             │
       │              ┌──────▼──────┐ ┌────▼─────┐
       │              │  web        │ │  api     │
       │              │  React SPA  │ │ Fastify  │
       │              └─────────────┘ │ ARI akış │
       │                              │ yapılandırma │
       │                              └────┬─────┘
       │                     ┌─────────────┼─────────────┐
       │                     │             │             │
       │              ┌──────▼──────┐ ┌────▼─────┐ ┌─────▼────┐
       └─────────────►│  asterisk   │ │ postgres │ │  tts     │
          SIP/RTP     │  PJSIP ARI  │ │  veri    │ │ Piper    │
                      └──────┬──────┘ └──────────┘ └──────────┘
                             │
                      ┌──────▼──────┐
                      │  coturn     │  Uzak WebRTC için TURN
                      └─────────────┘
```

## Denetim düzlemi (`api`)

- Asterisk yapılandırma dosyalarını ortak birime yazar; AMI/ARI ile yeniden yükler
- Yayınlanmış IVR grafiğini ARI Stasis üzerinde çalıştırır
- Yönetici ve portal REST’ini, WebSocket yayınını ve Let's Encrypt istemcisini sunar (`cert.pem` / `key.pem` yazar)
- Arka plan işleri: saklama süresi, arşiv, raporlar, kuyruk geri arama, hat izleme, SSL yenileme kontrolü

## Medya düzlemi (`asterisk`)

- PJSIP uç noktaları, kuyruklar, dialplan veritabanından üretilir
- MixMonitor kayıtları → ortak `recordings` birimi (`api` üzerinde de bağlı)

## Veri

- **PostgreSQL** — dahililer, rotalar, akışlar, CDR ve ayar JSON’u için kaynak gerçek
- Birimler imaj yeniden derlemesinde kalır; TLS malzemesi için sertifika dizinine bağlı mount

## Güven sınırları

- Yönetici API: oturum çerezi + isteğe bağlı TOTP; isteğe bağlı `adminIpAllowlist`
- Portal: dahili girişi; softphone kimlik bilgileri kısa ömürlüdür
- Entegrasyon: API anahtarları + webhook HMAC
- Dahili Asterisk → API kancaları: `INTERNAL_API_SECRET`
- SIP dış dünyaya açık olmamalı; ofis/VPN/trunk ACL tercih edin ([07-sunucu-ve-guvenlik.md](07-sunucu-ve-guvenlik.md))
