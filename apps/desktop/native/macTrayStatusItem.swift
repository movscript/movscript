import AppKit
import Darwin
import Foundation

struct TrayMenuMessage: Decodable {
  let type: String
  let items: [TrayMenuItem]?
}

struct TrayMenuItem: Decodable {
  let id: String?
  let type: String?
  let label: String?
  let enabled: Bool?
  let submenu: [TrayMenuItem]?
}

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
    statusItem = item
    updateMenu(items: fallbackMenuItems())

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

  func startInputLoop() {
    DispatchQueue.global(qos: .utility).async { [weak self] in
      while let line = readLine() {
        self?.handleInputLine(line)
      }
    }
  }

  private func handleInputLine(_ line: String) {
    guard let data = line.data(using: .utf8) else {
      return
    }
    do {
      let message = try JSONDecoder().decode(TrayMenuMessage.self, from: data)
      guard message.type == "menu", let items = message.items else {
        return
      }
      DispatchQueue.main.async { [weak self] in
        self?.updateMenu(items: items)
      }
    } catch {
      writeStandardError("[movscript-native-tray] ignored invalid menu message: \(error)\n")
    }
  }

  private func updateMenu(items: [TrayMenuItem]) {
    statusItem?.menu = buildMenu(items: items)
  }

  private func buildMenu(items: [TrayMenuItem]) -> NSMenu {
    let menu = NSMenu()
    for item in items {
      if item.type == "separator" {
        menu.addItem(NSMenuItem.separator())
        continue
      }

      let menuItem = NSMenuItem(title: item.label ?? "", action: nil, keyEquivalent: "")
      menuItem.isEnabled = item.enabled ?? true
      if let submenu = item.submenu {
        menuItem.submenu = buildMenu(items: submenu)
      }
      if let id = item.id {
        menuItem.action = #selector(runCommand(_:))
        menuItem.target = self
        menuItem.representedObject = id
      }
      menu.addItem(menuItem)
    }
    return menu
  }

  @objc private func runCommand(_ sender: NSMenuItem) {
    guard let id = sender.representedObject as? String else {
      return
    }
    if id == "open-home" {
      activateParentApp()
    }
    sendCommand(id: id)
  }

  private func sendCommand(id: String) {
    let payload: [String: String] = [
      "type": "command",
      "id": id,
    ]
    do {
      let data = try JSONSerialization.data(withJSONObject: payload, options: [])
      FileHandle.standardOutput.write(data)
      FileHandle.standardOutput.write(Data("\n".utf8))
    } catch {
      writeStandardError("[movscript-native-tray] failed to encode command \(id): \(error)\n")
    }
  }

  private func activateParentApp() {
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
}

func fallbackMenuItems() -> [TrayMenuItem] {
  return [
    TrayMenuItem(id: "open-home", type: nil, label: "Open MovScript", enabled: true, submenu: nil),
    TrayMenuItem(id: nil, type: "separator", label: nil, enabled: nil, submenu: nil),
    TrayMenuItem(id: "quit", type: nil, label: "Quit MovScript", enabled: true, submenu: nil),
  ]
}

func writeStandardError(_ message: String) {
  if let data = message.data(using: .utf8) {
    FileHandle.standardError.write(data)
  }
}

let args = CommandLine.arguments
let parentPid = args.count > 1 ? pid_t(args[1]) ?? getppid() : getppid()
let appBundlePath = args.count > 2 ? args[2] : ""
let title = args.count > 3 ? args[3] : "MovScript"

_ = NSApplication.shared
let controller = TrayController(parentPid: parentPid, appBundlePath: appBundlePath, title: title)
controller.install()
controller.startInputLoop()
NSApplication.shared.run()
