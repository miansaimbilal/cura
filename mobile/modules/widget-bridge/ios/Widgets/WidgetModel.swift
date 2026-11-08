import Foundation

// MARK: - Codable Snapshot Data Models (Mirroring WidgetSnapshot JSON)

public struct WidgetSnapshotModel: Codable {
  public let schemaVersion: Int
  public let accountEpoch: Int
  public let sourceRevision: Int
  public let userId: String
  public let generatedAt: String
  public let tasks: TasksSummaryModel
  public let mood: MoodSummaryModel
  public let quote: QuoteModel?
}

public struct TasksSummaryModel: Codable {
  public let todayTotal: Int
  public let todayCompleted: Int
  public let todayRemaining: Int
  public let overdueCount: Int
  public let items: [TaskItemModel]
}

public struct TaskItemModel: Codable, Identifiable {
  public let id: String
  public let title: String
  public let status: String // "pending" | "completed"
  public let isTimed: Bool
  public let dueTime: String?
}

public struct MoodSummaryModel: Codable {
  public let latestMoodType: String?
  public let latestLoggedAt: String?
}

public struct QuoteModel: Codable {
  public let id: String
  public let text: String
  public let author: String
}

public struct WidgetManifestModel: Codable {
  public let activeFile: String
  public let accountEpoch: Int
  public let revision: Int
  public let userId: String
  public let updatedAt: String
}

// MARK: - Safe Data Loader with 1MB Protection & Epoch Boundary Enforcement

public enum WidgetDataLoader {
  public static let appGroupId = "group.com.cura.app"
  public static let maxBytes: Int64 = 1_048_576 // 1 MB ceiling

  public static func loadCurrentSnapshot() -> WidgetSnapshotModel? {
    guard let containerUrl = FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: appGroupId
    ) else {
      return nil
    }

    let snapshotsDir = containerUrl.appendingPathComponent("snapshots")
    let manifestUrl = snapshotsDir.appendingPathComponent("current.json")

    guard FileManager.default.fileExists(atPath: manifestUrl.path) else {
      return nil
    }

    guard let manifestData = try? Data(contentsOf: manifestUrl),
          let manifest = try? JSONDecoder().decode(WidgetManifestModel.self, from: manifestData) else {
      return nil
    }

    guard !manifest.activeFile.isEmpty, !manifest.userId.isEmpty else {
      return nil
    }

    let snapshotUrl = snapshotsDir.appendingPathComponent(manifest.activeFile)
    guard FileManager.default.fileExists(atPath: snapshotUrl.path) else {
      return nil
    }

    guard let attrs = try? FileManager.default.attributesOfItem(atPath: snapshotUrl.path),
          let fileSize = attrs[.size] as? Int64,
          fileSize <= maxBytes else {
      return nil
    }

    guard let snapshotData = try? Data(contentsOf: snapshotUrl),
          let snapshot = try? JSONDecoder().decode(WidgetSnapshotModel.self, from: snapshotData) else {
      return nil
    }

    // Verify epoch and userId match manifest to strictly avoid stale crossover
    guard snapshot.accountEpoch == manifest.accountEpoch,
          snapshot.userId == manifest.userId else {
      return nil
    }

    return snapshot
  }
}
