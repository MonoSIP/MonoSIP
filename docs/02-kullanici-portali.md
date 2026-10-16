# Kullanıcı portalı ve softphone

Her çalışan dahili numarası ve portal şifresiyle girer; tarayıcıdan arar, kendi çağrılarını görür, kendi kayıtlarını yalnızca dinler. Portal ilk sürümde yer alır.

## Giriş

- Kullanıcı adı dahili numarasıdır. Portal şifresi SIP şifresinden ayrıdır.
- SIP şifresi uzun ve rastgele üretilir; softphone bağlantı bilgisini backend oturum açıldıktan sonra verir.
- Portal şifresi sızsa masa telefonları etkilenmez; şifre değişince telefonların yeniden ayarlanması gerekmez.
- Admin şifreyi sıfırlar; portal erişimi dahili bazında açılıp kapatılır.

## Softphone

- Arama, cevaplama, tuş takımı (DTMF).
- Bekletme, sessize alma, doğrudan ve danışarak aktarma.
- Mikrofon, hoparlör ve zil sesi cihazı seçimi.
- Rehber ve iş arkadaşlarının anlık durumu (boşta, görüşmede, DND); isme tıklayarak arama.
- DND anahtarı.
- Gelen çağrıda masaüstü bildirimi; sekme arka plandayken de.
- Aynı dahili masa telefonunda ve tarayıcıda birlikte çalar; hangisinden açılırsa görüşme oradan sürer.

## Çağrı geçmişi

- Gelen, giden, cevapsız; filtre; tek tıkla geri arama.
- Kuyruktan cevapladığı ve kendisine aktarılan çağrılar dahil.

## Ses kayıtları

- Yalnızca kendisinin taraf olduğu görüşmeler.
- Yalnızca dinleme; indirme yok. Oynatıcı ses akışı olarak verir, indirme bağlantısı sunmaz.
- Admin dahili bazında dinleme iznini kapatabilir.
- Her dinleme loglanır (kim, hangi kayıt, ne zaman).

## Sesli mesaj ve yönlendirme

- Sesli mesajları dinler, okundu işaretler.
- Kendi yönlendirmesini değiştirir: cevap yok, meşgul, ulaşılamıyor. Cep telefonu hedefi yalnızca admin izin verdiyse seçilebilir.

## Teknik notlar

- Tarayıcı Asterisk'e WSS üzerinden bağlanır; ses DTLS-SRTP ile şifreli, codec Opus.
- Mikrofon yalnızca HTTPS'te çalışır; Let's Encrypt sertifikası zorunlu.
- Ofis dışı kullanım için aynı sunucuda coturn (TURN).
- Mobil tarayıcılar arka plandaki sekmeyi uyutur; ekran kapalıyken gelen çağrı güvenilir değildir. Cepte sürekli ulaşılabilir olması gerekenler karekodla kurulan hazır uygulamayı kullanır.
