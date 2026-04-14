import SwiftUI
import WebKit

// MARK: - Server Manager

@MainActor
class ServerManager: ObservableObject {
    @Published var isRunning = false
    @Published var statusText = "Checking..."

    let version: String = {
        let pkgPath = "/Users/kennetkusk/code/claude-monitoring/package.json"
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: pkgPath)),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let v = json["version"] as? String else { return "?" }
        return "v\(v)"
    }()

    private var pollTimer: Timer?
    private let port = 4500
    private let repoPath = "/Users/kennetkusk/code/claude-monitoring"
    private var pidFile: String { NSHomeDirectory() + "/.claude-monitor.pid" }

    init() {
        startPolling()
    }

    func startPolling() {
        pollTimer?.invalidate()
        pollTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.checkStatus() }
        }
        checkStatus()
    }

    func checkStatus() {
        let pidAlive = checkPidAlive()
        guard let url = URL(string: "http://localhost:\(port)/") else {
            updateStatus(running: false); return
        }
        let task = URLSession.shared.dataTask(with: url) { [weak self] _, response, _ in
            let httpOk = (response as? HTTPURLResponse)?.statusCode == 200
            Task { @MainActor in self?.updateStatus(running: httpOk || pidAlive) }
        }
        task.resume()
    }

    private func checkPidAlive() -> Bool {
        guard let pidStr = try? String(contentsOfFile: pidFile, encoding: .utf8)
                .trimmingCharacters(in: .whitespacesAndNewlines),
              let pid = Int32(pidStr) else { return false }
        return kill(pid, 0) == 0
    }

    private func updateStatus(running: Bool) {
        isRunning = running
        statusText = running ? "Running on port \(port)" : "Stopped"
    }

    func startServer() {
        runScript("start.sh")
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in self?.checkStatus() }
    }

    func stopServer() {
        runScript("stop.sh")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in self?.checkStatus() }
    }

    func restartServer() {
        stopServer()
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in self?.startServer() }
    }

    private func runScript(_ name: String) {
        let scriptPath = "\(repoPath)/scripts/\(name)"
        guard FileManager.default.fileExists(atPath: scriptPath) else {
            statusText = "Script not found: \(name)"; return
        }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = ["-l", scriptPath]
        // macOS GUI apps get a minimal PATH — merge in common tool locations
        let extraPaths = [
            NSHomeDirectory() + "/.bun/bin",
            "/opt/homebrew/bin",
            "/usr/local/bin",
        ].joined(separator: ":")
        var env = ProcessInfo.processInfo.environment
        env["PORT"] = "\(port)"
        env["PATH"] = extraPaths + ":" + (env["PATH"] ?? "/usr/bin:/bin")
        env["CLAUDE_MONITOR_NO_OPEN"] = "1"
        process.environment = env
        process.currentDirectoryURL = URL(fileURLWithPath: repoPath)
        try? process.run()
    }
}

// MARK: - App Delegate (menu bar)

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var popover: NSPopover!
    var serverManager: ServerManager!

    func applicationDidFinishLaunching(_ notification: Notification) {
        serverManager = ServerManager()

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        let popover = NSPopover()
        popover.contentSize = NSSize(width: 320, height: 400)
        popover.behavior = .transient
        popover.contentViewController = NSHostingController(
            rootView: MenuBarView(serverManager: serverManager, openDashboard: openDashboard)
        )
        self.popover = popover

        if let button = statusItem.button {
            button.image = loadMenuBarIcon()
            button.action = #selector(togglePopover)
            button.target = self
        }
    }

    func loadMenuBarIcon() -> NSImage? {
        let bundle = Bundle.main
        if let url = bundle.url(forResource: "menubar_icon", withExtension: "png"),
           let image = NSImage(contentsOf: url) {
            image.size = NSSize(width: 18, height: 18)
            return image
        }
        // Fallback to SF Symbol
        return NSImage(systemSymbolName: "waveform", accessibilityDescription: "Claude Monitor")
    }

    @objc func togglePopover() {
        if let button = statusItem.button {
            if popover.isShown {
                popover.performClose(nil)
            } else {
                popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
                popover.contentViewController?.view.window?.makeKey()
            }
        }
    }

    var dashboardWindow: NSWindow?

    func openDashboard() {
        if let window = dashboardWindow, window.isVisible {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let hostingView = NSHostingController(
            rootView: DashboardContentView(serverManager: serverManager))
        let window = NSWindow(contentViewController: hostingView)
        window.title = "Claude Code Monitor Dashboard"
        window.setContentSize(NSSize(width: 1200, height: 800))
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        dashboardWindow = window
    }
}

// MARK: - Menu Bar View

struct MenuBarView: View {
    @ObservedObject var serverManager: ServerManager
    var openDashboard: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Circle()
                    .fill(serverManager.isRunning ? Color.green : Color.red)
                    .frame(width: 8, height: 8)
                Text("Claude Code Monitor")
                    .font(.headline)
                Text(serverManager.version)
                    .font(.caption2)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(Color.secondary.opacity(0.12))
                    .cornerRadius(4)
                Spacer()
                Text(serverManager.statusText)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Divider()

            HStack(spacing: 8) {
                Button(action: { serverManager.startServer() }) {
                    Label("Start", systemImage: "play.fill")
                }.disabled(serverManager.isRunning)

                Button(action: { serverManager.stopServer() }) {
                    Label("Stop", systemImage: "stop.fill")
                }.disabled(!serverManager.isRunning)

                Button(action: { serverManager.restartServer() }) {
                    Label("Restart", systemImage: "arrow.clockwise")
                }.disabled(!serverManager.isRunning)
            }.buttonStyle(.bordered)

            Divider()

            Button(action: openDashboard) {
                Label("Open Dashboard", systemImage: "macwindow")
            }.disabled(!serverManager.isRunning)

            Button(action: {
                if let url = URL(string: "http://localhost:4500") {
                    NSWorkspace.shared.open(url)
                }
            }) {
                Label("Open in Browser", systemImage: "safari")
            }.disabled(!serverManager.isRunning)

            Divider()

            Button(action: { NSApplication.shared.terminate(nil) }) {
                Label("Quit", systemImage: "power")
            }
        }
        .padding()
        .frame(width: 300)
    }
}

// MARK: - Dashboard View

struct DashboardContentView: View {
    @ObservedObject var serverManager: ServerManager

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Circle()
                    .fill(serverManager.isRunning ? Color.green : Color.red)
                    .frame(width: 8, height: 8)
                Text(serverManager.statusText)
                    .font(.caption)
                    .foregroundColor(.secondary)
                Spacer()
                Button(action: {
                    if let url = URL(string: "http://localhost:4500") {
                        NSWorkspace.shared.open(url)
                    }
                }) {
                    Image(systemName: "safari")
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            Divider()

            WebView(url: URL(string: "http://localhost:4500")!)
        }
    }
}

struct WebView: NSViewRepresentable {
    let url: URL

    func makeNSView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.allowsBackForwardNavigationGestures = true
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}
}

// MARK: - Entry point

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
