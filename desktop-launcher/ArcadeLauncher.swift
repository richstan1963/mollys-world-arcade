// ArcadeLauncher.swift — Your World Arcade desktop bridge
// Handles arcade:// URL scheme → launches native emulators
// Build: see build.sh | Config: ~/.ywa/emulator-paths.json
import Cocoa
import Foundation

// MARK: - Constants

let DEFAULT_PATHS: [String: String] = [
    "duckstation": "/Applications/DuckStation.app/Contents/MacOS/DuckStation",
    "pcsx2":       "/Applications/PCSX2.app/Contents/MacOS/PCSX2",
    "dolphin":     "/Applications/Dolphin.app/Contents/MacOS/Dolphin",
    "flycast":     "/Applications/Flycast.app/Contents/MacOS/Flycast",
    "xemu":        "/Applications/xemu.app/Contents/MacOS/xemu",
    "cemu":        "/Applications/Cemu.app/Contents/MacOS/Cemu",
    "cacheDir":    "~/.ywa/rom-cache",
]

let SYSTEM_EMULATOR: [String: String] = [
    "psx":       "duckstation",
    "ps2":       "pcsx2",
    "gamecube":  "dolphin",
    "wii":       "dolphin",
    "dreamcast": "flycast",
    "xbox":      "xemu",
    "wiiu":      "cemu",
]

// MARK: - Codable stubs

struct GameConfig: Codable {
    let core: String?
    let gameUrl: String?
    let gameName: String
    let filename: String
    let color: String?
}

// MARK: - App Delegate

class AppDelegate: NSObject, NSApplicationDelegate {

    var statusItem: NSStatusItem?

