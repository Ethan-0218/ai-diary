import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "AiDiary",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    // 호스트: 빌드 시 기록된 ip.txt(맥 IP, 실기기) 우선, 없으면(시뮬) localhost.
    // 포트: 9002 고정 — 8081은 다른 RN 프로젝트 Metro가 점유하므로 RCTBundleURLProvider의
    // 기본 포트(8081)에 의존하면 남의 번들을 받아온다(PlatformConstants 에러). ip.txt는 빌드마다
    // 현재 맥 IP로 자동 갱신되어 IP 하드코딩이 없다.
    let ip = Bundle.main.path(forResource: "ip", ofType: "txt")
      .flatMap { try? String(contentsOfFile: $0, encoding: .utf8) }?
      .trimmingCharacters(in: .whitespacesAndNewlines)
    let host = (ip?.isEmpty == false) ? ip! : "localhost"
    return URL(string: "http://\(host):9002/index.bundle?platform=ios&dev=true&lazy=true&minify=false")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
