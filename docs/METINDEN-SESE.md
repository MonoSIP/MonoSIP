# Metinden sese (Edge Neural + Piper yedek)

DSip, IVR / anons sesini varsayılan olarak **Microsoft Edge Neural TTS** (`edge-tts`) ile üretir — Türkçe netliği Piper’dan belirgin şekilde daha iyidir. **Piper** çevrimdışı yedektir.

## Motorlar

| Motor | Kalite (TR) | İnternet gerekir | Not |
| --- | --- | --- | --- |
| **edge** (`auto` ile varsayılan) | Yüksek — `tr-TR-EmelNeural` / `tr-TR-AhmetNeural` | Evet (üretim anında) | Ücretsiz, resmi olmayan Edge sesleri |
| **piper** | Orta — `tr_TR-fettah-medium` | Hayır | MIT, tamamen çevrimdışı |

## Sesler

| Dil | Tercih (Edge) | Çevrimdışı (Piper) |
| --- | --- | --- |
| Türkçe | `tr-TR-EmelNeural` | `tr_TR-fettah-medium` |
| İngilizce | `en-US-JennyNeural` | `en_US-lessac-medium` |

Erkek Türkçe: `.env` içinde `TTS_EDGE_VOICE_TR=tr-TR-AhmetNeural`.

## Yapılandırma

```env
TTS_ENGINE=auto          # auto | edge | piper
TTS_EDGE_VOICE_TR=tr-TR-EmelNeural
TTS_EDGE_VOICE_EN=en-US-JennyNeural
TTS_URL=http://tts:5500
```

- `auto`: Edge dene; ağ/API başarısızsa Piper’a düş
- `edge`: yalnızca Edge (çevrimdışında başarısız olur)
- `piper`: yalnızca çevrimdışı

## Kullanım

1. `docker compose up --build -d tts api`
2. Yönetici → **Sesler** → Türkçe metin → **Oluştur + TTS üret** (veya **TTS üret**)
3. Akışlarda **önceden üretilmiş** anonsları tercih edin (canlı TTS gecikme ekler)

## Sağlık kontrolü

```bash
docker compose exec tts curl -fsS http://127.0.0.1:5500/health
```

## Notlar

- Edge sentezi `tts` kabından giden HTTPS ister.
- Çıktı her zaman Asterisk için 8 kHz mono WAV’dır.
- İzole VPS: `TTS_ENGINE=piper` ayarlayın.