    // MARK: App lifecycle

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSAppleEventManager.shared().setEventHandler(
            self,
            andSelector: #selector(handleURL(_:withReplyEvent:)),
            forEventClass: AEEventClass(kInternetEventClass),
            andEventID:   AEEventID(kAEGetURL)
        )

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let btn = statusItem?.button {
            btn.title   = "🕹"
            btn.toolTip = "Arcade Launcher — ready"
        }

        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "🕹 Arcade Launcher v1.0", action: nil, keyEquivalent: ""))
        menu.addItem(.separator())
        let configItem = NSMenuItem(title: "Open Config Folder…", action: #selector(openConfigFolder), keyEquivalent: "")
        configItem.target = self
        menu.addItem(configItem)
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        statusItem?.menu = menu
    }

    @objc func openConfigFolder() {
        let dir = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".ywa")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        NSWorkspace.shared.open(dir)
    }

    // MARK: URL handler

    @objc func handleURL(_ event: NSAppleEventDescriptor, withReplyEvent: NSAppleEventDescriptor) {
        guard
            let raw   = event.paramDescriptor(forKeyword: keyDirectObject)?.stringValue,
            let url   = URL(string: raw),
            url.scheme == "arcade",
            let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else { return }

        var params: [String: String] = [:]
        for item in comps.queryItems ?? [] {
            if let v = item.value { params[item.name] = v }
        }

        guard
            let system     = params["system"],
            let romId      = params["romId"],
            let serverRaw  = params["server"],
            let serverURL  = URL(string: serverRaw)
        else {
            showError("Invalid arcade:// URL — missing system, romId, or server.")
            return
        }

        let title = params["title"]?.removingPercentEncoding ?? "Game"

        DispatchQueue.main.async { self.statusItem?.button?.title = "⏳" }

        Task.detached(priority: .userInitiated) { [weak self] in
            guard let self = self else { return }
            await self.launchGame(system: system, romId: romId, serverURL: serverURL, title: title)
            await MainActor.run { self.statusItem?.button?.title = "🕹" }
        }
    }

    // MARK: Core launch logic

    func launchGame(system: String, romId: String, serverURL: URL, title: String) async {
        guard let emKey = SYSTEM_EMULATOR[system] else {
            showError("Unknown system: \(system)")
            return
        }

        let paths   = loadPaths()
        guard let emPath = paths[emKey] ?? DEFAULT_PATHS[emKey] else {
            showError("No default path configured for emulator: \(emKey)")
            return
        }
        let cacheDir = NSString(string: paths["cacheDir"] ?? "~/.ywa/rom-cache")
                        .expandingTildeInPath

        guard FileManager.default.fileExists(atPath: emPath) else {
            showError("\(system.uppercased()) emulator not found.\n\nExpected:\n\(emPath)\n\nEdit ~/.ywa/emulator-paths.json to fix.")
            return
        }

        // Check for required BIOS files before launching
        if let missing = checkBIOS(system: system) {
            showError(missing)
            return
        }

        await MainActor.run { self.statusItem?.button?.title = "📥" }

        do {
            let romPath = try await resolveROM(
                romId: romId, serverURL: serverURL,
                title: title, cacheBase: cacheDir
            )
            let args = buildArgs(system: system, romPath: romPath)

            await MainActor.run { self.statusItem?.button?.title = "🚀" }

            let task = Process()
            task.executableURL = URL(fileURLWithPath: emPath)
            task.arguments     = args
            try task.run()

        } catch {
            showError("Failed to launch \(title):\n\(error.localizedDescription)")
        }
    }

    // MARK: ROM resolution — cache first, then stream

    func resolveROM(romId: String, serverURL: URL, title: String, cacheBase: String) async throws -> String {
        let cacheDir = "\(cacheBase)/\(romId)"

        // Fast path: extracted disc image already in cache (prefer .cue/.gdi/.chd over .zip)
        if let extracted = discImageFile(in: cacheDir) { return extracted }

        // Fetch config to get filename
        let configURL = serverURL.appendingPathComponent("api/player/config/\(romId)")
        let (cfgData, _) = try await URLSession.shared.data(from: configURL)
        let cfg = try JSONDecoder().decode(GameConfig.self, from: cfgData)
        let cachedZip = "\(cacheDir)/\(cfg.filename)"

        // Download if not cached
        if !FileManager.default.fileExists(atPath: cachedZip) {
            try FileManager.default.createDirectory(atPath: cacheDir, withIntermediateDirectories: true)
            let romURL = serverURL.appendingPathComponent("rom-file/\(romId)/\(cfg.filename)")
            let (tmpURL, _) = try await URLSession.shared.download(from: romURL)
            do {
                try FileManager.default.moveItem(atPath: tmpURL.path, toPath: cachedZip)
            } catch {
                // Destination appeared between check and move (race condition) — overwrite it
                try? FileManager.default.removeItem(atPath: cachedZip)
                try FileManager.default.moveItem(atPath: tmpURL.path, toPath: cachedZip)
            }
        }

        // For Dreamcast ZIPs: extract and return the disc image (.cue/.gdi/.chd)
        let ext = (cachedZip as NSString).pathExtension.lowercased()
        if ext == "zip" {
            let extracted = try extractDiscImage(from: cachedZip, to: cacheDir)
            return extracted
        }

        return cachedZip
    }

    // Returns the first disc image (.cue/.gdi/.chd/.cdi) found in a dir, preferring those over .zip
    func discImageFile(in dir: String) -> String? {
        let preferred = ["cue", "gdi", "chd", "cdi", "m3u"]
        guard let files = try? FileManager.default.contentsOfDirectory(atPath: dir) else { return nil }
        for ext in preferred {
            if let match = files.first(where: { $0.lowercased().hasSuffix(".\(ext)") }) {
                return "\(dir)/\(match)"
            }
        }
        return nil
    }

    func firstFile(in dir: String) -> String? {
        guard
            let files = try? FileManager.default.contentsOfDirectory(atPath: dir),
            let first = files.first(where: { !$0.hasPrefix(".") })
        else { return nil }
        return "\(dir)/\(first)"
    }

    // Extract a ZIP and return the path to the disc image inside
    func extractDiscImage(from zipPath: String, to outDir: String) throws -> String {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
        task.arguments = ["-o", zipPath, "-d", outDir]
        try task.run()
        task.waitUntilExit()

        // Find disc image in extracted files
        if let img = discImageFile(in: outDir) { return img }

        // Fallback: any non-zip file
        if let files = try? FileManager.default.contentsOfDirectory(atPath: outDir),
           let fallback = files.first(where: { !$0.hasPrefix(".") && !$0.hasSuffix(".zip") }) {
            return "\(outDir)/\(fallback)"
        }
        throw NSError(domain: "ArcadeLauncher", code: 1,
                      userInfo: [NSLocalizedDescriptionKey: "No disc image found in \(zipPath)"])
    }

    // MARK: BIOS check

    func checkBIOS(system: String) -> String? {
        let fm = FileManager.default
        let biosDir: String
        let required: [String]

        switch system {
        case "dreamcast":
            biosDir = NSString(string: "~/Library/Application Support/Flycast/data").expandingTildeInPath
            required = ["dc_boot.bin", "dc_flash.bin"]
        default:
            return nil   // no BIOS check for other systems
        }

        let missing = required.filter { !fm.fileExists(atPath: "\(biosDir)/\($0)") }
        if missing.isEmpty { return nil }

        return "\(system.uppercased()) BIOS files missing.\n\nPlace these in:\n\(biosDir)/\n\n\(missing.joined(separator: "\n"))"
    }

    // MARK: Emulator CLI args

    func buildArgs(system: String, romPath: String) -> [String] {
        switch system {
        case "psx":             return [romPath]
        case "ps2":             return ["--fullscreen", romPath]
        case "gamecube", "wii": return ["-e", romPath, "--batch"]
        case "dreamcast":       return [romPath]
        case "xbox":            return ["-dvd_path", romPath]
        case "wiiu":            return ["-f", "-g", romPath]
        default:                return [romPath]
        }
    }

    // MARK: Config

    func loadPaths() -> [String: String] {
        let url = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".ywa/emulator-paths.json")
        if let data = try? Data(contentsOf: url),
           let parsed = try? JSONDecoder().decode([String: String].self, from: data) {
            var merged = DEFAULT_PATHS
            for (k, v) in parsed { merged[k] = v }
            return merged
        }
        return DEFAULT_PATHS
    }

    // MARK: UI helpers

    func setStatus(_ icon: String) {
        DispatchQueue.main.async { [weak self] in
            self?.statusItem?.button?.title = icon
        }
    }

    func showError(_ message: String) {
        DispatchQueue.main.async {
            let alert = NSAlert()
            alert.messageText     = "Arcade Launcher"
            alert.informativeText = message
            alert.alertStyle      = .warning
            alert.addButton(withTitle: "OK")
            alert.runModal()
        }
    }
}

// MARK: - Entry point

let app      = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
