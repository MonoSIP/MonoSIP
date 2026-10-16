# Menü (akış) tasarımcısı

Menüler React Flow ile sürükle-bırak tasarlanır, JSON olarak saklanır ve backend'deki ARI akış motoru tarafından çalıştırılır. Her düğümün çıkışları ayrı oklarla bir sonraki düğüme bağlanır.

## Düğümler

| Düğüm | Ne yapar | Çıkışlar |
| --- | --- | --- |
| Başlangıç | Çağrı akışa girer; `caller`, `did`, `time` değişkenleri hazır | sonraki |
| Anons | Ses dosyası çalar | sonraki |
| TTS | Metni seslendirir; `{{değişken}}` destekli, kadın/erkek ses, TR/EN | sonraki |
| Tuş menüsü | Anons + tuş toplar; tek hane veya çok haneli giriş, zaman aşımı, tekrar sayısı | her tuş, zaman aşımı, geçersiz |
| API isteği | HTTP isteği atar, yanıttan değişken alır | başarılı, hata |
| Koşul | Değişken karşılaştırır (=, ≠, >, <, içerir, boş mu, regex); alan kodu ve ülke kodu dahil | doğru, yanlış |
| Zaman koşulu | Bir zaman planının o anki durumuna bakar | açık, öğle arası, mesai dışı, tatil |
| Değişken ata | Değişkene değer yazar | sonraki |
| Dil seç | Sonraki anonsların dilini değiştirir | sonraki |
| İsimle arama | Soyad tuşlatıp dahiliye bağlar | bulundu, bulunamadı |
| Aktar | Ortak hedef seçiciyle dahili, grup, harici numaraya | cevap yok, meşgul, ulaşılamıyor |
| Kuyruk | Kuyruğa alır; `priority` değişkenini kullanır | süre doldu, dolu, temsilci yok, geri arama istendi |
| Sesli mesaj | Bir dahilinin veya genel kutunun sesli mesajına | — |
| Alt akış | Başka bir akışı çağırır | dönüş |
| Kapat | Çağrıyı sonlandırır | — |

## API isteği düğümü

- **İstek:** GET, POST, PUT, PATCH, DELETE; URL, header ve gövde şablonu (`{{caller}}`, `{{dtmf}}`, önceki API yanıtlarından değişkenler).
- **Kimlik doğrulama:** Yok, Bearer token, Basic; gizli değerler şifreli saklanır, akış JSON'unda görünmez.
- **Yanıttan alma:** JSONPath ile değişkene eşleme, ör. `$.data.agent → temsilci`; HTTP durum kodu `http_status` değişkenine yazılır.
- **Güvenlik:** Zaman aşımı (varsayılan 3 sn, en fazla 10 sn); 1 kez yeniden deneme seçeneği. Arayan beklerken anons veya müzik çalabilir.
- **Hata çıkışı:** Zaman aşımı, 2xx dışı yanıt veya ayrıştırılamayan gövde hata çıkışına gider. Hata çıkışı bağlanmamışsa akış yayınlanamaz.
- **Test:** Düğüm panelinde örnek değişkenlerle istek gönderilir, ham yanıt ve eşlenen değişkenler gösterilir.

Örnek: çağrı gelir → arayan numara CRM'e POST edilir → `{"musteri":true,"temsilci":"201"}` döner → çağrı 201'e aktarılır. API yanıt vermezse genel kuyruğa düşer.

## Test çağrısı simülasyonu

- Bir arayan numara, tarih-saat ve tuş girişleriyle akış adım adım çalıştırılır.
- Geçilen düğümler ve oklar kanvasta vurgulanır; her adımda değişkenlerin değeri görünür.
- API düğümleri gerçek istek atar veya kaydedilmiş örnek yanıtla çalışır.

## Sürümleme ve doğrulama

- Her akışın bir taslağı ve yayındaki sürümü vardır; canlı çağrılar yalnızca yayındaki sürümü kullanır.
- Yayınlamadan önce doğrulama: bağlanmamış çıkış, ulaşılamayan düğüm, döngü (alt akış dahil), eksik hedef.
- Eski sürümler saklanır; tek tıkla geri alınır.
- Akışlar JSON olarak dışa ve içe aktarılır.
- Görüşme sürerken yeni sürüm yayınlanırsa, devam eden çağrı başladığı sürümle biter.
