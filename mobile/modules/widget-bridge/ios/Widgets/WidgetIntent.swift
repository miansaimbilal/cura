import AppIntents
import Foundation

// MARK: - AppIntents for iOS 16/17+ Interactive Widgets

@available(iOS 16.0, *)
public struct TaskToggleIntent: AppIntent {
  public static var title: LocalizedStringResource = "Toggle Task Status"
  public static var description = IntentDescription("Toggles a Cura task between completed and pending")
  public static var openAppWhenRun: Bool = true

  @Parameter(title: "Task ID")
  public var taskId: String

  @Parameter(title: "Target State")
  public var targetState: String

  @Parameter(title: "User ID")
  public var userId: String

  public init() {}

  public init(taskId: String, targetState: String, userId: String) {
    self.taskId = taskId
    self.targetState = targetState
    self.userId = userId
  }

  public func perform() async throws -> some IntentResult & OpensIntent {
    let actionId = UUID().uuidString
    let nowIso = ISO8601DateFormatter().string(from: Date())
    var components = URLComponents(string: "cura://widget-action")!
    components.queryItems = [
      URLQueryItem(name: "action_id", value: actionId),
      URLQueryItem(name: "action_type", value: "task_toggle"),
      URLQueryItem(name: "target_id", value: taskId),
      URLQueryItem(name: "requested_state", value: targetState),
      URLQueryItem(name: "user_id", value: userId),
      URLQueryItem(name: "client_action_time", value: nowIso)
    ]
    let url = components.url ?? URL(string: "cura://tasks")!
    return .result(opensIntent: OpenURLIntent(url))
  }
}

@available(iOS 16.0, *)
public struct MoodLogIntent: AppIntent {
  public static var title: LocalizedStringResource = "Log Mood Check-in"
  public static var description = IntentDescription("Records a quick mood check-in")
  public static var openAppWhenRun: Bool = true

  @Parameter(title: "Mood Type")
  public var moodType: String

  @Parameter(title: "User ID")
  public var userId: String

  public init() {}

  public init(moodType: String, userId: String) {
    self.moodType = moodType
    self.userId = userId
  }

  public func perform() async throws -> some IntentResult & OpensIntent {
    let actionId = UUID().uuidString
    let nowIso = ISO8601DateFormatter().string(from: Date())
    var components = URLComponents(string: "cura://widget-action")!
    components.queryItems = [
      URLQueryItem(name: "action_id", value: actionId),
      URLQueryItem(name: "action_type", value: "mood_log"),
      URLQueryItem(name: "target_id", value: "widget_mood"),
      URLQueryItem(name: "requested_state", value: "{\"moodType\":\"\(moodType)\"}"),
      URLQueryItem(name: "user_id", value: userId),
      URLQueryItem(name: "client_action_time", value: nowIso)
    ]
    let url = components.url ?? URL(string: "cura://mood")!
    return .result(opensIntent: OpenURLIntent(url))
  }
}

// MARK: - Deep Link URI Generator Helper for Universal Fallback

public enum WidgetActionUrlBuilder {
  public static func makeTaskToggleUrl(taskId: String, isCompleted: Bool, userId: String) -> URL {
    let actionId = UUID().uuidString
    let targetState = isCompleted ? "pending" : "completed"
    let nowIso = ISO8601DateFormatter().string(from: Date())
    var components = URLComponents(string: "cura://widget-action")!
    components.queryItems = [
      URLQueryItem(name: "action_id", value: actionId),
      URLQueryItem(name: "action_type", value: "task_toggle"),
      URLQueryItem(name: "target_id", value: taskId),
      URLQueryItem(name: "requested_state", value: targetState),
      URLQueryItem(name: "user_id", value: userId),
      URLQueryItem(name: "client_action_time", value: nowIso)
    ]
    return components.url ?? URL(string: "cura://tasks")!
  }

  public static func makeMoodLogUrl(moodType: String, userId: String) -> URL {
    let actionId = UUID().uuidString
    let nowIso = ISO8601DateFormatter().string(from: Date())
    var components = URLComponents(string: "cura://widget-action")!
    components.queryItems = [
      URLQueryItem(name: "action_id", value: actionId),
      URLQueryItem(name: "action_type", value: "mood_log"),
      URLQueryItem(name: "target_id", value: "widget_mood"),
      URLQueryItem(name: "requested_state", value: "{\"moodType\":\"\(moodType)\"}"),
      URLQueryItem(name: "user_id", value: userId),
      URLQueryItem(name: "client_action_time", value: nowIso)
    ]
    return components.url ?? URL(string: "cura://mood")!
  }
}
