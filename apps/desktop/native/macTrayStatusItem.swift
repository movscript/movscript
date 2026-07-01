import AppKit
import Darwin

final class TrayController: NSObject {
  private let parentPid: pid_t
  private let appBundlePath: String
  private let title: String
  private var statusItem: NSStatusItem?

  init(parentPid: pid_t, appBundlePath: String, title: String) {
    self.parentPid = parentPid
    self.appBundlePath = appBundlePath
    self.title = title
  }

  func install() {
    NSApplication.shared.setActivationPolicy(.accessory)

    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    item.button?.title = title
    item.button?.toolTip = title

    let menu = NSMenu()
    let openItem = NSMenuItem(title: "Open MovScript", action: #selector(openMovScript), keyEquivalent: "")
    openItem.target = self
    menu.addItem(openItem)

    menu.addItem(NSMenuItem.separator())

    let quitItem = NSMenuItem(title: "Quit MovScript", action: #selector(quitMovScript), keyEquivalent: "")
    quitItem.target = self
    menu.addItem(quitItem)

    item.menu = menu
    statusItem = item

    Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] timer in
      guard let self else {
        timer.invalidate()
        return
      }
      if kill(self.parentPid, 0) == -1 && errno == ESRCH {
        timer.invalidate()
        NSApplication.shared.terminate(nil)
      }
    }
  }

  @objc private func openMovScript() {
    if let runningApp = NSRunningApplication(processIdentifier: parentPid) {
      runningApp.activate(options: [.activateIgnoringOtherApps])
      return
    }

    let url = URL(fileURLWithPath: appBundlePath)
    if #available(macOS 10.15, *) {
      NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration()) { _, _ in }
    } else {
      NSWorkspace.shared.launchApplication(appBundlePath)
    }
  }

  @objc private func quitMovScript() {
    NSRunningApplication(processIdentifier: parentPid)?.terminate()
    NSApplication.shared.terminate(nil)
  }
}

let args = CommandLine.arguments
let parentPid = args.count > 1 ? pid_t(args[1]) ?? getppid() : getppid()
let appBundlePath = args.count > 2 ? args[2] : ""
let title = args.count > 3 ? args[3] : "MovScript"

_ = NSApplication.shared
let controller = TrayController(parentPid: parentPid, appBundlePath: appBundlePath, title: title)
controller.install()
NSApplication.shared.run()
