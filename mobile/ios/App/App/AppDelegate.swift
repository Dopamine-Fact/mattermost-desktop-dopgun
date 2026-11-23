import UIKit
import Capacitor
import CryptoKit
import UserNotifications
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var apnsToken: String?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async { application.registerForRemoteNotifications() }
        }
        // Login happens inside the web app without a native callback, so re-check whenever the app is opened or left.
        NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.registerDevice()
        }
        NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            self?.registerDevice()
        }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        apnsToken = deviceToken.map { String(format: "%02x", $0) }.joined()
        registerDevice()
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NSLog("DopaminePush: APNs registration failed: \(error)")
    }

    /// Attaches the APNs token to the web app's session so the server sends pushes to this phone.
    private func registerDevice() {
        guard let apnsToken = apnsToken,
              let bridgeVC = UIApplication.shared.connectedScenes
                .compactMap({ ($0 as? UIWindowScene)?.windows.first?.rootViewController as? CAPBridgeViewController })
                .first,
              let webView = bridgeVC.webView,
              let server = bridgeVC.bridge?.config.serverURL,
              let host = server.host else { return }

        webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
            let ours = cookies.filter { host.hasSuffix($0.domain.trimmingCharacters(in: CharacterSet(charactersIn: "."))) }
            guard let authToken = ours.first(where: { $0.name == "MMAUTHTOKEN" })?.value,
                  let csrf = ours.first(where: { $0.name == "MMCSRF" })?.value else { return } // not logged in yet

            let registered = SHA256.hash(data: Data((authToken + apnsToken).utf8)).map { String(format: "%02x", $0) }.joined()
            guard UserDefaults.standard.string(forKey: "pushRegistered") != registered else { return }

            var request = URLRequest(url: server.appendingPathComponent("api/v4/users/sessions/device"))
            request.httpMethod = "PUT"
            request.httpShouldHandleCookies = false // keep this request away from the shared cookie jar
            request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
            request.setValue(csrf, forHTTPHeaderField: "X-CSRF-Token")
            request.setValue("XMLHttpRequest", forHTTPHeaderField: "X-Requested-With")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            // Same platform name as the official mobile app, so the push proxy routes it to its apple_rn (APNs) settings.
            request.httpBody = try? JSONSerialization.data(withJSONObject: ["device_id": "apple_rn:\(apnsToken)"])

            // Finish the request even if the app is going to the background.
            var task = UIBackgroundTaskIdentifier.invalid
            task = UIApplication.shared.beginBackgroundTask { UIApplication.shared.endBackgroundTask(task) }
            URLSession.shared.dataTask(with: request) { _, response, error in
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                if status == 200 {
                    UserDefaults.standard.set(registered, forKey: "pushRegistered")
                } else {
                    NSLog("DopaminePush: attach device failed: HTTP \(status) \(error?.localizedDescription ?? "")")
                }
                DispatchQueue.main.async { UIApplication.shared.endBackgroundTask(task) }
            }.resume()
        }
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
