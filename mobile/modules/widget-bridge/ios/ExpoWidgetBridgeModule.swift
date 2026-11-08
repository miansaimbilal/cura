import ExpoModulesCore
import Foundation
import WidgetKit

public class ExpoWidgetBridgeModule: Module {
  private static let appGroupId = "group.com.cura.app"

  private var snapshotsDirectory: URL? {
    guard let containerUrl = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: Self.appGroupId
    ) else {
      // Fallback for non-entitled local environments or unit test mocking
      return FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
        .appendingPathComponent("snapshots")
    }
    return containerUrl.appendingPathComponent("snapshots")
  }

  public func definition() -> ModuleDefinition {
    Name("ExpoWidgetBridge")

    AsyncFunction("publishSnapshot") { (options: [String: Any]) -> Bool in
      guard let userId = options["userId"] as? String,
            let epochNum = options["epoch"] as? NSNumber,
            let revNum = options["revision"] as? NSNumber,
            let contentJson = options["contentJson"] as? String else {
        return false
      }

      let epoch = epochNum.intValue
      let revision = revNum.intValue
      let candidateFileParam = options["candidateFile"] as? String

      guard let snapshotsDir = self.snapshotsDirectory else {
        return false
      }

      if !FileManager.default.fileExists(atPath: snapshotsDir.path) {
        try? FileManager.default.createDirectory(at: snapshotsDir, withIntermediateDirectories: true)
      }

      let uuid = UUID().uuidString
      let candidateFile = (!candidateFileParam.map { $0.trimmingCharacters(in: .whitespaces) }?.isEmpty ?? false)
        ? candidateFileParam!
        : "snapshot_\(userId)_\(epoch)_\(revision)_\(uuid).json"

      let candidateUrl = snapshotsDir.appendingPathComponent(candidateFile)
      let tmpCandidateUrl = snapshotsDir.appendingPathComponent("\(candidateFile).tmp")

      // 1. Write candidate snapshot to .tmp and fsync before atomic rename
      do {
        guard let data = contentJson.data(using: .utf8) else {
          return false
        }
        try data.write(to: tmpCandidateUrl, options: .atomic)
        if let handle = try? FileHandle(forWritingTo: tmpCandidateUrl) {
          try? handle.synchronize()
          try? handle.close()
        }
        if FileManager.default.fileExists(atPath: candidateUrl.path) {
          try? FileManager.default.removeItem(at: candidateUrl)
        }
        try FileManager.default.moveItem(at: tmpCandidateUrl, to: candidateUrl)
      } catch {
        try? FileManager.default.removeItem(at: tmpCandidateUrl)
        return false
      }

      // 2. Lock & coordinate manifest swap via NSFileCoordinator
      let manifestUrl = snapshotsDir.appendingPathComponent("current.json")
      let coordinator = NSFileCoordinator(filePresenter: nil)
      var coordError: NSError?
      var publishSucceeded = false

      coordinator.coordinate(
        writingItemAt: manifestUrl,
        options: .forReplacing,
        error: &coordError
      ) { writeUrl in
        var currentEpoch = 0
        var currentRevision = 0
        var currentUserId = ""
        var currentActiveFile = ""

        if FileManager.default.fileExists(atPath: writeUrl.path),
           let data = try? Data(contentsOf: writeUrl),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
          currentEpoch = json["accountEpoch"] as? Int ?? 0
          currentRevision = json["revision"] as? Int ?? 0
          currentUserId = json["userId"] as? String ?? ""
          currentActiveFile = json["activeFile"] as? String ?? ""
        }

        // Monotonicity check: reject stale epoch or revision
        if epoch < currentEpoch || (epoch == currentEpoch && revision <= currentRevision) {
          try? FileManager.default.removeItem(at: candidateUrl)
          publishSucceeded = false
          return
        }

        // Epoch/user change: purge previous epoch's snapshots
        if (!currentUserId.isEmpty && currentUserId != userId) || (currentEpoch > 0 && currentEpoch != epoch) {
          if let allFiles = try? FileManager.default.contentsOfDirectory(atPath: snapshotsDir.path) {
            for file in allFiles {
              if file != candidateFile && !file.hasPrefix(".") {
                try? FileManager.default.removeItem(at: snapshotsDir.appendingPathComponent(file))
              }
            }
          }
        }

        // Write new manifest atomically
        let isoFormatter = ISO8601DateFormatter()
        let nowStr = isoFormatter.string(from: Date())
        let manifestData: [String: Any] = [
          "activeFile": candidateFile,
          "accountEpoch": epoch,
          "revision": revision,
          "userId": userId,
          "updatedAt": nowStr
        ]

        guard let manifestBytes = try? JSONSerialization.data(withJSONObject: manifestData, options: [.prettyPrinted]) else {
          try? FileManager.default.removeItem(at: candidateUrl)
          publishSucceeded = false
          return
        }

        let tmpManifestUrl = snapshotsDir.appendingPathComponent("current.json.tmp")
        do {
          try manifestBytes.write(to: tmpManifestUrl, options: .atomic)
          if FileManager.default.fileExists(atPath: writeUrl.path) {
            _ = try? FileManager.default.removeItem(at: writeUrl)
          }
          try FileManager.default.moveItem(at: tmpManifestUrl, to: writeUrl)
        } catch {
          try? FileManager.default.removeItem(at: tmpManifestUrl)
          try? FileManager.default.removeItem(at: candidateUrl)
          publishSucceeded = false
          return
        }

        // 3. Prune old snapshots: keep only activeFile (N) and prior activeFile (N-1)
        if let files = try? FileManager.default.contentsOfDirectory(atPath: snapshotsDir.path) {
          let allowedFiles: Set<String> = [candidateFile, currentActiveFile, "current.json", ".manifest.lock"]
          let nowTime = Date().timeIntervalSince1970
          for file in files {
            let filePath = snapshotsDir.appendingPathComponent(file)
            if file.hasSuffix(".tmp") {
              if let attrs = try? FileManager.default.attributesOfItem(atPath: filePath.path),
                 let modDate = attrs[.modificationDate] as? Date,
                 nowTime - modDate.timeIntervalSince1970 > 60 {
                try? FileManager.default.removeItem(at: filePath)
              }
            } else if file.hasPrefix("snapshot_") && !allowedFiles.contains(file) {
              try? FileManager.default.removeItem(at: filePath)
            }
          }
        }

        publishSucceeded = true
      }

      if publishSucceeded {
        if #available(iOS 14.0, *) {
          WidgetCenter.shared.reloadAllTimelines()
        }
      }

      return publishSucceeded
    }

    AsyncFunction("readCurrentManifest") { () -> [String: Any]? in
      guard let snapshotsDir = self.snapshotsDirectory else {
        return nil
      }
      let manifestUrl = snapshotsDir.appendingPathComponent("current.json")
      guard FileManager.default.fileExists(atPath: manifestUrl.path),
            let data = try? Data(contentsOf: manifestUrl),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        return nil
      }
      return json
    }

    AsyncFunction("clearSnapshots") { () -> Bool in
      guard let snapshotsDir = self.snapshotsDirectory else {
        return false
      }
      guard FileManager.default.fileExists(atPath: snapshotsDir.path) else {
        return true
      }
      if let files = try? FileManager.default.contentsOfDirectory(atPath: snapshotsDir.path) {
        for file in files {
          if file != ".manifest.lock" {
            try? FileManager.default.removeItem(at: snapshotsDir.appendingPathComponent(file))
          }
        }
      }
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
      return true
    }
  }
}
