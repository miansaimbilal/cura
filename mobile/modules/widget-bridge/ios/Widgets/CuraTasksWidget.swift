import SwiftUI
import WidgetKit

// MARK: - Tasks Widget Timeline Provider

public struct CuraTasksTimelineEntry: TimelineEntry {
  public let date: Date
  public let snapshot: WidgetSnapshotModel?
}

public struct CuraTasksProvider: TimelineProvider {
  public func placeholder(in context: Context) -> CuraTasksTimelineEntry {
    CuraTasksTimelineEntry(date: Date(), snapshot: nil)
  }

  public func getSnapshot(in context: Context, completion: @escaping (CuraTasksTimelineEntry) -> Void) {
    let snapshot = WidgetDataLoader.loadCurrentSnapshot()
    completion(CuraTasksTimelineEntry(date: Date(), snapshot: snapshot))
  }

  public func getTimeline(in context: Context, completion: @escaping (Timeline<CuraTasksTimelineEntry>) -> Void) {
    let snapshot = WidgetDataLoader.loadCurrentSnapshot()
    let entry = CuraTasksTimelineEntry(date: Date(), snapshot: snapshot)
    // Reloads are driven by WidgetCenter.shared.reloadAllTimelines() on snapshot publish
    let timeline = Timeline(entries: [entry], policy: .never)
    completion(timeline)
  }
}

// MARK: - Tasks Widget SwiftUI View

public struct CuraTasksWidgetView: View {
  public let entry: CuraTasksTimelineEntry

  public init(entry: CuraTasksTimelineEntry) {
    self.entry = entry
  }

  private var snapshot: WidgetSnapshotModel? {
    entry.snapshot
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      // Header: Title & Badges
      HStack {
        Text("Cura Tasks")
          .font(.system(size: 14, weight: .bold))
          .foregroundColor(.white)

        Spacer()

        if let snapshot = snapshot {
          Text("\(snapshot.tasks.todayCompleted) / \(snapshot.tasks.todayTotal) done")
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(Color(hex: "A5B4FC"))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Color(hex: "1E1B4B"))
            .cornerRadius(4)

          if snapshot.tasks.overdueCount > 0 {
            Text("\(snapshot.tasks.overdueCount) overdue")
              .font(.system(size: 11, weight: .semibold))
              .foregroundColor(Color(hex: "F87171"))
              .padding(.horizontal, 6)
              .padding(.vertical, 2)
              .background(Color(hex: "450A0A"))
              .cornerRadius(4)
          }
        }
      }

      Divider().background(Color(hex: "27273A"))

      // Content Body
      if let snapshot = snapshot {
        let items = Array(snapshot.tasks.items.prefix(5))
        if items.isEmpty {
          Spacer()
          HStack {
            Spacer()
            Text("No tasks today - Enjoy your day")
              .font(.system(size: 13))
              .foregroundColor(Color(hex: "8588A3"))
            Spacer()
          }
          Spacer()
        } else {
          VStack(alignment: .leading, spacing: 6) {
            ForEach(items) { item in
              taskRow(item: item, userId: snapshot.userId)
            }
          }
          Spacer(minLength: 0)
        }
      } else {
        Spacer()
        HStack {
          Spacer()
          Text("Open Cura to refresh")
            .font(.system(size: 13))
            .foregroundColor(Color(hex: "8588A3"))
          Spacer()
        }
        Spacer()
      }
    }
    .padding(12)
    .background(Color(hex: "12131A"))
    .widgetURL(URL(string: "cura://tasks"))
  }

  @ViewBuilder
  private func taskRow(item: TaskItemModel, userId: String) -> some View {
    let isCompleted = item.status == "completed"
    let deepLinkUrl = WidgetActionUrlBuilder.makeTaskToggleUrl(
      taskId: item.id,
      isCompleted: isCompleted,
      userId: userId
    )

    Link(destination: deepLinkUrl) {
      HStack(spacing: 8) {
        Text(isCompleted ? "✓" : "○")
          .font(.system(size: 13, weight: .bold))
          .foregroundColor(isCompleted ? Color(hex: "8588A3") : .white)

        Text(item.title)
          .font(.system(size: 12))
          .foregroundColor(isCompleted ? Color(hex: "8588A3") : .white)
          .strikethrough(isCompleted, color: Color(hex: "8588A3"))
          .lineLimit(1)

        Spacer()

        if item.isTimed, let dueTime = item.dueTime, !dueTime.isEmpty {
          Text(dueTime)
            .font(.system(size: 10, weight: .medium))
            .foregroundColor(Color(hex: "8588A3"))
        }
      }
    }
  }
}

// MARK: - Color Hex Initializer Extension

extension Color {
  init(hex: String) {
    let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    var int: UInt64 = 0
    Scanner(string: hex).scanHexInt64(&int)
    let a, r, g, b: UInt64
    switch hex.count {
    case 3:
      (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
    case 6:
      (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
    case 8:
      (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
    default:
      (a, r, g, b) = (255, 0, 0, 0)
    }
    self.init(
      .sRGB,
      red: Double(r) / 255,
      green: Double(g) / 255,
      blue: Double(b) / 255,
      opacity: Double(a) / 255
    )
  }
}

// MARK: - Widget Declaration

public struct CuraTasksWidget: Widget {
  public let kind: String = "CuraTasksWidget"

  public init() {}

  public var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: CuraTasksProvider()) { entry in
      CuraTasksWidgetView(entry: entry)
    }
    .configurationDisplayName("Cura Tasks")
    .description("View and track your daily Cura tasks.")
    .supportedFamilies([.systemMedium, .systemLarge])
  }
}
