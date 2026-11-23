# Dopamine Fact mobil (Capacitor)

Uygulama açıldığında doğrudan `https://todo.dopaminefact.com` adresini yükler (ayarlar: `capacitor.config.json`).

## APK derleme

Gereken: Android Studio (SDK) ve JDK 21. Android Studio'nun içindeki JDK 25 ile Gradle 8.14 çalışmıyor.

```powershell
$env:JAVA_HOME = (Get-ChildItem "C:\Program Files\Microsoft\jdk-21*")[0].FullName
cd mobile; npm run apk
```

Çıktı: `android/app/build/outputs/apk/debug/app-debug.apk`

## Push bildirimleri

Akış: Mattermost sunucusu → push proxy (`push-proxy/`) → Firebase Cloud Messaging → telefon.
Uygulama, giriş yapıldıktan sonra açılışta ve arka plana alınırken FCM token'ını Mattermost oturumuna kaydeder.

1. **Firebase projesi:** https://console.firebase.google.com → yeni proje → Android uygulaması ekle,
   paket adı `com.dopaminefact.app`. İndirilen `google-services.json` dosyasını `android/app/` içine koy.
2. **Service account anahtarı:** Firebase → Project settings → Service accounts → *Generate new private key*.
   Dosyayı `push-proxy/config/firebase-service-account.json` adıyla kaydet. Bu dosya gizli, git'e girmiyor.
3. **Push proxy:** Sunucudaki Mattermost compose'u (`mattermost-dopgun/docker-compose.yml`) zaten bir `push-proxy`
   servisi çalıştırıyor ve Mattermost'u `MM_EMAILSETTINGS_PUSHNOTIFICATIONSERVER=http://push-proxy:8066` ile ona bağlıyor
   (System Console'dan değiştirilemez). Anahtarı sunucuda o proxy'nin klasörüne koy ve proxy'yi yeniden başlat:
   `/mnt/data/mattermost/push-proxy/config/firebase-service-account.json` (sahibi `65534:65534`).
   Buradaki `push-proxy/` klasörü yalnızca ayrı bir sunucu için örnek.
4. *(3. adımdaki kurulumda gerekmez)* Ayrı bir proxy kullanılıyorsa: **System Console → Environment → Push Notification Server**
   → *Manually enter Push Notification Service location*, adres `http://<push-proxy-sunucusu>:8066`.
5. **System Console → Site Configuration → Notifications → Push Notification Contents:**
   **Full message content** seçilmeli. "ID-only" seçilirse bildirimde mesaj metni görünmez.
6. APK'yı yeniden derle (`google-services.json` artık dahil olacak), telefona kur, giriş yap,
   bildirim iznini ver ve uygulamayı bir kez arka plana al.

Kontrol: push proxy loglarında (`docker compose logs -f`) `Sending android push notification` satırı görünmeli.

## iOS

Derlemek için macOS, Xcode ve ücretli Apple Developer hesabı gerekiyor (ücretsiz hesapta push açılmıyor).
Uygulama açılışta bildirim izni ister ve APNs token'ını `apple_rn:<token>` olarak Mattermost oturumuna kaydeder
(`ios/App/App/AppDelegate.swift`). Firebase iOS'ta kullanılmıyor, push doğrudan APNs'e gidiyor.

1. **APNs anahtarı:** developer.apple.com → Certificates, IDs & Profiles → Keys → yeni anahtar,
   *Apple Push Notifications service (APNs)* seçili. `.p8` dosyasını indir, Key ID'yi ve Team ID'yi not al. Dosya gizli, git'e girmiyor.
2. **Push proxy:** `.p8` dosyasını sunucuda `/mnt/data/mattermost/push-proxy/config/apns-key.p8` olarak koy (sahibi `65534:65534`),
   `mattermost-push-proxy.json` içindeki `ApplePushSettings` listesine şunu ekle ve proxy'yi yeniden başlat:
   ```json
   {
       "Type": "apple_rn",
       "ApplePushUseDevelopment": true,
       "ApplePushTopic": "com.dopaminefact.app",
       "AppleAuthKeyFile": "/mattermost-push-proxy/config/apns-key.p8",
       "AppleAuthKeyID": "<Key ID>",
       "AppleTeamID": "<Team ID>"
   }
   ```
   Xcode'dan doğrudan telefona kurulan sürüm `true`, TestFlight / App Store sürümü `false` ister.
3. **Derleme:** `npx cap sync ios`, sonra `npx cap open ios`. Xcode'da *Signing & Capabilities* altında takımını seç;
   *Push Notifications* yetkisi `App/App.entitlements` ile zaten tanımlı. Telefona kur ya da *Product → Archive* ile TestFlight'a yükle.

Kontrol: giriş yapıp uygulamayı arka plana aldıktan sonra push proxy loglarında `Sending apple push notification` görünmeli.
