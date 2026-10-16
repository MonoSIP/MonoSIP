# Sunucu, ağ, güvenlik ve KVKK

## Sunucu

Tüm bileşenler şirket içindeki tek bir sanal sunucuda çalışır. Hesap, aynı anda en fazla 8–10 görüşme varsayımına dayanır.

| Kaynak | Değer |
| --- | --- |
| CPU | 2–4 vCPU, ayrılmış (overcommit yok) |
| RAM | 4–8 GB |
| Sistem diski | 40 GB |
| Kayıt diski | Ayrı disk, 200–500 GB |
| İşletim sistemi | Debian 13 |
| Aynı sunucuda | Asterisk, backend, PostgreSQL, Nginx (panel + TLS), coturn |

## Ağ

- **Kayıt alanı:** WAV dakikada yaklaşık 1 MB; günde 1.000 dakikada ayda 20–25 GB. Opus'a çevrilince 5–8 kat azalır.
- **Ağ:** Sabit iç IP. Modem ve firewall'da SIP ALG kapalı.
- **Dışarıya açılanlar:** Panel ve portal için 443 (HTTPS + WSS). TURN için 3478 ve röle port aralığı. Operatöre yönelik SIP ve RTP (10000–20000) yalnızca sağlayıcının IP'lerine.
- **Dışarıya açılmayanlar:** 5060/5061 SIP, AMI, ARI, PostgreSQL. Ofis dışı masa telefonları VPN ile bağlanır.
- **Ses kalitesi:** Hipervizörde CPU overcommit yok; mümkünse QoS (DSCP 46).
- **Yedekleme:** Gece veritabanı ve ayar yedeği, NAS veya SFTP'ye; sanal sunucu snapshot'ı ayrıca.
- **Kesinti:** Sunucu veya internet kesilirse gelen çağrıların cep telefonuna yönlenmesi SIP sağlayıcının panelinde ayarlanır.

## Güvenlik

En büyük finansal risk, ele geçirilen bir dahiliden yapılan yurt dışı aramalardır (toll fraud). Bu yüzden arama kısıtları ve limitler ilk fazda gelir.

### Santral

- SIP şifreleri 32 karakter rastgele; kullanıcı görmez.
- Fail2ban: hatalı SIP kaydı / admin login denemesinde IP engelleme (`docker compose --profile fail2ban`; prod’da host firewall tercih edilir).
- Panel → Ayarlar → Security: `sipIpAllowlist` / `sipIpDenylist` → PJSIP ACL; host için nftables/ufw export.
- Host firewall şablonu: `scripts/harden-firewall.sh` (SIP/RTP yalnızca allowlist).
- Ülkeye göre giden arama kısıtı; varsayılan olarak yalnızca Türkiye açık.
- Arama sıklığı sınırı: kısa sürede anormal sayıda giden arama yapan dahili durdurulur, admin'e e-posta gider.
- Fatura stop: genel ve dahili bazında günlük ve aylık limit.
- SIP TLS ve SRTP; WebRTC için DTLS-SRTP.

### Panel ve portal

- Yalnızca HTTPS; Let's Encrypt otomatik sertifika.
- Admin girişi 2FA zorunlu; `adminIpAllowlist` tüm admin API’ye uygulanır (boş = lab’de açık).
- Portal: isteğe bağlı `portalIpAllowlist`; login flood → geçici ban (`ip_bans` + bellek).
- Hatlar ve API düğümlerinin gizli bilgileri veritabanında şifreli.
- Admin'in her değişikliği işlem loguna yazılır.

## KVKK

- Kayıt yapılan gelen ve giden aramalarda aydınlatma anonsu.
- Saklama süresi ayarlanabilir; süresi dolan kayıt otomatik silinir, silme loglanır.
- Kayıt erişimi rol bazlı: admin tümünü, dahili yalnızca kendi kayıtlarını dinler; dahili indiremez.
- Her kayıt dinleme, indirme ve canlı dinleme (spy) loglanır.
- Kayıtlar ve CDR şirket içinde kalır; dış servise gönderilmez.
- Çalışanlara görüşmelerin kaydedildiğine dair iç bilgilendirme yapılması önerilir.
